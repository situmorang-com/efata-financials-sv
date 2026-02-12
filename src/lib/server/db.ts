import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { Recipient, Batch, BatchItem } from '$lib/types.js';
import { calculateAmount } from '$lib/types.js';
import { seedRecipients } from './seed.js';

// Proof image file storage
const PROOFS_DIR = join(process.cwd(), 'data', 'proofs');
if (!existsSync(PROOFS_DIR)) {
	mkdirSync(PROOFS_DIR, { recursive: true });
}

export function getProofPath(filename: string): string {
	return join(PROOFS_DIR, filename);
}

export function saveProofFile(itemId: number, buffer: Buffer, extension: string): string {
	const filename = `proof-${itemId}.${extension}`;
	writeFileSync(join(PROOFS_DIR, filename), buffer);
	return filename;
}

export function readProofFile(filename: string): Buffer | null {
	const filepath = join(PROOFS_DIR, filename);
	if (!existsSync(filepath)) return null;
	return readFileSync(filepath);
}

export function deleteProofFile(filename: string): void {
	const filepath = join(PROOFS_DIR, filename);
	if (existsSync(filepath)) {
		unlinkSync(filepath);
	}
}

const db = new Database(dev ? 'efata.db' : 'efata.db');

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bank_name TEXT,
    account_number TEXT,
    whatsapp TEXT,
    keterangan TEXT,
    transfer_to_id INTEGER,
    family_group_id INTEGER,
    zoom_eligible INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (transfer_to_id) REFERENCES recipients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    default_amount INTEGER NOT NULL DEFAULT 0,
    total_saturdays INTEGER NOT NULL DEFAULT 4,
    transport_rate INTEGER NOT NULL DEFAULT 25000,
    zoom_single_rate INTEGER NOT NULL DEFAULT 50000,
    zoom_family_rate INTEGER NOT NULL DEFAULT 30000,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS batch_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    saturdays_attended INTEGER NOT NULL DEFAULT 0,
    zoom_type TEXT NOT NULL DEFAULT 'none',
    transfer_status TEXT NOT NULL DEFAULT 'pending',
    notify_status TEXT NOT NULL DEFAULT 'pending',
    transfer_at TEXT,
    notified_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id),
    UNIQUE(batch_id, recipient_id)
  )
`);

// --- Migration: add new columns to existing tables if they don't exist ---
function columnExists(table: string, column: string): boolean {
	const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return info.some(col => col.name === column);
}

// Recipients migrations
if (!columnExists('recipients', 'family_group_id')) {
	db.exec('ALTER TABLE recipients ADD COLUMN family_group_id INTEGER');
}
if (!columnExists('recipients', 'zoom_eligible')) {
	db.exec('ALTER TABLE recipients ADD COLUMN zoom_eligible INTEGER NOT NULL DEFAULT 1');
}

// Batches migrations
if (!columnExists('batches', 'total_saturdays')) {
	db.exec('ALTER TABLE batches ADD COLUMN total_saturdays INTEGER NOT NULL DEFAULT 4');
}
if (!columnExists('batches', 'transport_rate')) {
	db.exec('ALTER TABLE batches ADD COLUMN transport_rate INTEGER NOT NULL DEFAULT 25000');
}
if (!columnExists('batches', 'zoom_single_rate')) {
	db.exec('ALTER TABLE batches ADD COLUMN zoom_single_rate INTEGER NOT NULL DEFAULT 50000');
}
if (!columnExists('batches', 'zoom_family_rate')) {
	db.exec('ALTER TABLE batches ADD COLUMN zoom_family_rate INTEGER NOT NULL DEFAULT 30000');
}

// Batch items migrations
if (!columnExists('batch_items', 'transfer_proof')) {
	db.exec('ALTER TABLE batch_items ADD COLUMN transfer_proof TEXT');
}
if (!columnExists('batch_items', 'saturdays_attended')) {
	db.exec('ALTER TABLE batch_items ADD COLUMN saturdays_attended INTEGER NOT NULL DEFAULT 0');
}
if (!columnExists('batch_items', 'zoom_type')) {
	db.exec("ALTER TABLE batch_items ADD COLUMN zoom_type TEXT NOT NULL DEFAULT 'none'");
}

// --- Prepared statements - Recipients ---
const insertRecipient = db.prepare(`
  INSERT INTO recipients (name, bank_name, account_number, whatsapp, keterangan, transfer_to_id, family_group_id, zoom_eligible, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateRecipient = db.prepare(`
  UPDATE recipients
  SET name = ?, bank_name = ?, account_number = ?, whatsapp = ?, keterangan = ?, transfer_to_id = ?, family_group_id = ?, zoom_eligible = ?, is_active = ?, updated_at = ?
  WHERE id = ?
`);

const selectAllRecipients = db.prepare(`
  SELECT r.*, rt.name as transfer_to_name
  FROM recipients r
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE r.is_active = 1
  ORDER BY r.name
`);

const selectRecipientById = db.prepare(`
  SELECT r.*, rt.name as transfer_to_name
  FROM recipients r
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE r.id = ?
`);

const searchRecipients = db.prepare(`
  SELECT r.*, rt.name as transfer_to_name
  FROM recipients r
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE r.is_active = 1 AND (r.name LIKE ? OR r.bank_name LIKE ? OR r.account_number LIKE ? OR r.keterangan LIKE ?)
  ORDER BY r.name
`);

// --- Prepared statements - Batches ---
const insertBatch = db.prepare(`
  INSERT INTO batches (name, description, default_amount, total_saturdays, transport_rate, zoom_single_rate, zoom_family_rate, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateBatch = db.prepare(`
  UPDATE batches SET name = ?, description = ?, default_amount = ?, total_saturdays = ?, transport_rate = ?, zoom_single_rate = ?, zoom_family_rate = ?, status = ?, updated_at = ?
  WHERE id = ?
`);

const deleteBatch = db.prepare('DELETE FROM batches WHERE id = ?');

const selectAllBatches = db.prepare(`
  SELECT b.*,
    COUNT(bi.id) as total_items,
    SUM(CASE WHEN bi.transfer_status = 'done' THEN 1 ELSE 0 END) as transferred_count,
    SUM(CASE WHEN bi.notify_status = 'sent' THEN 1 ELSE 0 END) as notified_count
  FROM batches b
  LEFT JOIN batch_items bi ON b.id = bi.batch_id
  GROUP BY b.id
  ORDER BY b.created_at DESC
`);

const selectBatchById = db.prepare(`
  SELECT b.*,
    COUNT(bi.id) as total_items,
    SUM(CASE WHEN bi.transfer_status = 'done' THEN 1 ELSE 0 END) as transferred_count,
    SUM(CASE WHEN bi.notify_status = 'sent' THEN 1 ELSE 0 END) as notified_count
  FROM batches b
  LEFT JOIN batch_items bi ON b.id = bi.batch_id
  WHERE b.id = ?
  GROUP BY b.id
`);

// --- Prepared statements - Batch Items ---
const insertBatchItem = db.prepare(`
  INSERT INTO batch_items (batch_id, recipient_id, amount, saturdays_attended, zoom_type, transfer_status, notify_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
`);

const updateBatchItem = db.prepare(`
  UPDATE batch_items
  SET amount = ?, saturdays_attended = ?, zoom_type = ?, transfer_status = ?, notify_status = ?, transfer_at = ?, notified_at = ?, notes = ?, transfer_proof = ?, updated_at = ?
  WHERE id = ?
`);

const deleteBatchItem = db.prepare('DELETE FROM batch_items WHERE id = ?');

const selectBatchItems = db.prepare(`
  SELECT
    bi.id, bi.batch_id, bi.recipient_id, bi.amount, bi.saturdays_attended,
    bi.zoom_type, bi.transfer_status, bi.notify_status, bi.transfer_at,
    bi.notified_at, bi.notes, bi.created_at, bi.updated_at,
    (bi.transfer_proof IS NOT NULL AND bi.transfer_proof != '') AS has_transfer_proof,
    r.name AS recipient_name,
    r.bank_name,
    r.account_number,
    r.whatsapp,
    r.keterangan,
    r.transfer_to_id,
    r.family_group_id,
    rt.name AS transfer_to_name,
    COALESCE(rt.name, r.name) AS actual_account_holder,
    COALESCE(rt.bank_name, r.bank_name) AS actual_bank_name,
    COALESCE(rt.account_number, r.account_number) AS actual_account_number
  FROM batch_items bi
  JOIN recipients r ON bi.recipient_id = r.id
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE bi.batch_id = ?
  ORDER BY r.name
`);

const selectBatchItemById = db.prepare(`
  SELECT bi.* FROM batch_items bi WHERE bi.id = ?
`);

const checkBatchItemExists = db.prepare(`
  SELECT id FROM batch_items WHERE batch_id = ? AND recipient_id = ?
`);

// --- Database access objects ---
export const recipientDb = {
	getAll: (): Recipient[] => {
		return selectAllRecipients.all() as Recipient[];
	},

	getById: (id: number): Recipient | undefined => {
		return selectRecipientById.get(id) as Recipient | undefined;
	},

	create: (recipient: Omit<Recipient, 'id' | 'created_at' | 'updated_at' | 'transfer_to_name'>): Recipient => {
		const now = new Date().toISOString();
		const result = insertRecipient.run(
			recipient.name,
			recipient.bank_name || null,
			recipient.account_number || null,
			recipient.whatsapp || null,
			recipient.keterangan || null,
			recipient.transfer_to_id || null,
			recipient.family_group_id ?? null,
			recipient.zoom_eligible ?? 1,
			recipient.is_active ?? 1,
			now,
			now
		);
		return { id: result.lastInsertRowid as number, ...recipient, created_at: now, updated_at: now };
	},

	update: (id: number, data: Partial<Recipient>): boolean => {
		const existing = selectRecipientById.get(id) as Recipient | undefined;
		if (!existing) return false;
		const now = new Date().toISOString();
		const updated = { ...existing, ...data };
		const result = updateRecipient.run(
			updated.name,
			updated.bank_name || null,
			updated.account_number || null,
			updated.whatsapp || null,
			updated.keterangan || null,
			updated.transfer_to_id || null,
			updated.family_group_id ?? null,
			updated.zoom_eligible ?? 1,
			updated.is_active,
			now,
			id
		);
		return result.changes > 0;
	},

	softDelete: (id: number): boolean => {
		const now = new Date().toISOString();
		const result = db.prepare('UPDATE recipients SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);
		return result.changes > 0;
	},

	search: (query: string): Recipient[] => {
		const term = `%${query}%`;
		return searchRecipients.all(term, term, term, term) as Recipient[];
	},

	findByName: (name: string): Recipient | undefined => {
		return db.prepare('SELECT * FROM recipients WHERE name = ? AND is_active = 1').get(name) as Recipient | undefined;
	},

	getNextFamilyGroupId: (): number => {
		const result = db.prepare('SELECT MAX(family_group_id) as max_id FROM recipients').get() as { max_id: number | null };
		return (result.max_id || 0) + 1;
	},

	getFamilyMembers: (familyGroupId: number): Recipient[] => {
		return db.prepare('SELECT * FROM recipients WHERE family_group_id = ? AND is_active = 1 ORDER BY name').all(familyGroupId) as Recipient[];
	},

	setFamilyGroup: (recipientIds: number[], familyGroupId: number | null): number => {
		const now = new Date().toISOString();
		let count = 0;
		const tx = db.transaction(() => {
			for (const id of recipientIds) {
				const result = db.prepare('UPDATE recipients SET family_group_id = ?, updated_at = ? WHERE id = ?').run(familyGroupId, now, id);
				count += result.changes;
			}
		});
		tx();
		return count;
	}
};

export const batchDb = {
	getAll: (): Batch[] => {
		return selectAllBatches.all() as Batch[];
	},

	getById: (id: number): Batch | undefined => {
		return selectBatchById.get(id) as Batch | undefined;
	},

	create: (batch: { name: string; description?: string; default_amount?: number; total_saturdays?: number; transport_rate?: number; zoom_single_rate?: number; zoom_family_rate?: number }): Batch => {
		const now = new Date().toISOString();
		const totalSat = batch.total_saturdays ?? 4;
		const tRate = batch.transport_rate ?? 25000;
		const zSingle = batch.zoom_single_rate ?? 50000;
		const zFamily = batch.zoom_family_rate ?? 30000;
		const defaultAmt = batch.default_amount ?? (totalSat * tRate);
		const result = insertBatch.run(
			batch.name,
			batch.description || null,
			defaultAmt,
			totalSat,
			tRate,
			zSingle,
			zFamily,
			'active',
			now,
			now
		);
		return {
			id: result.lastInsertRowid as number,
			name: batch.name,
			description: batch.description,
			default_amount: defaultAmt,
			total_saturdays: totalSat,
			transport_rate: tRate,
			zoom_single_rate: zSingle,
			zoom_family_rate: zFamily,
			status: 'active',
			created_at: now,
			updated_at: now,
			total_items: 0,
			transferred_count: 0,
			notified_count: 0
		};
	},

	update: (id: number, data: Partial<Batch>): boolean => {
		const existing = selectBatchById.get(id) as Batch | undefined;
		if (!existing) return false;
		const now = new Date().toISOString();
		const updated = { ...existing, ...data };
		const result = updateBatch.run(
			updated.name,
			updated.description || null,
			updated.default_amount,
			updated.total_saturdays,
			updated.transport_rate,
			updated.zoom_single_rate,
			updated.zoom_family_rate,
			updated.status,
			now,
			id
		);
		return result.changes > 0;
	},

	delete: (id: number): boolean => {
		const result = deleteBatch.run(id);
		return result.changes > 0;
	}
};

export const batchItemDb = {
	getByBatchId: (batchId: number): BatchItem[] => {
		return selectBatchItems.all(batchId) as BatchItem[];
	},

	getById: (id: number): BatchItem | undefined => {
		return selectBatchItemById.get(id) as BatchItem | undefined;
	},

	create: (batchId: number, recipientId: number, amount: number, saturdaysAttended: number = 0, zoomType: string = 'none'): BatchItem | null => {
		const exists = checkBatchItemExists.get(batchId, recipientId);
		if (exists) return null;
		const now = new Date().toISOString();
		const result = insertBatchItem.run(batchId, recipientId, amount, saturdaysAttended, zoomType, now, now);
		return {
			id: result.lastInsertRowid as number,
			batch_id: batchId,
			recipient_id: recipientId,
			amount,
			saturdays_attended: saturdaysAttended,
			zoom_type: zoomType as 'none' | 'single' | 'family',
			transfer_status: 'pending',
			notify_status: 'pending',
			created_at: now,
			updated_at: now
		};
	},

	update: (id: number, data: Partial<BatchItem>): boolean => {
		const existing = selectBatchItemById.get(id) as BatchItem | undefined;
		if (!existing) return false;
		const now = new Date().toISOString();
		const updated = { ...existing, ...data };
		const result = updateBatchItem.run(
			updated.amount,
			updated.saturdays_attended,
			updated.zoom_type,
			updated.transfer_status,
			updated.notify_status,
			updated.transfer_at || null,
			updated.notified_at || null,
			updated.notes || null,
			updated.transfer_proof ?? existing.transfer_proof ?? null,
			now,
			id
		);
		return result.changes > 0;
	},

	delete: (id: number): boolean => {
		const result = deleteBatchItem.run(id);
		return result.changes > 0;
	},

	populate: (batchId: number, batch: Batch): number => {
		const recipients = recipientDb.getAll();
		let count = 0;
		const now = new Date().toISOString();
		const insertTransaction = db.transaction(() => {
			for (const r of recipients) {
				const exists = checkBatchItemExists.get(batchId, r.id!);
				if (!exists) {
					// Determine zoom type from recipient data
					let zoomType = 'none';
					if (r.zoom_eligible) {
						zoomType = r.family_group_id ? 'family' : 'single';
					}
					// Default: 0 saturdays attended (user fills in attendance)
					const amount = calculateAmount(0, batch.transport_rate, zoomType as 'none' | 'single' | 'family', batch.zoom_single_rate, batch.zoom_family_rate);
					insertBatchItem.run(batchId, r.id!, amount, 0, zoomType, now, now);
					count++;
				}
			}
		});
		insertTransaction();
		return count;
	},

	getProof: (id: number): string | null => {
		const row = db.prepare('SELECT transfer_proof FROM batch_items WHERE id = ?').get(id) as { transfer_proof: string | null } | undefined;
		return row?.transfer_proof ?? null;
	},

	setProof: (id: number, filename: string | null): boolean => {
		// If clearing proof, delete the old file
		if (!filename) {
			const existing = db.prepare('SELECT transfer_proof FROM batch_items WHERE id = ?').get(id) as { transfer_proof: string | null } | undefined;
			if (existing?.transfer_proof && !existing.transfer_proof.startsWith('data:')) {
				deleteProofFile(existing.transfer_proof);
			}
		}
		const now = new Date().toISOString();
		const result = db.prepare(
			'UPDATE batch_items SET transfer_proof = ?, transfer_status = ?, transfer_at = ?, updated_at = ? WHERE id = ?'
		).run(filename, filename ? 'done' : 'pending', filename ? now : null, now, id);
		return result.changes > 0;
	},

	bulkUpdateTransfer: (itemIds: number[], status: 'pending' | 'done'): number => {
		const now = new Date().toISOString();
		let count = 0;
		const updateTransaction = db.transaction(() => {
			for (const id of itemIds) {
				const result = db.prepare(
					'UPDATE batch_items SET transfer_status = ?, transfer_at = ?, updated_at = ? WHERE id = ?'
				).run(status, status === 'done' ? now : null, now, id);
				count += result.changes;
			}
		});
		updateTransaction();
		return count;
	},

	bulkUpdateNotify: (itemIds: number[], status: 'pending' | 'sent' | 'skipped'): number => {
		const now = new Date().toISOString();
		let count = 0;
		const updateTransaction = db.transaction(() => {
			for (const id of itemIds) {
				const result = db.prepare(
					'UPDATE batch_items SET notify_status = ?, notified_at = ?, updated_at = ? WHERE id = ?'
				).run(status, status === 'sent' ? now : null, now, id);
				count += result.changes;
			}
		});
		updateTransaction();
		return count;
	},

	bulkUpdateSaturdays: (batchId: number, saturdays: number, batch: Batch): number => {
		const now = new Date().toISOString();
		const items = selectBatchItems.all(batchId) as BatchItem[];
		let count = 0;
		const updateTransaction = db.transaction(() => {
			for (const item of items) {
				const amount = calculateAmount(saturdays, batch.transport_rate, item.zoom_type, batch.zoom_single_rate, batch.zoom_family_rate);
				const result = db.prepare(
					'UPDATE batch_items SET saturdays_attended = ?, amount = ?, updated_at = ? WHERE id = ?'
				).run(saturdays, amount, now, item.id);
				count += result.changes;
			}
		});
		updateTransaction();
		return count;
	}
};

// Seed data on first run
const recipientCount = db.prepare('SELECT COUNT(*) as count FROM recipients').get() as { count: number };
if (recipientCount.count === 0) {
	const now = new Date().toISOString();

	// First pass: insert all recipients without transfer_to_id
	const insertTransaction = db.transaction(() => {
		for (const r of seedRecipients) {
			insertRecipient.run(
				r.name,
				r.bank_name,
				r.account_number,
				r.whatsapp,
				r.keterangan,
				null, // transfer_to_id set in second pass
				null, // family_group_id
				1, // zoom_eligible default
				1,
				now,
				now
			);
		}
	});
	insertTransaction();

	// Second pass: set transfer_to_id for those with transfer_to_name
	const updateTransferTo = db.transaction(() => {
		for (const r of seedRecipients) {
			if (r.transfer_to_name) {
				const target = recipientDb.findByName(r.transfer_to_name);
				const source = recipientDb.findByName(r.name);
				if (target && source) {
					db.prepare('UPDATE recipients SET transfer_to_id = ? WHERE id = ?').run(target.id, source.id);
				}
			}
		}
	});
	updateTransferTo();

	// Third pass: set up family groups for recipients that transfer to each other
	// (e.g., Oreza→Anita means they are family; Hellena→Tirto means they are family)
	const setupFamilyGroups = db.transaction(() => {
		let groupId = 1;
		const processed = new Set<number>();
		const allRecipients = recipientDb.getAll();
		for (const r of allRecipients) {
			if (processed.has(r.id!)) continue;
			if (r.transfer_to_id) {
				// This recipient transfers to someone — they are family
				if (!processed.has(r.id!) && !processed.has(r.transfer_to_id)) {
					db.prepare('UPDATE recipients SET family_group_id = ? WHERE id = ?').run(groupId, r.id);
					db.prepare('UPDATE recipients SET family_group_id = ? WHERE id = ?').run(groupId, r.transfer_to_id);
					processed.add(r.id!);
					processed.add(r.transfer_to_id);
					groupId++;
				}
			}
		}
	});
	setupFamilyGroups();

	console.log(`Seeded ${seedRecipients.length} recipients`);
}

// Migrate existing base64 proofs to files
const base64Proofs = db.prepare("SELECT id, transfer_proof FROM batch_items WHERE transfer_proof IS NOT NULL AND transfer_proof LIKE 'data:%'").all() as { id: number; transfer_proof: string }[];
if (base64Proofs.length > 0) {
	console.log(`Migrating ${base64Proofs.length} base64 proofs to files...`);
	for (const row of base64Proofs) {
		try {
			const match = row.transfer_proof.match(/^data:image\/(\w+);base64,(.+)$/);
			if (match) {
				const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
				const buffer = Buffer.from(match[2], 'base64');
				const filename = saveProofFile(row.id, buffer, ext);
				db.prepare('UPDATE batch_items SET transfer_proof = ? WHERE id = ?').run(filename, row.id);
				console.log(`  Migrated item ${row.id}: ${buffer.length} bytes → ${filename}`);
			}
		} catch (err) {
			console.error(`  Failed to migrate proof for item ${row.id}:`, err);
		}
	}
}
