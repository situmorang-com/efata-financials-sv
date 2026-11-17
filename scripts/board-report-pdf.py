#!/usr/bin/env python3
"""
Generates the treasurer's board packet as a PDF from data/efata.db.

This is the report the treasurer presents to the church board — distinct from
the Konferens DKI Jakarta remittance form, which is a giving register sent
upward. The board needs the fund position, whether trust money actually left,
and whether the books hold together.

Pages:
  1. Ringkasan Eksekutif      key figures + remittance status + findings
  2. Laporan Penerimaan       receipts by allocation column, per month
  3. Dana Titipan Konferens   collected vs remitted vs outstanding
  4. Dana Jemaat              fund roll-forward against the official 18 lines
  5. Register Kwitansi        every receipt with its allocation
  6. Catatan & Tanda Tangan   control findings + signature block

Setup (reportlab is not a project dependency):
    python3 -m venv .venv && .venv/bin/pip install reportlab

Usage:
    .venv/bin/python scripts/board-report-pdf.py --from 2026-01 --to 2026-03
    .venv/bin/python scripts/board-report-pdf.py --from 2026-03 --to 2026-03 \
        --out laporan-maret.pdf
"""

from __future__ import annotations

import argparse
import sqlite3
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# --- palette -----------------------------------------------------------------

INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#5c5c5c")
RULE = colors.HexColor("#c9c9c9")
BAND = colors.HexColor("#f0f0ef")
HEAD = colors.HexColor("#2c3e50")
GOOD = colors.HexColor("#1e7a3c")
WARN = colors.HexColor("#b34a00")
BAD = colors.HexColor("#a11c1c")

MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

BUCKET_ORDER = [
    "perpuluhan",
    "khusus_mission",
    "terpadu_konferens",
    "terpadu_jemaat",
    "khusus_jemaat",
]
BUCKET_LABELS = {
    "perpuluhan": "Perpuluhan",
    "khusus_mission": "Pers. Khusus (Mission)",
    "terpadu_konferens": "50% Terpadu Konferens",
    "terpadu_jemaat": "50% Terpadu Jemaat",
    "khusus_jemaat": "Pers. Khusus (Jemaat)",
}
KONFERENS_BUCKETS = ("perpuluhan", "khusus_mission", "terpadu_konferens")
JEMAAT_BUCKETS = ("terpadu_jemaat", "khusus_jemaat")


# --- helpers -----------------------------------------------------------------


def hexcolor(color: colors.Color) -> str:
    """ReportLab markup needs a leading '#'; Color.hexval() yields '0xrrggbb'."""
    return "#" + color.hexval()[2:]


def rupiah(value: int | None) -> str:
    if value is None:
        return "-"
    if value == 0:
        return "–"
    sign = "-" if value < 0 else ""
    return f"{sign}{abs(int(value)):,}".replace(",", ".")


def month_label(month_key: str) -> str:
    year, month = month_key.split("-")
    return f"{MONTH_NAMES[int(month) - 1]} {year}"


def month_range(month_key: str) -> tuple[str, str]:
    year, month = (int(part) for part in month_key.split("-"))
    last = monthrange(year, month)[1]
    return f"{month_key}-01", f"{month_key}-{last:02d}"


def months_between(start: str, end: str) -> list[str]:
    start_year, start_month = (int(p) for p in start.split("-"))
    end_year, end_month = (int(p) for p in end.split("-"))
    months: list[str] = []
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        months.append(f"{year}-{month:02d}")
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return months


def fmt_date(value: str | None) -> str:
    if not value:
        return "–"
    text = str(value)[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return text


# --- data --------------------------------------------------------------------


class Report:
    def __init__(
        self,
        db_path: Path,
        months: list[str],
        church: str,
        exclude_tags: list[str] | None = None,
    ):
        self.conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self.conn.row_factory = sqlite3.Row
        self.months = months
        self.church = church
        self.year = months[0][:4]
        # Expense notes tags to leave out (e.g. seeded test data). Any exclusion
        # is disclosed on the report itself — a financial report must never hide
        # what it left out.
        self.exclude_tags = exclude_tags or []

        self.receipts = self._load_receipts()
        self.allocations = self._load_allocations()
        self.remittances = self._load_remittances()
        self.jemaat_accounts = self._load_jemaat_accounts()
        self.jemaat_expenses = self._load_jemaat_expenses()
        self.opening_balance = self._load_opening_balance()

    def _load_receipts(self) -> dict[str, list[sqlite3.Row]]:
        by_month: dict[str, list[sqlite3.Row]] = {m: [] for m in self.months}
        placeholders = ", ".join("?" for _ in self.months)
        rows = self.conn.execute(
            f"""SELECT id, receipt_no, receipt_date, month_key, giver_name, kind,
                       total_amount, status, void_reason
                FROM receipts WHERE month_key IN ({placeholders})
                ORDER BY month_key, receipt_date, COALESCE(receipt_no, ''), id""",
            self.months,
        ).fetchall()
        for row in rows:
            by_month[row["month_key"]].append(row)
        return by_month

    def _load_allocations(self) -> dict[int, dict[str, int]]:
        placeholders = ", ".join("?" for _ in self.months)
        rows = self.conn.execute(
            f"""SELECT a.receipt_id, a.bucket, a.amount
                FROM receipt_allocations a
                JOIN receipts r ON r.id = a.receipt_id
                WHERE r.month_key IN ({placeholders})""",
            self.months,
        ).fetchall()
        result: dict[int, dict[str, int]] = {}
        for row in rows:
            result.setdefault(row["receipt_id"], {})[row["bucket"]] = row["amount"]
        return result

    def _load_remittances(self) -> dict[str, sqlite3.Row]:
        placeholders = ", ".join("?" for _ in self.months)
        rows = self.conn.execute(
            f"SELECT * FROM remittances WHERE month_key IN ({placeholders})",
            self.months,
        ).fetchall()
        return {row["month_key"]: row for row in rows}

    def _load_jemaat_accounts(self) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT id, code, name FROM jemaat_accounts WHERE is_active = 1 ORDER BY sort_order"
        ).fetchall()

    def _load_jemaat_expenses(self) -> dict[str, dict[int | None, int]]:
        """Posted expenses per month, keyed by Dana Jemaat account id."""
        result: dict[str, dict[int | None, int]] = {}
        exclude_sql = "".join(
            " AND (notes IS NULL OR notes NOT LIKE ?)" for _ in self.exclude_tags
        )
        exclude_params = tuple(f"%{tag}%" for tag in self.exclude_tags)
        for month in self.months:
            start, end = month_range(month)
            rows = self.conn.execute(
                f"""SELECT jemaat_account_id AS account_id, SUM(amount) AS total
                   FROM transactions
                   WHERE type = 'expense' AND status NOT IN ('void', 'draft')
                     AND substr(txn_date, 1, 10) BETWEEN ? AND ?
                     {exclude_sql}
                   GROUP BY jemaat_account_id""",
                (start, end) + exclude_params,
            ).fetchall()
            result[month] = {row["account_id"]: row["total"] for row in rows}
        return result

    def exclusion_note(self) -> str | None:
        """Human-readable disclosure of what was filtered out, if anything."""
        if not self.exclude_tags:
            return None
        tags = ", ".join(self.exclude_tags)
        return (
            f"Pengeluaran bertanda {tags} dikecualikan dari laporan ini "
            "(data uji coba, bukan transaksi jemaat)."
        )

    def _load_opening_balance(self) -> int:
        """Closing balance carried in from the month before the period."""
        first = self.months[0]
        year, month = (int(p) for p in first.split("-"))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        row = self.conn.execute(
            "SELECT jemaat_closing_balance FROM period_closes WHERE month_key = ?",
            (f"{year}-{month:02d}",),
        ).fetchone()
        return int(row["jemaat_closing_balance"]) if row else 0

    # -- derived figures --

    def live_receipts(self, month: str) -> list[sqlite3.Row]:
        return [r for r in self.receipts[month] if r["status"] != "void"]

    def buckets(self, month: str) -> dict[str, int]:
        totals = {bucket: 0 for bucket in BUCKET_ORDER}
        for receipt in self.live_receipts(month):
            for bucket, amount in self.allocations.get(receipt["id"], {}).items():
                totals[bucket] += amount
        return totals

    def jumlah(self, month: str) -> int:
        return sum(r["total_amount"] for r in self.live_receipts(month))

    def konferens_due(self, month: str) -> int:
        totals = self.buckets(month)
        return sum(totals[b] for b in KONFERENS_BUCKETS)

    def jemaat_income(self, month: str) -> int:
        totals = self.buckets(month)
        return sum(totals[b] for b in JEMAAT_BUCKETS)

    def jemaat_expense(self, month: str) -> int:
        return sum(self.jemaat_expenses[month].values())

    def cross_foot_ok(self, month: str) -> bool:
        return sum(self.buckets(month).values()) == self.jumlah(month)

    def roll_forward(self) -> list[dict]:
        rows = []
        balance = self.opening_balance
        for month in self.months:
            opening = balance
            income = self.jemaat_income(month)
            expense = self.jemaat_expense(month)
            balance = opening + income - expense
            rows.append(
                {
                    "month": month,
                    "opening": opening,
                    "income": income,
                    "expense": expense,
                    "closing": balance,
                }
            )
        return rows

    def receipt_number_gaps(self) -> list[str]:
        """Breaks in the numbered kwitansi run, including voided receipts."""
        numbers = sorted(
            int(r["receipt_no"])
            for month in self.months
            for r in self.receipts[month]
            if r["receipt_no"] and str(r["receipt_no"]).isdigit()
        )
        missing: list[str] = []
        for previous, current in zip(numbers, numbers[1:]):
            if 1 < current - previous <= 50:
                missing.extend(str(n) for n in range(previous + 1, current))
        return missing

    def unnumbered(self) -> list[sqlite3.Row]:
        return [
            r
            for month in self.months
            for r in self.receipts[month]
            if not r["receipt_no"]
        ]

    def voided(self) -> list[sqlite3.Row]:
        return [
            r
            for month in self.months
            for r in self.receipts[month]
            if r["status"] == "void"
        ]

    def unclassified_expense(self) -> int:
        return sum(
            self.jemaat_expenses[month].get(None, 0) for month in self.months
        )

    def findings(self) -> list[tuple[str, str]]:
        """(severity, message) — the controls a board should be told about."""
        items: list[tuple[str, str]] = []

        for month in self.months:
            if not self.cross_foot_ok(month):
                diff = sum(self.buckets(month).values()) - self.jumlah(month)
                items.append(
                    ("bad", f"{month_label(month)}: alokasi tidak seimbang, selisih {rupiah(diff)}.")
                )

        for month in self.months:
            due = self.konferens_due(month)
            remittance = self.remittances.get(month)
            if due == 0:
                continue
            if remittance is None:
                items.append(
                    ("bad", f"{month_label(month)}: belum ada catatan pengiriman ke Konferens ({rupiah(due)}).")
                )
                continue
            status = remittance["status"]
            if status == "draft":
                items.append(
                    ("warn", f"{month_label(month)}: kiriman {rupiah(due)} belum dicatat tanggal & bukti pengirimannya.")
                )
            elif status == "sent" and not remittance["konferens_receipt_no"]:
                items.append(
                    ("warn", f"{month_label(month)}: sudah dikirim, menunggu nomor receipt dari Konferens.")
                )
            if remittance["total_amount"] != due:
                items.append(
                    ("bad", f"{month_label(month)}: kiriman {rupiah(remittance['total_amount'])} ≠ Dana Mission Sedunia {rupiah(due)}.")
                )

        gaps = self.receipt_number_gaps()
        if gaps:
            items.append(
                ("warn", f"Nomor kwitansi tidak berurutan: {', '.join(gaps)}. Perlu keterangan (kwitansi dibatalkan?).")
            )

        unnumbered = self.unnumbered()
        if unnumbered:
            detail = "; ".join(
                f"{r['giver_name']} {rupiah(r['total_amount'])}" for r in unnumbered
            )
            items.append(("warn", f"{len(unnumbered)} kwitansi tanpa nomor: {detail}."))

        unclassified = self.unclassified_expense()
        if unclassified:
            items.append(
                ("warn", f"Pengeluaran {rupiah(unclassified)} belum diklasifikasi ke pos Dana Jemaat.")
            )

        rows = self.roll_forward()
        if rows and rows[-1]["closing"] < 0:
            items.append(("bad", f"Saldo akhir Dana Jemaat negatif: {rupiah(rows[-1]['closing'])}."))

        if all(row["expense"] == 0 for row in rows):
            items.append(
                ("warn", "Tidak ada pengeluaran Dana Jemaat tercatat pada periode ini — mohon dikonfirmasi apakah memang nihil.")
            )

        if not items:
            items.append(("good", "Tidak ada temuan pengendalian pada periode ini."))
        return items


# --- layout ------------------------------------------------------------------

PAGE = landscape(A4)
MARGIN = 14 * mm
CONTENT_WIDTH = PAGE[0] - 2 * MARGIN


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=17, leading=21, textColor=INK, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, leading=14, textColor=MUTED, alignment=TA_CENTER,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12, leading=15, textColor=HEAD, spaceBefore=8, spaceAfter=5,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"], fontName="Helvetica-Bold",
            fontSize=9.5, leading=12, textColor=INK, spaceBefore=6, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, leading=12.5, textColor=INK,
        ),
        "note": ParagraphStyle(
            "note", parent=base["Normal"], fontName="Helvetica",
            fontSize=8, leading=11, textColor=MUTED,
        ),
        "cell": ParagraphStyle(
            "cell", parent=base["Normal"], fontName="Helvetica",
            fontSize=8, leading=10.5, textColor=INK,
        ),
        "num": ParagraphStyle(
            "num", parent=base["Normal"], fontName="Helvetica",
            fontSize=8, leading=10.5, textColor=INK, alignment=TA_RIGHT,
        ),
    }


def table_style(header_rows: int = 1, total_row: bool = False, ncols: int = 0) -> TableStyle:
    commands = [
        ("FONTNAME", (0, 0), (-1, header_rows - 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, header_rows - 1), colors.white),
        ("BACKGROUND", (0, 0), (-1, header_rows - 1), HEAD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, header_rows - 1), (-1, header_rows - 1), 0.6, HEAD),
        ("GRID", (0, header_rows), (-1, -1), 0.25, RULE),
        ("ROWBACKGROUNDS", (0, header_rows), (-1, -2 if total_row else -1),
         [colors.white, BAND]),
    ]
    if total_row:
        commands += [
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e2e6ea")),
            ("LINEABOVE", (0, -1), (-1, -1), 0.8, HEAD),
        ]
    return TableStyle(commands)


def kpi_row(items: list[tuple[str, str, colors.Color]]) -> Table:
    """A row of headline figures."""
    cells = []
    for label, value, tone in items:
        cells.append(
            [
                [
                    Paragraph(
                        f'<font size=7.5 color="#5c5c5c">{label}</font>',
                        ParagraphStyle("k", fontName="Helvetica", fontSize=7.5, leading=10),
                    )
                ],
                [
                    Paragraph(
                        f'<font size=14 color="{hexcolor(tone)}"><b>{value}</b></font>',
                        ParagraphStyle("v", fontName="Helvetica-Bold", fontSize=14, leading=17),
                    )
                ],
            ]
        )
    width = CONTENT_WIDTH / len(cells)
    table = Table([[Table(cell, colWidths=[width - 10]) for cell in cells]],
                  colWidths=[width] * len(cells))
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOX", (0, 0), (-1, -1), 0.4, RULE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fafafa")),
            ]
        )
    )
    return table


class BoardReportDoc(BaseDocTemplate):
    def __init__(self, path: str, report: Report, period_label: str):
        super().__init__(
            path,
            pagesize=PAGE,
            leftMargin=MARGIN,
            rightMargin=MARGIN,
            topMargin=MARGIN,
            bottomMargin=16 * mm,
            title=f"Laporan Bendahara {report.church} — {period_label}",
            author=report.church,
            subject="Laporan Bendahara untuk Rapat Majelis",
        )
        self.report = report
        self.period_label = period_label
        frame = Frame(
            MARGIN, 16 * mm, CONTENT_WIDTH,
            PAGE[1] - MARGIN - 16 * mm, id="body",
        )
        self.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=self._decorate)])

    def _decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(
            MARGIN, 10 * mm,
            f"{self.report.church} — Laporan Bendahara {self.period_label}",
        )
        canvas.drawRightString(PAGE[0] - MARGIN, 10 * mm, f"Halaman {doc.page}")
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN, 13 * mm, PAGE[0] - MARGIN, 13 * mm)
        canvas.restoreState()


# --- page builders -----------------------------------------------------------


def page_summary(report: Report, styles) -> list:
    story = [
        Paragraph(f"LAPORAN BENDAHARA — {report.church.upper()}", styles["title"]),
        Paragraph(
            f"Untuk Rapat Majelis Jemaat &nbsp;·&nbsp; Periode {report.period_label}"
            f" &nbsp;·&nbsp; Dicetak {date.today().strftime('%d %B %Y')}",
            styles["subtitle"],
        ),
        Spacer(1, 10),
    ]

    jumlah = sum(report.jumlah(m) for m in report.months)
    konferens = sum(report.konferens_due(m) for m in report.months)
    jemaat_in = sum(report.jemaat_income(m) for m in report.months)
    rows = report.roll_forward()
    closing = rows[-1]["closing"] if rows else 0

    story.append(
        kpi_row(
            [
                ("TOTAL PENERIMAAN", rupiah(jumlah), INK),
                ("DANA TITIPAN → KONFERENS", rupiah(konferens), HEAD),
                ("DANA JEMAAT DITERIMA", rupiah(jemaat_in), HEAD),
                ("SALDO AKHIR DANA JEMAAT", rupiah(closing), GOOD if closing >= 0 else BAD),
            ]
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "Perpuluhan dan bagian Konferens dari persembahan terpadu <b>bukan milik jemaat</b>; "
            "dana tersebut dititipkan dan wajib diteruskan ke GMAHK Konferens DKI Jakarta &amp; Sekitarnya. "
            "Hanya Dana Jemaat yang dapat dibelanjakan atas persetujuan majelis.",
            styles["note"],
        )
    )

    note = report.exclusion_note()
    if note:
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(f'<font color="{hexcolor(WARN)}"><b>Catatan cakupan data:</b></font> {note}',
                      styles["note"])
        )

    story.append(Paragraph("Ringkasan per Bulan", styles["h2"]))
    header = ["Bulan", "Jumlah Penerimaan", "Dana Titipan\n(Konferens)", "Dana Jemaat",
              "Pengeluaran\nJemaat", "Saldo Akhir\nJemaat", "Cross-foot"]
    data = [header]
    for row in rows:
        month = row["month"]
        data.append(
            [
                month_label(month),
                rupiah(report.jumlah(month)),
                rupiah(report.konferens_due(month)),
                rupiah(row["income"]),
                rupiah(row["expense"]),
                rupiah(row["closing"]),
                "Seimbang" if report.cross_foot_ok(month) else "TIDAK SEIMBANG",
            ]
        )
    data.append(
        [
            "TOTAL",
            rupiah(jumlah),
            rupiah(konferens),
            rupiah(jemaat_in),
            rupiah(sum(r["expense"] for r in rows)),
            rupiah(closing),
            "",
        ]
    )
    widths = [42 * mm, 40 * mm, 40 * mm, 38 * mm, 38 * mm, 38 * mm, 32 * mm]
    table = Table(data, colWidths=widths, repeatRows=1)
    style = table_style(total_row=True)
    for index, row in enumerate(rows, start=1):
        ok = report.cross_foot_ok(row["month"])
        style.add("TEXTCOLOR", (6, index), (6, index), GOOD if ok else BAD)
    style.add("ALIGN", (6, 1), (6, -1), "CENTER")
    table.setStyle(style)
    story.append(table)

    story.append(Paragraph("Temuan & Hal yang Perlu Keputusan Majelis", styles["h2"]))
    findings = report.findings()
    tone_map = {"good": GOOD, "warn": WARN, "bad": BAD}
    marker = {"good": "✓", "warn": "!", "bad": "▲"}
    data = []
    for severity, message in findings:
        data.append(
            [
                Paragraph(
                    f'<font color="{hexcolor(tone_map[severity])}"><b>{marker[severity]}</b></font>',
                    styles["cell"],
                ),
                Paragraph(message, styles["cell"]),
            ]
        )
    table = Table(data, colWidths=[8 * mm, CONTENT_WIDTH - 8 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, RULE),
            ]
        )
    )
    story.append(table)
    return story


def page_receipts(report: Report, styles) -> list:
    story = [
        Paragraph("1. Laporan Penerimaan menurut Pos Alokasi", styles["h2"]),
        Paragraph(
            "Setiap kwitansi dibagi ke lima pos sesuai ketentuan: perpuluhan 100% Konferens, "
            "persembahan terpadu 50% Konferens / 50% jemaat, persembahan khusus 100% jemaat.",
            styles["note"],
        ),
        Spacer(1, 5),
    ]

    header = ["Bulan", "Jumlah\nKwitansi", "Jumlah\nPenerimaan"] + [
        BUCKET_LABELS[b].replace(" (", "\n(") for b in BUCKET_ORDER
    ]
    data = [header]
    totals = {bucket: 0 for bucket in BUCKET_ORDER}
    count_total = 0
    jumlah_total = 0

    for month in report.months:
        buckets = report.buckets(month)
        count = len(report.live_receipts(month))
        jumlah = report.jumlah(month)
        count_total += count
        jumlah_total += jumlah
        row = [month_label(month), str(count), rupiah(jumlah)]
        for bucket in BUCKET_ORDER:
            totals[bucket] += buckets[bucket]
            row.append(rupiah(buckets[bucket]))
        data.append(row)

    data.append(
        ["TOTAL", str(count_total), rupiah(jumlah_total)]
        + [rupiah(totals[b]) for b in BUCKET_ORDER]
    )

    widths = [34 * mm, 20 * mm, 34 * mm, 32 * mm, 34 * mm, 36 * mm, 34 * mm, 34 * mm]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(table_style(total_row=True))
    story.append(table)

    story.append(Paragraph("Pembagian Dana Titipan dan Dana Jemaat", styles["h3"]))
    konferens = sum(totals[b] for b in KONFERENS_BUCKETS)
    jemaat = sum(totals[b] for b in JEMAAT_BUCKETS)
    split = Table(
        [
            ["Dana Mission Sedunia (diteruskan ke Konferens)", rupiah(konferens),
             f"{konferens / jumlah_total * 100:.1f}%" if jumlah_total else "–"],
            ["Dana Jemaat (dikelola jemaat)", rupiah(jemaat),
             f"{jemaat / jumlah_total * 100:.1f}%" if jumlah_total else "–"],
            ["Jumlah", rupiah(konferens + jemaat), "100,0%" if jumlah_total else "–"],
        ],
        colWidths=[110 * mm, 45 * mm, 30 * mm],
    )
    split.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.25, RULE),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, -1), (-1, -1), BAND),
            ]
        )
    )
    story.append(split)
    return story


def page_remittance(report: Report, styles) -> list:
    story = [
        Paragraph("2. Dana Titipan — Pengiriman ke Konferens DKI Jakarta", styles["h2"]),
        Paragraph(
            "Pos ini seharusnya kembali nol setiap bulan setelah pengiriman. Saldo yang tersisa "
            "berarti dana milik Konferens masih berada di rekening jemaat.",
            styles["note"],
        ),
        Spacer(1, 5),
    ]

    header = ["Bulan", "Perpuluhan", "Pers. Khusus\n(Mission)", "50% Terpadu\nKonferens",
              "Jumlah\nHarus Dikirim", "Sudah\nDikirim", "Belum\nDikirim",
              "Tgl Kirim", "Cara", "No. Receipt\nKonferens", "Status"]
    data = [header]
    due_total = sent_total = 0

    for month in report.months:
        buckets = report.buckets(month)
        due = report.konferens_due(month)
        remittance = report.remittances.get(month)
        sent = remittance["total_amount"] if remittance else 0
        status = remittance["status"] if remittance else "belum dicatat"
        due_total += due
        sent_total += sent
        data.append(
            [
                month_label(month),
                rupiah(buckets["perpuluhan"]),
                rupiah(buckets["khusus_mission"]),
                rupiah(buckets["terpadu_konferens"]),
                rupiah(due),
                rupiah(sent),
                rupiah(due - sent),
                fmt_date(remittance["sent_date"] if remittance else None),
                (remittance["method"] or "–") if remittance else "–",
                (remittance["konferens_receipt_no"] or "–") if remittance else "–",
                status,
            ]
        )

    data.append(
        ["TOTAL", "", "", "", rupiah(due_total), rupiah(sent_total),
         rupiah(due_total - sent_total), "", "", "", ""]
    )

    widths = [26 * mm, 27 * mm, 24 * mm, 26 * mm, 28 * mm, 26 * mm, 24 * mm,
              22 * mm, 15 * mm, 24 * mm, 22 * mm]
    table = Table(data, colWidths=widths, repeatRows=1)
    style = table_style(total_row=True)
    style.add("ALIGN", (7, 1), (-1, -1), "CENTER")
    for index, month in enumerate(report.months, start=1):
        remittance = report.remittances.get(month)
        outstanding = report.konferens_due(month) - (
            remittance["total_amount"] if remittance else 0
        )
        style.add("TEXTCOLOR", (6, index), (6, index), BAD if outstanding else GOOD)
        if remittance and remittance["status"] == "acknowledged":
            style.add("TEXTCOLOR", (10, index), (10, index), GOOD)
        else:
            style.add("TEXTCOLOR", (10, index), (10, index), WARN)
    table.setStyle(style)
    story.append(table)

    outstanding = due_total - sent_total
    if outstanding:
        story.append(Spacer(1, 6))
        story.append(
            Paragraph(
                f'<font color="{hexcolor(BAD)}"><b>Perhatian:</b></font> '
                f"{rupiah(outstanding)} dana titipan Konferens belum tercatat sebagai terkirim.",
                styles["body"],
            )
        )
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "Bukti pengiriman (transfer atau kwitansi Konferens) wajib dilampirkan pada berkas "
            "bendahara untuk setiap bulan di atas.",
            styles["note"],
        )
    )
    return story


def page_jemaat(report: Report, styles) -> list:
    story = [
        Paragraph("3. Dana Jemaat — Penerimaan, Pengeluaran, dan Saldo", styles["h2"]),
        Paragraph(
            "Pos pengeluaran mengikuti daftar resmi pada formulir Konferens DKI Jakarta.",
            styles["note"],
        ),
        Spacer(1, 5),
    ]

    rows = report.roll_forward()
    header = ["Uraian"] + [month_label(m) for m in report.months] + ["Jumlah"]

    data = [header]
    data.append(
        ["Saldo Dana Jemaat bulan lalu"]
        + [rupiah(r["opening"]) for r in rows]
        + [rupiah(rows[0]["opening"] if rows else 0)]
    )
    data.append(
        ["Uang jemaat yang masuk"]
        + [rupiah(r["income"]) for r in rows]
        + [rupiah(sum(r["income"] for r in rows))]
    )
    data.append(
        ["Jumlah tersedia"]
        + [rupiah(r["opening"] + r["income"]) for r in rows]
        + [rupiah((rows[0]["opening"] if rows else 0) + sum(r["income"] for r in rows))]
    )

    account_rows = []
    for account in report.jemaat_accounts:
        per_month = [
            report.jemaat_expenses[m].get(account["id"], 0) for m in report.months
        ]
        account_rows.append((account["name"], per_month, sum(per_month)))

    for name, per_month, total in account_rows:
        data.append([f"   {name}"] + [rupiah(v) for v in per_month] + [rupiah(total)])

    unclassified = [report.jemaat_expenses[m].get(None, 0) for m in report.months]
    if any(unclassified):
        data.append(
            ["   (belum diklasifikasi)"]
            + [rupiah(v) for v in unclassified]
            + [rupiah(sum(unclassified))]
        )

    data.append(
        ["Jumlah pengeluaran"]
        + [rupiah(r["expense"]) for r in rows]
        + [rupiah(sum(r["expense"] for r in rows))]
    )
    data.append(
        ["SALDO AKHIR DANA JEMAAT"]
        + [rupiah(r["closing"]) for r in rows]
        + [rupiah(rows[-1]["closing"] if rows else 0)]
    )

    month_width = min(32 * mm, (CONTENT_WIDTH - 80 * mm) / (len(report.months) + 1))
    widths = [CONTENT_WIDTH - month_width * (len(report.months) + 1)] + [
        month_width
    ] * (len(report.months) + 1)

    table = Table(data, colWidths=widths, repeatRows=1)
    style = TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 0), (-1, 0), HEAD),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("GRID", (0, 1), (-1, -1), 0.25, RULE),
            # roll-forward header block
            ("FONTNAME", (0, 1), (-1, 3), "Helvetica-Bold"),
            ("BACKGROUND", (0, 1), (-1, 3), colors.HexColor("#eef2f5")),
            # expense lines
            ("ROWBACKGROUNDS", (0, 4), (-1, -3), [colors.white, BAND]),
            # totals
            ("FONTNAME", (0, -2), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -2), (-1, -2), colors.HexColor("#e2e6ea")),
            ("BACKGROUND", (0, -1), (-1, -1), HEAD),
            ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
            ("LINEABOVE", (0, -2), (-1, -2), 0.8, HEAD),
        ]
    )
    table.setStyle(style)
    story.append(table)

    note = report.exclusion_note()
    if note:
        story.append(Spacer(1, 5))
        story.append(
            Paragraph(f'<font color="{hexcolor(WARN)}"><b>Catatan cakupan data:</b></font> {note}',
                      styles["note"])
        )

    if all(r["expense"] == 0 for r in rows):
        story.append(Spacer(1, 6))
        story.append(
            Paragraph(
                f'<font color="{hexcolor(WARN)}"><b>Catatan:</b></font> '
                "belum ada pengeluaran Dana Jemaat yang tercatat pada periode ini. "
                "Bila terdapat pembayaran listrik, air, atau bantuan yang belum dibukukan, "
                "saldo akhir di atas akan berubah.",
                styles["body"],
            )
        )
    return story


def page_register(report: Report, styles) -> list:
    story = [
        Paragraph("4. Register Kwitansi", styles["h2"]),
        Paragraph(
            "Daftar lengkap penerimaan sebagai lampiran pendukung. Kwitansi yang dibatalkan "
            "tetap dicantumkan agar nomor urut dapat dipertanggungjawabkan.",
            styles["note"],
        ),
        Spacer(1, 5),
    ]

    header = ["Tgl", "No. Kwitansi", "Nama Pemberi", "Jumlah", "Perpuluhan",
              "Khusus\nMission", "50% Terpadu\nKonferens", "50% Terpadu\nJemaat",
              "Pers. Khusus\nJemaat"]
    widths = [20 * mm, 26 * mm, 62 * mm, 28 * mm, 28 * mm, 24 * mm, 28 * mm, 28 * mm, 28 * mm]

    for month in report.months:
        data = [header]
        void_rows: list[int] = []
        buckets_total = {b: 0 for b in BUCKET_ORDER}
        jumlah_total = 0

        for receipt in report.receipts[month]:
            allocation = report.allocations.get(receipt["id"], {})
            is_void = receipt["status"] == "void"
            name = receipt["giver_name"]
            if is_void:
                void_rows.append(len(data))
                name = f"{name} — DIBATALKAN ({receipt['void_reason'] or 'tanpa keterangan'})"
            else:
                jumlah_total += receipt["total_amount"]
                for bucket in BUCKET_ORDER:
                    buckets_total[bucket] += allocation.get(bucket, 0)

            data.append(
                [
                    fmt_date(receipt["receipt_date"])[:5],
                    receipt["receipt_no"] or "(tanpa no.)",
                    Paragraph(name, styles["cell"]),
                    "–" if is_void else rupiah(receipt["total_amount"]),
                ]
                + ["–" if is_void else rupiah(allocation.get(b, 0)) for b in BUCKET_ORDER]
            )

        data.append(
            ["", "", "JUMLAH", rupiah(jumlah_total)]
            + [rupiah(buckets_total[b]) for b in BUCKET_ORDER]
        )

        table = Table(data, colWidths=widths, repeatRows=1)
        style = table_style(total_row=True)
        style.add("ALIGN", (0, 1), (1, -1), "LEFT")
        style.add("ALIGN", (2, 0), (2, -1), "LEFT")
        for row_index in void_rows:
            style.add("TEXTCOLOR", (0, row_index), (-1, row_index), MUTED)
        table.setStyle(style)

        story.append(
            KeepTogether(
                [Paragraph(month_label(month), styles["h3"]), table, Spacer(1, 7)]
            )
        )
    return story


def page_signatures(report: Report, styles) -> list:
    story = [
        Paragraph("5. Catatan Pengendalian Internal", styles["h2"]),
    ]

    checks = [
        (
            "Silang jumlah (cross-foot)",
            "Seluruh bulan seimbang"
            if all(report.cross_foot_ok(m) for m in report.months)
            else "Terdapat bulan yang tidak seimbang",
            all(report.cross_foot_ok(m) for m in report.months),
        ),
        (
            "Kelengkapan nomor kwitansi",
            "Berurutan tanpa putus"
            if not report.receipt_number_gaps()
            else f"Nomor hilang: {', '.join(report.receipt_number_gaps())}",
            not report.receipt_number_gaps(),
        ),
        (
            "Kwitansi tanpa nomor",
            "Tidak ada" if not report.unnumbered() else f"{len(report.unnumbered())} kwitansi",
            not report.unnumbered(),
        ),
        (
            "Klasifikasi pengeluaran",
            "Seluruhnya terklasifikasi"
            if not report.unclassified_expense()
            else f"{rupiah(report.unclassified_expense())} belum terklasifikasi",
            not report.unclassified_expense(),
        ),
        (
            "Pengiriman dana titipan",
            "Seluruh bulan sudah dikirim & diakui Konferens"
            if all(
                (r := report.remittances.get(m)) and r["status"] == "acknowledged"
                for m in report.months
            )
            else "Terdapat bulan yang belum lengkap buktinya",
            all(
                (r := report.remittances.get(m)) and r["status"] == "acknowledged"
                for m in report.months
            ),
        ),
    ]

    data = [["Pemeriksaan", "Hasil", ""]]
    for label, result, ok in checks:
        data.append([label, result, "OK" if ok else "PERLU TINDAKAN"])

    table = Table(data, colWidths=[62 * mm, CONTENT_WIDTH - 62 * mm - 32 * mm, 32 * mm],
                  repeatRows=1)
    style = table_style()
    style.add("ALIGN", (1, 0), (1, -1), "LEFT")
    style.add("ALIGN", (2, 0), (2, -1), "CENTER")
    for index, (_, _, ok) in enumerate(checks, start=1):
        style.add("TEXTCOLOR", (2, index), (2, index), GOOD if ok else BAD)
        style.add("FONTNAME", (2, index), (2, index), "Helvetica-Bold")
    table.setStyle(style)
    story.append(table)

    story.append(Spacer(1, 14))
    story.append(Paragraph("Pengesahan", styles["h2"]))
    story.append(
        Paragraph(
            "Laporan ini disusun dari catatan kwitansi dan buku bank jemaat, dan diserahkan "
            "kepada majelis untuk diperiksa dan disahkan.",
            styles["body"],
        )
    )
    story.append(Spacer(1, 18))

    signers = ["Bendahara Jemaat", "Ketua Bidang Keuangan Jemaat", "Gembala Jemaat"]
    cells = [
        [
            [Paragraph("—" * 26, styles["note"])],
            [Paragraph(f"<b>{role}</b>", styles["cell"])],
            [Paragraph("Tanggal: ......................", styles["note"])],
        ]
        for role in signers
    ]
    width = CONTENT_WIDTH / len(signers)
    table = Table([[Table(cell, colWidths=[width - 14]) for cell in cells]],
                  colWidths=[width] * len(signers))
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("TOPPADDING", (0, 0), (-1, -1), 22),
            ]
        )
    )
    story.append(table)
    return story


# --- main --------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="start", required=True, help="bulan awal, YYYY-MM")
    parser.add_argument("--to", dest="end", help="bulan akhir, YYYY-MM (default = --from)")
    parser.add_argument("--db", default="data/efata.db", help="path ke SQLite database")
    parser.add_argument("--out", help="berkas PDF keluaran")
    parser.add_argument("--church", default="GMAHK Efata", help="nama jemaat")
    parser.add_argument(
        "--exclude-tag",
        action="append",
        default=[],
        metavar="TAG",
        help="kecualikan pengeluaran yang catatannya memuat TAG "
        "(mis. [DUMMY_FINANCE_V1]); pengecualian dicantumkan pada laporan",
    )
    args = parser.parse_args()

    end = args.end or args.start
    months = months_between(args.start, end)
    if not months:
        parser.error("--from must not be after --to")

    db_path = Path(args.db)
    if not db_path.exists():
        parser.error(f"database not found: {db_path}")

    report = Report(db_path, months, args.church, exclude_tags=args.exclude_tag)
    report.period_label = (
        month_label(months[0])
        if len(months) == 1
        else f"{month_label(months[0])} – {month_label(months[-1])}"
    )

    out = Path(
        args.out
        or f"laporan-bendahara-{months[0]}"
        + ("" if len(months) == 1 else f"-sd-{months[-1]}")
        + ".pdf"
    )

    styles = make_styles()
    doc = BoardReportDoc(str(out), report, report.period_label)

    story: list = []
    story += page_summary(report, styles)
    story.append(PageBreak())
    story += page_receipts(report, styles)
    story.append(PageBreak())
    story += page_remittance(report, styles)
    story.append(PageBreak())
    story += page_jemaat(report, styles)
    story.append(PageBreak())
    story += page_register(report, styles)
    story.append(PageBreak())
    story += page_signatures(report, styles)

    doc.build(story)
    print(f"Wrote {out} ({out.stat().st_size:,} bytes) for {report.period_label}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
