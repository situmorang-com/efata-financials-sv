import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import { batchDb, batchItemDb, saveProofFile, readProofFile, deleteProofFile } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

function filenamePart(value: string): string {
	return value
		.trim()
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

// Upload transfer proof — server-side compression to WebP via sharp
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const contentType = request.headers.get('content-type') || '';
		let rawBuffer: Buffer;

		if (contentType.startsWith('image/')) {
			// Binary upload
			const arrayBuffer = await request.arrayBuffer();
			rawBuffer = Buffer.from(arrayBuffer);
		} else {
			// Fallback: JSON with base64 (backwards compat)
			const data = await request.json();
			if (!data.proof || !data.proof.startsWith('data:image/')) {
				return json({ error: 'Invalid image data' }, { status: 400 });
			}
			const match = data.proof.match(/^data:image\/(\w+);base64,(.+)$/);
			if (!match) {
				return json({ error: 'Invalid data URL format' }, { status: 400 });
			}
			rawBuffer = Buffer.from(match[2], 'base64');
		}

		if (rawBuffer.length === 0) {
			return json({ error: 'Empty image data' }, { status: 400 });
		}

		const itemId = Number(params.itemId);
		const batchId = Number(params.id);

		// Delete old proof file if exists
		const oldProof = batchItemDb.getProof(itemId);
		if (oldProof && !oldProof.startsWith('data:')) {
			deleteProofFile(oldProof);
		}

		// Server-side: cap at 1200x1600 max, encode as AVIF q30
		const compressed = await sharp(rawBuffer)
			.resize(1200, 1600, { fit: 'inside', withoutEnlargement: true })
			.avif({ quality: 30 })
			.toBuffer();

		const batch = batchDb.getById(batchId);
		const item = batchItemDb.getByBatchId(batchId).find((i) => i.id === itemId);
		const parts = [
			batch?.description ? filenamePart(batch.description) : '',
			batch?.name ? filenamePart(batch.name) : '',
			item?.recipient_name ? filenamePart(item.recipient_name) : ''
		].filter(Boolean);
		const preferredBaseName = parts.join('-') || `proof-${itemId}`;

		const filename = saveProofFile(itemId, compressed, 'avif', preferredBaseName);
		const success = batchItemDb.setProof(itemId, filename);
		if (!success) {
			return json({ error: 'Batch item not found' }, { status: 404 });
		}

		return json({
			message: 'Proof uploaded',
			has_transfer_proof: 1,
			originalSize: rawBuffer.length,
			compressedSize: compressed.length
		});
	} catch (error) {
		console.error('Error uploading proof:', error);
		return json({ error: 'Failed to upload proof' }, { status: 500 });
	}
};

// Get transfer proof image
// ?format=image returns raw image file (for sharing via WhatsApp link)
// Default returns JSON with metadata
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const proof = batchItemDb.getProof(Number(params.itemId));
		if (!proof) {
			return json({ error: 'No proof found' }, { status: 404 });
		}

		// Legacy: base64 still in DB (shouldn't happen after migration)
		if (proof.startsWith('data:')) {
			if (url.searchParams.get('format') === 'image') {
				const match = proof.match(/^data:(image\/\w+);base64,(.+)$/);
				if (!match) return json({ error: 'Invalid proof format' }, { status: 500 });
				const buffer = Buffer.from(match[2], 'base64');
				return new Response(buffer, {
					headers: {
						'Content-Type': match[1],
						'Content-Length': buffer.length.toString(),
						'Cache-Control': 'public, max-age=86400'
					}
				});
			}
			return json({ proof });
		}

		// File-based proof
		const buffer = readProofFile(proof);
		if (!buffer) {
			return json({ error: 'Proof file not found' }, { status: 404 });
		}

		if (url.searchParams.get('format') === 'image') {
			const ext = proof.split('.').pop() || 'webp';
			const mimeMap: Record<string, string> = {
				jpg: 'image/jpeg', jpeg: 'image/jpeg',
				png: 'image/png', webp: 'image/webp',
				avif: 'image/avif'
			};
			const contentType = mimeMap[ext] || 'image/webp';
			return new Response(buffer, {
				headers: {
					'Content-Type': contentType,
					'Content-Length': buffer.length.toString(),
					'Cache-Control': 'public, max-age=86400'
				}
			});
		}

		// For in-app viewing, return the image URL
		return json({
			proofUrl: `/api/batches/${params.id}/items/${params.itemId}/proof?format=image`,
			filename: proof,
			size: buffer.length
		});
	} catch (error) {
		console.error('Error fetching proof:', error);
		return json({ error: 'Failed to fetch proof' }, { status: 500 });
	}
};

// Delete transfer proof
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const itemId = Number(params.itemId);
		const oldProof = batchItemDb.getProof(itemId);
		if (oldProof && !oldProof.startsWith('data:')) {
			deleteProofFile(oldProof);
		}
		const success = batchItemDb.setProof(itemId, null);
		if (!success) {
			return json({ error: 'Batch item not found' }, { status: 404 });
		}
		return json({ message: 'Proof deleted', has_transfer_proof: 0 });
	} catch (error) {
		console.error('Error deleting proof:', error);
		return json({ error: 'Failed to delete proof' }, { status: 500 });
	}
};
