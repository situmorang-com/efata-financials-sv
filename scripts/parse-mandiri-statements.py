"""Parses Mandiri (Kopra) account-statement PDFs into JSON.

    python3 -I scripts/parse-mandiri-statements.py PDF [PDF ...] > statements.json

Each statement is verified three ways before it is emitted: every line must
roll the running balance forward to the balance the bank printed, the lines
must sum to the summary's debit/credit totals, and the last balance must equal
the summary's closing balance. A statement that fails any check is reported in
its `errors` list rather than silently trusted.

Requires `pdftotext` (poppler). Word positions come from its TSV output; the
Debit/Credit/Balance columns are told apart by each amount's right edge.
"""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime

AMOUNT = re.compile(r"^-?[0-9]{1,3}(,[0-9]{3})*\.[0-9]{2}$")
MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}
FOOTER_Y = 790  # "For further questions, visit Kopra..." / "Page n of m"
BLOCK_GAP = 16  # lines inside a transaction are ~9.3pt apart, blocks ~20pt+


def words(path):
    out = subprocess.run(["pdftotext", "-tsv", path, "-"], capture_output=True, text=True, check=True).stdout
    rows = []
    for line in out.splitlines()[1:]:
        p = line.split("\t")
        if len(p) < 12 or p[0] != "5":
            continue
        rows.append(dict(page=int(p[1]), x=float(p[6]), y=float(p[7]), w=float(p[8]), t=p[11]))
    return rows


def amount(text):
    return round(float(text.replace(",", "")), 2)


def joined(ws, lo, hi):
    return " ".join(w["t"] for w in sorted(ws, key=lambda w: (w["y"], w["x"])) if lo <= w["x"] < hi)


def summary(page1):
    text = " ".join(w["t"] for w in sorted(page1, key=lambda w: (round(w["y"]), w["x"])))
    rows = {}
    for w in page1:
        if AMOUNT.match(w["t"]) and w["y"] < 280:
            rows.setdefault(round(w["y"]), []).append(w)
    first, second = (sorted(rows[y], key=lambda w: w["x"]) for y in sorted(rows)[:2])
    period = re.search(r"(\d{2} \w{3} \d{4}) - (\d{2} \w{3} \d{4})", text).groups()
    account = re.search(r"Account Name Alias (\d+)", text)
    branch = re.search(r"IDR (.+?) Opening", text)
    return dict(
        account_no=account.group(1) if account else None,
        branch=branch.group(1).strip() if branch else None,
        period_from=datetime.strptime(period[0], "%d %b %Y").date().isoformat(),
        period_to=datetime.strptime(period[1], "%d %b %Y").date().isoformat(),
        opening=amount(first[0]["t"]),
        total_debit=amount(first[-1]["t"]),
        closing=amount(second[0]["t"]),
        total_credit=amount(second[-1]["t"]),
    )


def lines(ws):
    out = []
    for page in sorted({w["page"] for w in ws}):
        pw = [w for w in ws if w["page"] == page]
        header = [w for w in pw if w["t"] == "Posting"]
        if not header:
            continue
        body = sorted((w for w in pw if header[0]["y"] + 5 < w["y"] < FOOTER_Y), key=lambda w: (w["y"], w["x"]))

        blocks, current, last_y = [], [], None
        for w in body:
            if last_y is not None and w["y"] - last_y > BLOCK_GAP:
                blocks.append(current)
                current = []
            current.append(w)
            last_y = w["y"]
        if current:
            blocks.append(current)

        for block in blocks:
            amounts = [w for w in block if AMOUNT.match(w["t"]) and w["x"] > 320]
            if not amounts:
                # Remark text that spilled past a page break belongs to the
                # previous transaction.
                if out:
                    out[-1]["remark"] = (out[-1]["remark"] + " " + joined(block, 110, 235)).strip()
                continue
            column = {}
            for w in amounts:
                right = w["x"] + w["w"]
                column["debit" if right < 420 else "credit" if right < 500 else "balance"] = amount(w["t"])
            stamp = re.search(r"(\d{2}) (\w{3}) (\d{4}), (\d{2}:\d{2}:\d{2})", joined(block, 0, 110))
            out.append(dict(
                date=f"{stamp.group(3)}-{MONTHS[stamp.group(2)]:02d}-{stamp.group(1)}" if stamp else None,
                time=stamp.group(4) if stamp else None,
                remark=re.sub(r"\s+", " ", joined(block, 110, 235)).strip(),
                reference=" ".join(w["t"] for w in block if 235 <= w["x"] < 330 and not AMOUNT.match(w["t"])).strip(),
                debit=column.get("debit", 0.0),
                credit=column.get("credit", 0.0),
                balance=column.get("balance"),
            ))
    return out


def parse(path):
    ws = words(path)
    head = summary([w for w in ws if w["page"] == 1])
    txns = lines(ws)

    errors = []
    balance = head["opening"]
    for i, t in enumerate(txns, 1):
        balance = round(balance - t["debit"] + t["credit"], 2)
        if t["date"] is None or t["balance"] is None or abs(balance - t["balance"]) > 0.005:
            errors.append(f"line {i}: running balance {balance} != printed {t['balance']}")
            balance = t["balance"] if t["balance"] is not None else balance
    debit = round(sum(t["debit"] for t in txns), 2)
    credit = round(sum(t["credit"] for t in txns), 2)
    if abs(balance - head["closing"]) > 0.005:
        errors.append(f"closing {balance} != {head['closing']}")
    if abs(debit - head["total_debit"]) > 0.005:
        errors.append(f"total debit {debit} != {head['total_debit']}")
    if abs(credit - head["total_credit"]) > 0.005:
        errors.append(f"total credit {credit} != {head['total_credit']}")

    with open(path, "rb") as fh:
        file_hash = hashlib.sha256(fh.read()).hexdigest()
    return dict(file=path.split("/")[-1], file_hash=file_hash, **head, lines=txns, errors=errors)


if __name__ == "__main__":
    statements = [parse(p) for p in sys.argv[1:]]
    statements.sort(key=lambda s: (s["account_no"] or "", s["period_from"]))
    json.dump(statements, sys.stdout, indent=1, ensure_ascii=False)
