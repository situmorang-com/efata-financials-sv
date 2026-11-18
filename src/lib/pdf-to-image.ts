// Turns a PDF transfer receipt (e.g. downloaded from the bank portal) into one
// JPEG, in the browser, so it is stored like a photographed proof: the upload
// endpoint then shrinks it to a small AVIF. pdf.js is loaded only when a PDF is
// picked, so it costs nothing on normal page loads.

/** Pages beyond this are left out: a transfer receipt is one page. */
const MAX_PAGES = 2;
/** Rendered width in pixels; the server caps proofs at 1200 x 1600. */
const TARGET_WIDTH = 1200;
/** A pixel this light counts as page background when trimming margins. */
const WHITE = 245;
const PADDING = 24;

export function isPdfFile(file: File): boolean {
	return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** Bounding box of the non-white content of a canvas, with some padding. */
function contentBox(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const { data } = ctx.getImageData(0, 0, width, height);
	let top = height;
	let left = width;
	let right = -1;
	let bottom = -1;
	// Every 2nd pixel is plenty to find the edges of text and lines.
	for (let y = 0; y < height; y += 2) {
		for (let x = 0; x < width; x += 2) {
			const i = (y * width + x) * 4;
			if (data[i] < WHITE || data[i + 1] < WHITE || data[i + 2] < WHITE) {
				if (y < top) top = y;
				if (y > bottom) bottom = y;
				if (x < left) left = x;
				if (x > right) right = x;
			}
		}
	}
	if (right < 0) return { x: 0, y: 0, w: width, h: height };
	const x = Math.max(0, left - PADDING);
	const y = Math.max(0, top - PADDING);
	return {
		x,
		y,
		w: Math.min(width, right + PADDING) - x,
		h: Math.min(height, bottom + PADDING) - y
	};
}

export async function pdfToImage(file: File): Promise<Blob> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const pdf = await pdfjs.getDocument({
		data: new Uint8Array(await file.arrayBuffer()),
		// Never run code found inside the PDF.
		isEvalSupported: false,
		enableXfa: false
	}).promise;

	try {
		const pages: HTMLCanvasElement[] = [];
		for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
			const page = await pdf.getPage(n);
			const base = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			// "print" renders straight through instead of waiting on animation
			// frames, so it also finishes when the tab is in the background.
			await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;

			// Drop the empty margins (most of an A4 receipt is blank paper).
			const box = contentBox(ctx, canvas.width, canvas.height);
			const cropped = document.createElement('canvas');
			cropped.width = box.w;
			cropped.height = box.h;
			cropped.getContext('2d')!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
			pages.push(cropped);
			page.cleanup();
		}
		if (pages.length === 0) throw new Error('PDF has no pages');

		// Stack the pages into one image.
		const out = document.createElement('canvas');
		out.width = Math.max(...pages.map((c) => c.width));
		out.height = pages.reduce((sum, c) => sum + c.height, 0);
		const ctx = out.getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, out.width, out.height);
		let y = 0;
		for (const c of pages) {
			ctx.drawImage(c, 0, y);
			y += c.height;
		}

		const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.9));
		if (!blob || blob.size === 0) throw new Error('Could not convert the PDF');
		return blob;
	} finally {
		await pdf.destroy();
	}
}
