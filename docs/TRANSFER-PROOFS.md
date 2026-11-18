# Transfer proofs: from photo or PDF to a few-KB image

Every transfer on a batch can carry a proof: a photo or screenshot of the bank
transfer, or the PDF receipt the bank portal (Kopra) gives. Whatever comes in is
stored as **one small AVIF image**, usually a few KB to a few tens of KB, small
enough to keep hundreds on the server volume and to open quickly from the
WhatsApp link sent to the recipient.

The work is split between the browser (turn anything into a reasonable JPEG) and
the server (cap the size and encode AVIF).

```
 photo / screenshot ──► shrink to 70% ──┐
                        JPEG q0.85      │
                                        ├──► POST raw bytes ──► sharp: fit 1200×1600 ──► .avif in data/proofs/
 PDF receipt ──► pdf.js render ──► trim │      (image/jpeg)        AVIF quality 30
                 1200 px wide    blank  │
                 (max 2 pages)   paper ─┘
                                 JPEG q0.9
```

## 1. In the browser

Code: `src/lib/components/TransferProof.svelte` (`handleFileSelected`) and
`src/lib/pdf-to-image.ts`.

The file input accepts `image/*,application/pdf,.pdf`. It has no `capture`
attribute, so a phone offers camera, photo library *and* files.

### Photos and screenshots: `prepareImage`

1. Load the file into an `<img>` (the browser applies the photo's EXIF rotation).
2. Draw it on a canvas at **70% of its width and height** (about half the pixels).
3. Export the canvas as **JPEG, quality 0.85**.

This mostly saves upload time on phones: a 4–12 MB camera photo becomes a JPEG of
a few hundred KB before it leaves the device. If the canvas fails to produce a
file, the original is sent and the server still shrinks it.

### PDF receipts: `pdfToImage`

The server's image library (sharp's prebuilt libvips) cannot read PDF, so the
browser renders it with **pdf.js** (`pdfjs-dist`, pinned at 4.10.38):

1. pdf.js is imported **only when a PDF is picked** (`await import('pdfjs-dist')`
   plus its worker via `?url`), so normal page loads don't download it.
2. The PDF is opened with `isEvalSupported: false` and `enableXfa: false`, so no
   code inside the PDF can run.
3. At most the **first 2 pages** are rendered (a receipt is one page), each scaled to
   **1200 px wide** on a white canvas, using the `print` intent. (The default
   `display` intent waits on `requestAnimationFrame`, which never fires in a
   background tab, so the conversion would hang there.)
4. **Trim the blank paper:** scan every 2nd pixel for anything darker than
   245/255 in any channel, take the bounding box of that content, add 24 px of
   padding and crop to it. Most of an A4 receipt page is empty, so this removes
   most of the pixels and the receipt keeps its full sharpness.
5. Stack the trimmed pages into one canvas and export **JPEG, quality 0.9**.
   The intermediate quality is high on purpose: the real compression happens once,
   on the server, so text isn't compressed twice.

Measured on a one-page test receipt: 1200 × 1697 page → **496 × 354** after
trimming → 36 KB JPEG upload → **9.2 KB** AVIF stored. Converting took under
100 ms.

### The upload

`POST /api/batches/<batch>/items/<item>/proof` with the raw bytes as the body and
`Content-Type: image/jpeg`. No base64, so nothing is inflated by a third. (The
route still accepts the old JSON `{ proof: "data:image/...;base64,..." }` body.)

## 2. On the server

Code: `src/routes/api/batches/[id]/items/[itemId]/proof/+server.ts`.

```ts
sharp(rawBuffer)
  .resize(1200, 1600, { fit: 'inside', withoutEnlargement: true })
  .avif({ quality: 30 })
  .toBuffer();
```

- **Size cap:** fit inside 1200 × 1600, keeping the aspect ratio and never
  enlarging a small image. That's enough to read any bank screenshot or receipt.
- **AVIF at quality 30:** AVIF compresses far better than JPEG or WebP at low
  quality settings; flat backgrounds and dark text (what a transfer proof is) stay
  readable at quality 30 where a JPEG of the same size would show blocks.
- **No metadata:** sharp drops EXIF and other metadata by default, so camera,
  GPS and date info from a phone photo are not stored.

The file is written to `<DATA_DIR>/proofs/` (in production the `/app/data`
volume, which Coolify backs up nightly) under a readable name built from the
batch description, batch name and recipient, e.g.
`Transport-Zoom-Transfer-Oktober-2026-Budi-Santoso.avif`. The row's
`transfer_proof` column holds the filename and the row is marked transferred.
Replacing a proof removes the old file when no other row uses it.

## 3. Serving it

`GET …/proof?format=image` returns the stored file with `Content-Type: image/avif`
and a one-day cache. This one route is public (see `PUBLIC_GET_PATHS` in
`src/hooks.server.ts`) because the link goes into the WhatsApp message to the
recipient; every other route needs a signed-in user. All current browsers,
including on phones, display AVIF.

## Other proof uploads

| Upload | Where | Size cap | Format |
| --- | --- | --- | --- |
| Transfer proof (one row) | `api/batches/[id]/items/[itemId]/proof` | 1200 × 1600 | AVIF q30 |
| Transfer proof (family, one transfer) | `api/batches/[id]/family-transfer` | 1200 × 1600 | AVIF q30 |
| Board approval proof | `src/lib/server/approval-proof.ts` | 1400 × 1800 | WebP q72 |

Only the single-row transfer proof accepts PDFs; the others still take images
only.

## Changing it

- **Smaller files:** lower the AVIF quality (25 is still readable for typed
  text) or the size cap. Check on a real receipt before shipping: thin fonts go
  first.
- **pdf.js version:** stay on 4.10.38 while the Docker image runs Node 20.
  5.6.83 up to 6.2.107 carry a code-execution advisory
  ([GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j)),
  and 6.x requires Node 22.13 or later. Moving to Node 22 in the `Dockerfile`
  opens the way to the current 6.x.
