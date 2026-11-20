// Turns a picked receipt (photo, screenshot or PDF) into the image that is
// uploaded as transfer proof. Runs in the browser; the server then caps it at
// 1200 x 1600 and stores it as a small AVIF.
import { isPdfFile, pdfToImage } from './pdf-to-image.js';

/** A photo shrunk to 70% as JPEG; the original when the browser can't encode. */
function shrinkPhoto(file: File): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new window.Image();
		const url = URL.createObjectURL(file);
		img.onload = async () => {
			URL.revokeObjectURL(url);
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(img.width * 0.7);
			canvas.height = Math.round(img.height * 0.7);
			canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
			resolve(blob && blob.size > 0 ? blob : file);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};
		img.src = url;
	});
}

/** A PDF receipt becomes one trimmed image; a photo is shrunk. */
export function prepareProofImage(file: File): Promise<Blob> {
	return isPdfFile(file) ? pdfToImage(file) : shrinkPhoto(file);
}
