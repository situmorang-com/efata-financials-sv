<script lang="ts">
	import type { Batch, BatchItem, ZoomType } from '$lib/types.js';
	import { calculateAmount } from '$lib/types.js';
	import { formatRupiah } from '$lib/format.js';
	import ProgressBar from './ProgressBar.svelte';
	import WhatsAppButton from './WhatsAppButton.svelte';
	import SaturdayDots from './SaturdayDots.svelte';
	import ZoomBadge from './ZoomBadge.svelte';
	import TransferProof from './TransferProof.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import EmptyState from './EmptyState.svelte';
	import StatCardSkeleton from './skeletons/StatCardSkeleton.svelte';
	import TableSkeleton from './skeletons/TableSkeleton.svelte';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Layers from '@lucide/svelte/icons/layers';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import UsersIcon from '@lucide/svelte/icons/users';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Bell from '@lucide/svelte/icons/bell';
	import Banknote from '@lucide/svelte/icons/banknote';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Download from '@lucide/svelte/icons/download';
	import Lock from '@lucide/svelte/icons/lock';
	import Pencil from '@lucide/svelte/icons/pencil';

	let { batchId }: { batchId: number } = $props();

	let batch = $state<Batch | null>(null);
	let items = $state<BatchItem[]>([]);
	let loading = $state(true);
	let filterMode = $state<'all' | 'pending-transfer' | 'pending-notify'>('all');
	let searchQuery = $state('');
	let completing = $state(false);
	let autoSkipping = $state(false);
	let downloading = $state(false);
	let isEditMode = $state(false);
	let isSpecial = $derived(batch?.type === 'special');
	let viewMode = $state<'individual' | 'family'>('family');
	let selectedFamilyGroupKey = $state<string | null>(null);
	let familyTransferDate = $state(new Date().toISOString().slice(0, 10));
	let familyTransferFeeInput = $state('0');
	let familyTransferFile = $state<File | null>(null);
	let familyTransferSubmitting = $state(false);

	type FamilyTransferGroup = {
		key: string;
		payeeName: string;
		accountLabel: string;
		leadItemId: number;
		members: BatchItem[];
		totalAmount: number;
		totalFee: number;
		totalSend: number;
		doneCount: number;
		proofCount: number;
		pendingNotifyCount: number;
		latestTransferAt: string | null;
	};

	function normalizePaymentMethod(value?: string | null): 'transfer' | 'cash' {
		return String(value || '').trim().toLowerCase() === 'cash' ? 'cash' : 'transfer';
	}

	function isCash(item: BatchItem): boolean {
		return normalizePaymentMethod(item.payment_method) === 'cash';
	}

	function ensureEditMode(): boolean {
		if (isEditMode) return true;
		addToast('Aktifkan mode Edit dulu', 'info');
		return false;
	}

	let transferredCount = $derived(items.filter(i => i.transfer_status === 'done').length);
	let notifiedCount = $derived(items.filter(i => i.notify_status === 'sent').length);
	let skippedNotifyCount = $derived(items.filter(i => i.notify_status === 'skipped').length);
	let totalAmount = $derived(items.reduce((sum, i) => sum + i.amount, 0));
	let totalTransferFee = $derived(items.reduce((sum, i) => sum + (i.transfer_fee || 0), 0));
	let grandTotal = $derived(totalAmount + totalTransferFee);
	let transferAmountPaidTotal = $derived(
		items
			.filter((i) => !isCash(i) && i.transfer_status === 'done')
			.reduce((sum, i) => sum + i.amount, 0)
	);
	let transferFeePaidTotal = $derived(
		items
			.filter((i) => !isCash(i) && i.transfer_status === 'done')
			.reduce((sum, i) => sum + (i.transfer_fee || 0), 0)
	);
	let cashPaidTotal = $derived(
		items
			.filter((i) => isCash(i) && i.transfer_status === 'done')
			.reduce((sum, i) => sum + i.amount, 0)
	);
	let totalPaidSummary = $derived(transferAmountPaidTotal + transferFeePaidTotal + cashPaidTotal);
	let pendingTransferCount = $derived(items.filter(i => i.transfer_status === 'pending').length);
	let pendingNotifyCount = $derived(items.filter(i => i.transfer_status === 'done' && i.notify_status === 'pending').length);
	let allDone = $derived(
		items.length > 0 &&
		items.every(i => i.transfer_status === 'done' && (i.notify_status === 'sent' || i.notify_status === 'skipped'))
	);
	let avgAttendance = $derived(
		items.length > 0
			? (items.reduce((sum, i) => sum + i.saturdays_attended, 0) / items.length).toFixed(1)
			: '0'
	);

	function matchesSearch(item: BatchItem, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		return (
			(item.recipient_name || '').toLowerCase().includes(q) ||
			(item.transfer_to_name || '').toLowerCase().includes(q) ||
			(item.actual_bank_name || item.bank_name || '').toLowerCase().includes(q) ||
			(item.actual_account_number || item.account_number || '').toLowerCase().includes(q)
		);
	}

	function normalizeAccountNumber(value?: string | null): string {
		return String(value || '').replace(/\D/g, '');
	}

	function normalizeKeyPart(value?: string | null): string {
		return String(value || '').trim().toLowerCase();
	}

	function getFamilyTransferKey(item: BatchItem): string | null {
		if (!item.family_group_id || isCash(item)) return null;
		const accountNumber = normalizeAccountNumber(item.actual_account_number || item.account_number);
		const bank = normalizeKeyPart(item.actual_bank_name || item.bank_name);
		const destination = accountNumber
			? `acct:${bank}:${accountNumber}`
			: item.transfer_to_id
				? `to:${item.transfer_to_id}`
				: `self:${item.recipient_id}`;
		return `family:${item.family_group_id}:${destination}`;
	}

	function buildFamilyTransferGroups(source: BatchItem[]): FamilyTransferGroup[] {
		const grouped = new Map<string, BatchItem[]>();
		for (const item of source) {
			const key = getFamilyTransferKey(item);
			if (!key) continue;
			if (!grouped.has(key)) grouped.set(key, []);
			grouped.get(key)!.push(item);
		}

		const groups: FamilyTransferGroup[] = [];
		for (const [key, members] of grouped.entries()) {
			if (members.length < 2) continue;
			const sortedMembers = [...members].sort((a, b) =>
				(a.recipient_name || '').localeCompare(b.recipient_name || '')
			);
			const leadMember =
				sortedMembers.find((member) => member.transfer_to_id) || sortedMembers[0];
			const payeeName =
				leadMember.transfer_to_name || leadMember.actual_account_holder || leadMember.recipient_name || '-';
			const bankLabel = leadMember.actual_bank_name || leadMember.bank_name || '-';
			const accountLabel = leadMember.actual_account_number || leadMember.account_number || '-';
			const totalAmount = sortedMembers.reduce((sum, member) => sum + (member.amount || 0), 0);
			const totalFee = sortedMembers.reduce((sum, member) => sum + (member.transfer_fee || 0), 0);
			const doneCount = sortedMembers.filter((member) => member.transfer_status === 'done').length;
			const proofCount = sortedMembers.filter((member) => !!member.has_transfer_proof).length;
			const pendingNotifyCount = sortedMembers.filter(
				(member) => member.transfer_status === 'done' && member.notify_status === 'pending'
			).length;
			const latestTransferAt = sortedMembers
				.map((member) => member.transfer_at || '')
				.filter(Boolean)
				.sort()
				.at(-1) || null;
			groups.push({
				key,
				payeeName,
				accountLabel: `${bankLabel} ${accountLabel}`,
				leadItemId: leadMember.id!,
				members: sortedMembers,
				totalAmount,
				totalFee,
				totalSend: totalAmount + totalFee,
				doneCount,
				proofCount,
				pendingNotifyCount,
				latestTransferAt
			});
		}

		return groups.sort((a, b) => a.payeeName.localeCompare(b.payeeName));
	}

	let visibleItems = $derived(
		items.filter(i => {
			if (filterMode === 'pending-transfer' && i.transfer_status !== 'pending') return false;
			if (filterMode === 'pending-notify' && !(i.transfer_status === 'done' && i.notify_status === 'pending')) return false;
			return matchesSearch(i, searchQuery);
		})
	);
	let familyTransferGroups = $derived(buildFamilyTransferGroups(items));
	let visibleFamilyTransferGroups = $derived(
		familyTransferGroups.filter(group => {
			if (filterMode === 'pending-transfer' && group.doneCount === group.members.length) return false;
			if (filterMode === 'pending-notify' && group.pendingNotifyCount === 0) return false;
			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return (
				group.payeeName.toLowerCase().includes(q) ||
				group.accountLabel.toLowerCase().includes(q) ||
				group.members.some((member) =>
					(member.recipient_name || '').toLowerCase().includes(q)
				)
			);
		})
	);
	let selectedFamilyGroup = $derived(
		selectedFamilyGroupKey
			? familyTransferGroups.find(group => group.key === selectedFamilyGroupKey) || null
			: null
	);
	let familyGroupByItemId = $derived(
		(() => {
			const map = new Map<number, FamilyTransferGroup>();
			for (const group of familyTransferGroups) {
				for (const member of group.members) {
					if (member.id) {
						map.set(member.id, group);
					}
				}
			}
			return map;
		})()
	);

	function buildTransferInfo(item: BatchItem): {
		is_family_transfer?: boolean;
		transfer_to_name?: string;
		actual_bank_name?: string;
		actual_account_number?: string;
		family_member_names?: string[];
		family_total_transfer?: number;
		batch_label?: string;
		family_member_details?: Array<{
			name: string;
			saturdays_attended?: number;
			zoom_sessions?: number;
			zoom_label?: string;
		}>;
	} {
		const batchLabel = (batch?.name || 'bulan ini').replace(/^transfer\s+/i, '');
		const base = {
			transfer_to_name: item.transfer_to_name || item.actual_account_holder || item.recipient_name,
			actual_bank_name: item.actual_bank_name || item.bank_name,
			actual_account_number: item.actual_account_number || item.account_number,
			batch_label: batchLabel
		};
		if (!item.id) {
			return base;
		}
		const group = familyGroupByItemId.get(item.id);
		if (!group) {
			return base;
		}
		return {
			...base,
			is_family_transfer: true,
			family_member_names: group.members.map((member) => member.recipient_name || '').filter(Boolean),
			family_total_transfer: group.totalAmount,
			family_member_details: group.members.map((member) => ({
				name: member.recipient_name || '-',
				saturdays_attended: member.saturdays_attended,
				zoom_sessions:
					member.zoom_type && member.zoom_type !== 'none'
						? Math.max(0, Number(batch?.total_saturdays || 0))
						: 0,
				zoom_label:
					member.zoom_type && member.zoom_type !== 'none'
						? 'zoom'
						: undefined
			}))
		};
	}

	async function updatePaymentMethod(item: BatchItem, method: 'transfer' | 'cash') {
		if (!ensureEditMode()) return;
		const prevMethod = item.payment_method;
		const prevFee = item.transfer_fee;
		item.payment_method = method;
		if (method === 'cash') {
			item.transfer_fee = 0;
		}
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					payment_method: method,
					transfer_fee: method === 'cash' ? 0 : item.transfer_fee
				})
			});
		} catch (e) {
			item.payment_method = prevMethod;
			item.transfer_fee = prevFee;
			console.error('Failed to update payment method:', e);
			addToast('Gagal mengubah metode pembayaran', 'error');
		}
	}

	async function toggleCashPaid(item: BatchItem) {
		if (!ensureEditMode()) return;
		const nextStatus: 'pending' | 'done' = item.transfer_status === 'done' ? 'pending' : 'done';
		const nextTransferAt = nextStatus === 'done' ? new Date().toISOString() : null;
		const nextNotifyStatus = nextStatus === 'pending' ? 'pending' : item.notify_status;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					payment_method: 'cash',
					transfer_status: nextStatus,
					transfer_at: nextTransferAt,
					notify_status: nextNotifyStatus
				})
			});
			item.payment_method = 'cash';
			item.transfer_status = nextStatus;
			item.transfer_at = nextTransferAt || undefined;
			if (nextStatus === 'pending') {
				item.notify_status = 'pending';
			}
			addToast(
				nextStatus === 'done'
					? `Cash ${item.recipient_name} ditandai lunas`
					: `Status cash ${item.recipient_name} dibatalkan`,
				nextStatus === 'done' ? 'success' : 'info'
			);
			await autoSkipMissingWhatsapp();
			await maybeCompleteBatch();
		} catch (e) {
			console.error('Failed to toggle cash paid:', e);
			addToast('Gagal mengubah status pembayaran cash', 'error');
		}
	}

	async function loadData() {
		try {
			const [batchRes, itemsRes] = await Promise.all([
				fetch(`/api/batches/${batchId}`),
				fetch(`/api/batches/${batchId}/items`)
			]);
			const batchPayload = await batchRes.json();
			const itemsPayload = await itemsRes.json();
			if (!batchRes.ok) {
				throw new Error(batchPayload?.error || 'Failed to load batch');
			}
			if (!itemsRes.ok) {
				throw new Error(itemsPayload?.error || 'Failed to load batch items');
			}
			batch = batchPayload as Batch;
			items = Array.isArray(itemsPayload)
				? (itemsPayload as BatchItem[]).map((item) => ({
					...item,
					custom_zoom_amount: Math.max(0, Math.round(item.custom_zoom_amount || 0)),
					payment_method: normalizePaymentMethod(item.payment_method)
				}))
				: [];
			await autoSkipMissingWhatsapp();
			await maybeCompleteBatch();
		} catch (e) {
			console.error('Failed to load batch data:', e);
			addToast(e instanceof Error ? e.message : 'Gagal memuat data batch', 'error');
		} finally {
			loading = false;
		}
	}

	async function autoSkipMissingWhatsapp() {
		if (autoSkipping) return;
		const ids = items
			.filter(i => i.transfer_status === 'done' && !i.whatsapp && i.notify_status === 'pending')
			.map(i => i.id!)
			.filter(Boolean);
		if (ids.length === 0) return;
		autoSkipping = true;
		try {
			await fetch(`/api/batches/${batchId}/bulk-notify`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_ids: ids, status: 'skipped' })
			});
			// Update local state
			items = items.map(i => ids.includes(i.id!) ? { ...i, notify_status: 'skipped' } : i);
		} catch (e) {
			console.error('Failed to auto-skip notify for missing WhatsApp:', e);
		} finally {
			autoSkipping = false;
		}
	}

	async function maybeCompleteBatch() {
		if (!batch || completing) return;
		if (batch.status !== 'active') return;
		if (!allDone) return;
		completing = true;
		try {
			await fetch(`/api/batches/${batchId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'completed' })
			});
			batch.status = 'completed';
			addToast('Batch otomatis diselesaikan', 'success');
		} catch (e) {
			console.error('Failed to complete batch:', e);
			addToast('Gagal menyelesaikan batch', 'error');
		} finally {
			completing = false;
		}
	}

	async function updateSaturdays(item: BatchItem, newSaturdays: number) {
		if (!ensureEditMode()) return;
		if (!batch) return;
		const oldSat = item.saturdays_attended;
		const newAmount = calculateAmount(
			newSaturdays,
			batch.transport_rate,
			item.zoom_type,
			batch.zoom_single_rate,
			batch.zoom_family_rate,
			item.custom_zoom_amount
		);
		// Optimistic update
		item.saturdays_attended = newSaturdays;
		item.amount = newAmount;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ saturdays_attended: newSaturdays })
			});
		} catch (e) {
			// Revert on error
			item.saturdays_attended = oldSat;
			item.amount = calculateAmount(
				oldSat,
				batch.transport_rate,
				item.zoom_type,
				batch.zoom_single_rate,
				batch.zoom_family_rate,
				item.custom_zoom_amount
			);
			console.error('Failed to update saturdays:', e);
			addToast('Gagal mengubah kehadiran', 'error');
		}
	}

	async function updateZoomType(item: BatchItem, newType: ZoomType) {
		if (!ensureEditMode()) return;
		if (!batch) return;
		const oldType = item.zoom_type;
		const oldCustom = item.custom_zoom_amount;
		const fallbackManual =
			oldType === 'single'
				? batch.zoom_single_rate
				: oldType === 'family'
					? batch.zoom_family_rate
					: oldCustom || batch.zoom_single_rate;
		const nextCustom = newType === 'custom' ? Math.max(0, Math.round(fallbackManual || 0)) : oldCustom;
		const newAmount = calculateAmount(
			item.saturdays_attended,
			batch.transport_rate,
			newType,
			batch.zoom_single_rate,
			batch.zoom_family_rate,
			nextCustom
		);
		// Optimistic update
		item.zoom_type = newType;
		item.custom_zoom_amount = nextCustom;
		item.amount = newAmount;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					zoom_type: newType,
					custom_zoom_amount: nextCustom
				})
			});
		} catch (e) {
			// Revert on error
			item.zoom_type = oldType;
			item.custom_zoom_amount = oldCustom;
			item.amount = calculateAmount(
				item.saturdays_attended,
				batch.transport_rate,
				oldType,
				batch.zoom_single_rate,
				batch.zoom_family_rate,
				oldCustom
			);
			console.error('Failed to update zoom:', e);
			addToast('Gagal mengubah zoom', 'error');
		}
	}

	async function updateCustomZoomAmount(item: BatchItem, newAmount: number) {
		if (!ensureEditMode()) return;
		if (!batch) return;
		const sanitized = Math.max(0, Math.round(newAmount || 0));
		const oldCustom = item.custom_zoom_amount;
		const oldAmount = item.amount;
		item.custom_zoom_amount = sanitized;
		item.amount = calculateAmount(
			item.saturdays_attended,
			batch.transport_rate,
			item.zoom_type,
			batch.zoom_single_rate,
			batch.zoom_family_rate,
			sanitized
		);
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					custom_zoom_amount: sanitized
				})
			});
		} catch (e) {
			item.custom_zoom_amount = oldCustom;
			item.amount = oldAmount;
			console.error('Failed to update custom zoom amount:', e);
			addToast('Gagal mengubah nominal zoom manual', 'error');
		}
	}

	async function updateAmount(item: BatchItem, newAmount: number) {
		if (!ensureEditMode()) return;
		const sanitized = Math.max(0, Math.round(newAmount || 0));
		const oldAmount = item.amount;
		item.amount = sanitized;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: sanitized })
			});
		} catch (e) {
			item.amount = oldAmount;
			console.error('Failed to update amount:', e);
			addToast('Gagal mengubah nominal', 'error');
		}
	}

	async function updateTransferFee(item: BatchItem, newFee: number) {
		if (!ensureEditMode()) return;
		const sanitized = Math.max(0, Math.round(newFee || 0));
		const oldFee = item.transfer_fee;
		item.transfer_fee = sanitized;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transfer_fee: sanitized })
			});
		} catch (e) {
			item.transfer_fee = oldFee;
			console.error('Failed to update transfer fee:', e);
			addToast('Gagal mengubah biaya transfer', 'error');
		}
	}

	function handleTransferChange(item: BatchItem, newStatus: 'pending' | 'done', hasProofNow: boolean) {
		if (!isEditMode) return;
		item.transfer_status = newStatus;
		item.has_transfer_proof = hasProofNow ? 1 : 0;
		if (newStatus === 'pending') {
			item.notify_status = 'pending';
		}
		addToast(
			newStatus === 'done'
				? `Transfer ${item.recipient_name} selesai`
				: `Transfer ${item.recipient_name} dibatalkan`,
			newStatus === 'done' ? 'success' : 'info'
		);
		void autoSkipMissingWhatsapp().then(() => maybeCompleteBatch());
	}

	async function handleNotify(item: BatchItem) {
		if (!ensureEditMode()) return;
		if (item.transfer_status !== 'done') return;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					notify_status: 'sent',
					notified_at: new Date().toISOString()
				})
			});
			item.notify_status = 'sent';
			addToast(`WA ${item.recipient_name} terkirim`, 'success');
			await maybeCompleteBatch();
		} catch (e) {
			console.error('Failed to update notify:', e);
			addToast('Gagal mengubah status notifikasi', 'error');
		}
	}

	async function markAllTransferred() {
		if (!ensureEditMode()) return;
		const pendingIds = items.filter(i => i.transfer_status === 'pending').map(i => i.id!);
		if (pendingIds.length === 0) return;
		try {
			await fetch(`/api/batches/${batchId}/bulk-transfer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_ids: pendingIds })
			});
			addToast(`${pendingIds.length} transfer ditandai selesai`, 'success');
			await loadData();
			await autoSkipMissingWhatsapp();
			await maybeCompleteBatch();
		} catch (e) {
			console.error('Failed to bulk update:', e);
			addToast('Gagal menandai semua transfer', 'error');
		}
	}

	function formatDateInput(value?: string | null): string {
		if (!value) return '';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '';
		return d.toISOString().slice(0, 10);
	}

	async function updateTransferDate(item: BatchItem, dateValue: string) {
		if (!ensureEditMode()) return;
		const iso = dateValue ? new Date(`${dateValue}T12:00:00`).toISOString() : null;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transfer_at: iso })
			});
			item.transfer_at = iso || undefined;
			addToast('Tanggal transfer diperbarui', 'success');
		} catch (e) {
			console.error('Failed to update transfer date:', e);
			addToast('Gagal mengubah tanggal transfer', 'error');
		}
	}

	async function downloadReport() {
		if (!batch || downloading) return;
		downloading = true;
		try {
			const res = await fetch(`/api/batches/${batchId}/report`);
			if (!res.ok) {
				let msg = 'Failed to generate PDF';
				try {
					const payload = await res.json();
					msg = payload?.error || msg;
				} catch {
					// no-op
				}
				throw new Error(msg);
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `batch-${batch.id}-${batch.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (e) {
			console.error('Failed to download report:', e);
			addToast('Gagal membuat PDF', 'error');
		} finally {
			downloading = false;
		}
	}

	async function setAllFullAttendance() {
		if (!ensureEditMode()) return;
		if (!batch) return;
		if (batch.type === 'special') return;
		try {
			await fetch(`/api/batches/${batchId}/bulk-saturdays`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ saturdays: batch.total_saturdays })
			});
			addToast(`Semua ditandai hadir penuh (${batch.total_saturdays} Sabat)`, 'success');
			await loadData();
		} catch (e) {
			console.error('Failed to bulk update saturdays:', e);
			addToast('Gagal mengubah kehadiran', 'error');
		}
	}

	async function populateBatch() {
		if (!ensureEditMode()) return;
		try {
			await fetch(`/api/batches/${batchId}/populate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			addToast('Semua penerima berhasil ditambahkan', 'success');
			await loadData();
		} catch (e) {
			console.error('Failed to populate batch:', e);
			addToast('Gagal mengisi penerima', 'error');
		}
	}

	function getRowClass(item: BatchItem): string {
		if (item.transfer_status === 'done' && item.notify_status === 'sent') return 'row-completed';
		if (isCash(item)) return 'row-cash';
		if (item.transfer_status === 'done') return 'row-transferred';
		return 'glass-table-row';
	}

	function getZoomAmount(item: BatchItem): number {
		if (!batch) return 0;
		return item.zoom_type === 'single'
			? batch.zoom_single_rate
			: item.zoom_type === 'family'
				? batch.zoom_family_rate
				: item.zoom_type === 'custom'
					? Math.max(0, Math.round(item.custom_zoom_amount || 0))
					: 0;
	}

	function formatCurrencyInput(value: number): string {
		return `Rp. ${Math.max(0, Math.round(value || 0)).toLocaleString('id-ID')}`;
	}

	function parseCurrencyInput(value: string): number {
		const digits = value.replace(/\D/g, '');
		return digits ? Number(digits) : 0;
	}

	async function prepareFamilyProofImage(file: File): Promise<File> {
		if (!file.type.startsWith('image/')) {
			throw new Error('File harus berupa gambar');
		}
		return new Promise((resolve, reject) => {
			const img = new window.Image();
			const objectUrl = URL.createObjectURL(file);
			img.onload = async () => {
				try {
					URL.revokeObjectURL(objectUrl);
					const width = Math.max(1, Math.round(img.width * 0.7));
					const height = Math.max(1, Math.round(img.height * 0.7));
					const canvas = document.createElement('canvas');
					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						reject(new Error('Gagal memproses gambar'));
						return;
					}
					ctx.drawImage(img, 0, 0, width, height);
					const blob = await new Promise<Blob | null>((result) =>
						canvas.toBlob(result, 'image/jpeg', 0.85)
					);
					if (!blob || blob.size === 0) {
						reject(new Error('Format gambar tidak didukung'));
						return;
					}
					const baseName = file.name.replace(/\.[^.]+$/, '') || 'family-proof';
					resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
				} catch (error) {
					reject(error instanceof Error ? error : new Error('Gagal memproses gambar'));
				}
			};
			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				reject(new Error('Format gambar tidak didukung. Gunakan JPG/PNG atau screenshot.'));
			};
			img.src = objectUrl;
		});
	}

	function openFamilyTransfer(group: FamilyTransferGroup) {
		selectedFamilyGroupKey = group.key;
		familyTransferDate = formatDateInput(group.latestTransferAt) || new Date().toISOString().slice(0, 10);
		familyTransferFeeInput = String(group.totalFee || 0);
		familyTransferFile = null;
	}

	function closeFamilyTransfer() {
		selectedFamilyGroupKey = null;
		familyTransferSubmitting = false;
		familyTransferFile = null;
	}

	async function submitFamilyTransfer() {
		if (!ensureEditMode()) return;
		if (!selectedFamilyGroup) return;
		if (!familyTransferFile) {
			addToast('Upload bukti transfer keluarga dulu', 'info');
			return;
		}

		familyTransferSubmitting = true;
		try {
			const preparedFile = await prepareFamilyProofImage(familyTransferFile);
			const formData = new FormData();
			formData.set(
				'item_ids',
				JSON.stringify(selectedFamilyGroup.members.map((member) => member.id).filter(Boolean))
			);
			formData.set('lead_item_id', String(selectedFamilyGroup.leadItemId));
			formData.set('transfer_fee', String(parseCurrencyInput(familyTransferFeeInput)));
			formData.set('transfer_at', familyTransferDate || new Date().toISOString().slice(0, 10));
			formData.set('proof', preparedFile);

			const res = await fetch(`/api/batches/${batchId}/family-transfer`, {
				method: 'POST',
				body: formData
			});
			if (!res.ok) {
				let msg = 'Gagal menyimpan transfer keluarga';
				try {
					const payload = await res.json();
					msg = payload?.error || msg;
				} catch {
					// no-op
				}
				throw new Error(msg);
			}

			addToast(
				`Transfer keluarga ${selectedFamilyGroup.payeeName} tersimpan (${selectedFamilyGroup.members.length} anggota)`,
				'success'
			);
			closeFamilyTransfer();
			await loadData();
			await autoSkipMissingWhatsapp();
			await maybeCompleteBatch();
		} catch (e) {
			console.error('Failed to submit family transfer:', e);
			addToast(e instanceof Error ? e.message : 'Gagal menyimpan transfer keluarga', 'error');
		} finally {
			familyTransferSubmitting = false;
		}
	}

	function getProofUrl(item: BatchItem): string | undefined {
		if (!item.has_transfer_proof) return undefined;
		// Use current origin so the link works when shared
		return `${window.location.origin}/api/batches/${batchId}/items/${item.id}/proof?format=image`;
	}

	$effect(() => {
		loadData();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	{#if loading}
		<div class="mb-6">
			<StatCardSkeleton />
		</div>
		<TableSkeleton rows={6} columns={6} />
	{:else if batch}
		<!-- Breadcrumbs -->
		<Breadcrumbs items={[
			{ label: 'Dashboard', href: '/', icon: LayoutDashboard },
			{ label: 'Batches', href: '/batches', icon: Layers },
			{ label: batch.name }
		]} />

		<!-- Header -->
		<div class="mb-6 fade-up">
			<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
				<div>
					<h1 class="text-2xl font-bold text-white glow-text brand-font">{batch.name}</h1>
					{#if batch.description}
						<p class="text-white/60 text-sm mt-1">{batch.description}</p>
					{/if}
					<div class="flex items-center gap-3 text-white/40 text-xs mt-1 flex-wrap">
						{#if isSpecial}
							<span class="flex items-center gap-1">
								<Banknote class="w-3 h-3" />
								{formatRupiah(batch.default_amount)} per orang
							</span>
						{:else}
							<span class="flex items-center gap-1">
								<Banknote class="w-3 h-3" />
								{formatRupiah(batch.transport_rate)}/Sabat
							</span>
							<span class="flex items-center gap-1">
								<CalendarDays class="w-3 h-3" />
								{batch.total_saturdays} Sabat bulan ini
							</span>
						{/if}
					</div>
				</div>
				<div class="flex gap-2 flex-wrap">
					<button
						onclick={() => { isEditMode = !isEditMode; }}
						class="glass-button rounded-full px-3 py-2 text-white text-sm border flex items-center gap-1.5
							{isEditMode
								? 'border-amber-400/40 bg-amber-500/20 hover:bg-amber-500/30'
								: 'border-white/20 bg-white/10 hover:bg-white/20'}"
					>
						{#if isEditMode}
							<Lock class="w-4 h-4" />
							Selesai Edit
						{:else}
							<Pencil class="w-4 h-4" />
							Edit
						{/if}
					</button>
					{#if items.length === 0}
						<button
							onclick={populateBatch}
							disabled={!isEditMode}
							class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 flex items-center gap-1.5"
						>
							<UserPlus class="w-4 h-4" />
							Isi Semua Penerima
						</button>
					{/if}
					<button
						onclick={downloadReport}
						disabled={items.length === 0 || downloading}
						class="glass-button rounded-full px-3 py-2 text-white text-sm border border-sky-500/30 flex items-center gap-1.5
							{items.length === 0 || downloading ? 'opacity-50 cursor-not-allowed' : 'bg-sky-500/15 hover:bg-sky-500/30'}"
					>
						<Download class="w-4 h-4" />
						{downloading ? 'Membuat PDF...' : 'Unduh PDF'}
					</button>
					{#if !isSpecial}
						<button
							onclick={setAllFullAttendance}
							disabled={!isEditMode}
							class="glass-button rounded-full px-3 py-2 text-white text-sm border border-emerald-500/20 flex items-center gap-1.5
								{!isEditMode ? 'opacity-50 cursor-not-allowed bg-emerald-500/10' : 'bg-emerald-500/10 hover:bg-emerald-500/25'}"
						>
							<CalendarDays class="w-4 h-4" />
							Hadir Penuh
						</button>
					{/if}
					<button
						onclick={markAllTransferred}
						disabled={!isEditMode || pendingTransferCount === 0}
						class="glass-button rounded-full px-3 py-2 text-white text-sm border border-emerald-500/30 flex items-center gap-1.5
							{!isEditMode || pendingTransferCount === 0 ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-500/20 hover:bg-emerald-500/40'}"
					>
						<CheckCheck class="w-4 h-4" />
						Tandai Semua Lunas
					</button>
				</div>
			</div>
			<div class="glass-card rounded-xl p-2.5 mb-3 flex items-center gap-2 text-xs {isEditMode ? 'border border-amber-400/30 text-amber-100 bg-amber-500/10' : 'border border-white/10 text-white/70'}">
				<Lock class="w-3.5 h-3.5 shrink-0" />
				{#if isEditMode}
					<span>Mode Edit aktif. Perubahan akan langsung tersimpan.</span>
				{:else}
					<span>Mode terkunci untuk mencegah salah tekan. Tekan <strong>Edit</strong> untuk mengubah data.</span>
				{/if}
			</div>

			<!-- Stats -->
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 stagger">
				<div class="glass-card rounded-2xl p-4 lift-on-hover">
					<div class="flex items-center gap-2 mb-1">
						<UsersIcon class="w-3.5 h-3.5 text-white/50" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Penerima</p>
					</div>
					<p class="text-2xl font-bold text-white mt-1">{items.length}</p>
					<p class="text-white/50 text-xs mt-1">Total: {formatRupiah(grandTotal)}</p>
				</div>
				<div class="glass-card rounded-2xl p-4 lift-on-hover">
					<div class="flex items-center gap-2 mb-1">
						{#if isSpecial}
							<Banknote class="w-3.5 h-3.5 text-emerald-400/70" />
							<p class="text-white/60 text-xs uppercase tracking-wider">Per Orang</p>
						{:else}
							<CalendarDays class="w-3.5 h-3.5 text-emerald-400/70" />
							<p class="text-white/60 text-xs uppercase tracking-wider">Kehadiran</p>
						{/if}
					</div>
					{#if isSpecial}
						<p class="text-2xl font-bold text-white mt-1">{formatRupiah(batch.default_amount)}</p>
						<p class="text-white/50 text-xs mt-1">Nominal tetap</p>
					{:else}
						<p class="text-2xl font-bold text-white mt-1">{avgAttendance}<span class="text-sm text-white/40">/{batch.total_saturdays}</span></p>
						<p class="text-white/50 text-xs mt-1">Rata-rata Sabat</p>
					{/if}
				</div>
				<div class="glass-card rounded-2xl p-4 lift-on-hover">
					<div class="flex items-center gap-2 mb-2">
						<ArrowRightLeft class="w-3.5 h-3.5 text-emerald-400/70" />
					</div>
					<ProgressBar current={transferredCount} total={items.length} label="Transfer" color="green" />
				</div>
				<div class="glass-card rounded-2xl p-4 lift-on-hover">
					<div class="flex items-center gap-2 mb-2">
						<Bell class="w-3.5 h-3.5 text-sky-400/70" />
					</div>
					<ProgressBar
						current={notifiedCount}
						total={items.length}
						label="Notifikasi WA"
						color="blue"
						meta={`Skip ${skippedNotifyCount}`}
					/>
				</div>
			</div>

			<div class="glass-card rounded-xl p-3 mb-4 fade-up">
				<div class="flex flex-wrap items-center gap-4 text-xs">
					<div class="text-white/60">
						<span class="text-white/40 mr-1">Transferred:</span>
						<span class="text-emerald-200 font-semibold">{formatRupiah(transferAmountPaidTotal)}</span>
					</div>
					<div class="text-white/60">
						<span class="text-white/40 mr-1">Transfer Fee:</span>
						<span class="text-violet-200 font-semibold">{formatRupiah(transferFeePaidTotal)}</span>
					</div>
					<div class="text-white/60">
						<span class="text-white/40 mr-1">Cash:</span>
						<span class="text-amber-100 font-semibold">{formatRupiah(cashPaidTotal)}</span>
					</div>
					<div class="text-white/60">
						<span class="text-white/40 mr-1">Total Paid:</span>
						<span class="text-sky-200 font-semibold">{formatRupiah(totalPaidSummary)}</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col lg:flex-row lg:items-center gap-3 mb-2 fade-up">
				<div class="flex flex-wrap items-center gap-2">
					<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1">
						<button
							onclick={() => { filterMode = 'all'; }}
							class="nav-pill {filterMode === 'all' ? 'nav-pill-active' : ''}"
						>
							Semua
						</button>
						<button
							onclick={() => { filterMode = 'pending-transfer'; }}
							class="nav-pill {filterMode === 'pending-transfer' ? 'nav-pill-active' : ''}"
						>
							Belum Transfer ({pendingTransferCount})
						</button>
						<button
							onclick={() => { filterMode = 'pending-notify'; }}
							class="nav-pill {filterMode === 'pending-notify' ? 'nav-pill-active' : ''}"
						>
							Belum Notif ({pendingNotifyCount})
						</button>
					</div>
					<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1">
						<button
							onclick={() => { viewMode = 'family'; }}
							class="nav-pill {viewMode === 'family' ? 'nav-pill-active' : ''}"
						>
							Per Keluarga
						</button>
						<button
							onclick={() => { viewMode = 'individual'; }}
							class="nav-pill {viewMode === 'individual' ? 'nav-pill-active' : ''}"
						>
							Per Orang
						</button>
					</div>
				</div>
				<div class="relative w-full lg:w-72">
					<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Cari nama atau bank..."
						class="glass-input rounded-full pl-9 pr-4 py-2 text-white text-sm placeholder-white/30 w-full focus:outline-none focus:ring-2 focus:ring-white/20"
					/>
				</div>
			</div>
		</div>

		<!-- Checklist -->
		{#if viewMode === 'family'}
			{#if visibleFamilyTransferGroups.length === 0}
				<EmptyState
					icon={UsersIcon}
					title="Belum ada grup transfer keluarga"
					description="Gunakan mode Per Orang untuk transfer individual atau cek data family tag di halaman penerima."
				/>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2 fade-up">
					{#each visibleFamilyTransferGroups as group, i}
						<div class="glass-card rounded-2xl p-4 border border-amber-400/20">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="text-white font-semibold text-sm">{i + 1}. {group.payeeName}</p>
									<p class="text-white/50 text-xs mt-0.5">{group.accountLabel}</p>
									<p class="text-amber-200/80 text-xs mt-1">
										{group.members.length} anggota: {group.members.map((member) => member.recipient_name).join(', ')}
									</p>
								</div>
								<button
									onclick={() => openFamilyTransfer(group)}
									disabled={!isEditMode}
									class="glass-button shrink-0 rounded-lg px-3 py-1.5 text-xs border border-emerald-500/30
										{!isEditMode ? 'opacity-50 cursor-not-allowed bg-emerald-500/10' : 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200'}"
								>
									Transfer Keluarga
								</button>
							</div>

							<div class="grid grid-cols-2 gap-2 mt-3 text-xs">
								<div class="rounded-lg bg-white/5 px-2.5 py-2">
									<p class="text-white/45">Total Hak</p>
									<p class="text-white font-semibold">{formatRupiah(group.totalAmount)}</p>
								</div>
								<div class="rounded-lg bg-white/5 px-2.5 py-2">
									<p class="text-white/45">Biaya TF (1x)</p>
									<p class="text-violet-200 font-semibold">{formatRupiah(group.totalFee)}</p>
								</div>
								<div class="rounded-lg bg-white/5 px-2.5 py-2">
									<p class="text-white/45">Total Kirim</p>
									<p class="text-emerald-200 font-semibold">{formatRupiah(group.totalSend)}</p>
								</div>
								<div class="rounded-lg bg-white/5 px-2.5 py-2">
									<p class="text-white/45">Status</p>
									<p class="text-white/80">{group.doneCount}/{group.members.length} transfer • {group.proofCount}/{group.members.length} bukti</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if visibleItems.length === 0}
			<EmptyState
				icon={SearchX}
				title="Tidak ada data untuk filter ini"
				description="Coba ganti filter atau kata kunci pencarian."
			/>
		{:else}
			<!-- Desktop Table (hidden on mobile) -->
			<div class="glass-card rounded-2xl overflow-hidden fade-up hidden lg:block">
				<div class="overflow-x-auto glass-scrollbar pr-2">
					<table class="w-full table-fixed">
						<thead>
							<tr class="border-b border-white/10 table-head-row">
								<th class="text-left px-3 py-3 table-head-cell w-8">#</th>
								<th class="text-left px-3 py-3 table-head-cell w-[180px]">Penerima</th>
								<th class="text-left px-3 py-3 table-head-cell w-[190px]">Rek. Tujuan</th>
								{#if !isSpecial}
									<th class="text-center px-2 py-3 table-head-cell w-[120px]">Sabat</th>
									<th class="text-center px-2 py-3 table-head-cell w-[120px]">Zoom</th>
								{/if}
								<th class="text-right px-2 py-3 table-head-cell w-[110px]">Total</th>
								<th class="text-center px-2 py-3 table-head-cell w-[90px]">Metode</th>
								<th class="text-right px-1.5 py-3 table-head-cell w-[86px]">Biaya TF</th>
								<th class="text-left px-1.5 py-3 table-head-cell w-[110px]">Tgl TF</th>
								<th class="text-center px-1 py-3 table-head-cell w-[56px]">TF</th>
								<th class="text-center px-1 py-3 table-head-cell w-[52px]">WA</th>
							</tr>
						</thead>
						<tbody>
							{#each visibleItems as item, i}
								<tr class={getRowClass(item)}>
									<td class="px-3 py-2.5 text-white/50 text-sm">{i + 1}</td>
									<td class="px-3 py-2.5">
										<div class="text-white text-sm font-medium">{item.recipient_name}</div>
										{#if item.transfer_to_name}
											<div class="text-amber-200/80 text-xs">via {item.transfer_to_name}</div>
										{/if}
									</td>
									<td class="px-3 py-2.5">
										{#if item.transfer_to_id}
											<div class="text-white/70 text-xs">
												<span class="text-amber-200/60">&#8594;</span>
												{item.actual_bank_name} <span class="font-mono">{item.actual_account_number}</span>
											</div>
										{:else if item.bank_name}
											<div class="text-white/70 text-xs">
												{item.bank_name} <span class="font-mono">{item.account_number}</span>
											</div>
										{:else}
											<span class="text-white/30 text-xs">-</span>
										{/if}
									</td>
									{#if !isSpecial}
										<td class="px-3 py-2.5">
											<SaturdayDots
												total={batch.total_saturdays}
												attended={item.saturdays_attended}
												disabled={!isEditMode}
												onchange={(n) => updateSaturdays(item, n)}
											/>
										</td>
										<td class="px-3 py-2.5 text-center">
											<div class="flex flex-col items-center gap-1">
												<ZoomBadge
													zoomType={item.zoom_type}
													singleRate={batch.zoom_single_rate}
													familyRate={batch.zoom_family_rate}
													customAmount={item.custom_zoom_amount}
													disabled={!isEditMode}
													onchange={(t) => updateZoomType(item, t)}
												/>
												{#if item.zoom_type === 'custom'}
													<input
														type="text"
														inputmode="numeric"
														disabled={!isEditMode}
														class="glass-input rounded-md px-2 py-1 text-[11px] text-white/90 w-[110px] text-center"
														value={formatCurrencyInput(item.custom_zoom_amount || 0)}
														onfocus={(e) => { (e.target as HTMLInputElement).value = String(item.custom_zoom_amount || 0); }}
														onblur={(e) => {
															const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
															updateCustomZoomAmount(item, parsed);
															(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
														}}
													/>
												{/if}
											</div>
										</td>
									{/if}
									<td class="px-2 py-2.5 text-right">
										{#if isSpecial}
											<input
												type="text"
												inputmode="numeric"
												disabled={!isEditMode}
												class="glass-input rounded-lg px-2 py-1 text-xs text-white/90 w-[128px] text-right"
												value={formatCurrencyInput(item.amount)}
												onfocus={(e) => { (e.target as HTMLInputElement).value = String(item.amount || 0); }}
												onblur={(e) => {
													const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
													updateAmount(item, parsed);
													(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
												}}
											/>
										{:else}
											<span class="text-white/80 text-sm font-mono font-medium whitespace-nowrap">
												{formatRupiah(item.amount)}
											</span>
										{/if}
									</td>
									<td class="px-2 py-2.5 text-center">
										<select
											class="glass-input rounded-lg px-1.5 py-1 text-[11px] text-white/90 w-[82px]"
											disabled={!isEditMode}
											value={normalizePaymentMethod(item.payment_method)}
											onchange={(e) =>
												updatePaymentMethod(
													item,
													((e.target as HTMLSelectElement).value === 'cash' ? 'cash' : 'transfer')
												)}
										>
											<option value="transfer">Transfer</option>
											<option value="cash">Cash</option>
										</select>
									</td>
									<td class="px-1.5 py-2.5 text-right">
										{#if isCash(item)}
											<span class="text-white/30 text-xs">-</span>
										{:else}
											<input
												type="text"
												inputmode="numeric"
												disabled={!isEditMode}
												class="glass-input rounded-lg px-1.5 py-1 text-[11px] text-white/90 w-[80px] text-right"
												value={formatCurrencyInput(item.transfer_fee || 0)}
												onfocus={(e) => { (e.target as HTMLInputElement).value = String(item.transfer_fee || 0); }}
												onblur={(e) => {
													const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
													updateTransferFee(item, parsed);
													(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
												}}
											/>
										{/if}
									</td>
									<td class="px-1.5 py-2.5">
										{#if item.transfer_status === 'done'}
											<input
												type="date"
												disabled={!isEditMode}
												class="glass-input rounded-lg px-1.5 py-1 text-[11px] text-white/80 w-[104px]"
												value={formatDateInput(item.transfer_at)}
												onchange={(e) => updateTransferDate(item, (e.target as HTMLInputElement).value)}
											/>
										{:else}
											<span class="text-white/30 text-xs">-</span>
										{/if}
									</td>
									<td class="px-1 py-2.5 text-center">
										{#if isCash(item)}
											<button
												type="button"
												disabled={!isEditMode}
												onclick={() => toggleCashPaid(item)}
												class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all
													{item.transfer_status === 'done'
														? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
														: 'bg-white/5 text-white/50 border border-white/15 hover:border-white/30'}"
											>
												<Banknote class="w-3.5 h-3.5" />
												{item.transfer_status === 'done' ? 'Cash' : 'Bayar'}
											</button>
										{:else}
											<TransferProof
												itemId={item.id!}
												{batchId}
												disabled={!isEditMode}
												compact={true}
												transferStatus={item.transfer_status}
												hasProof={!!item.has_transfer_proof}
												recipientName={item.recipient_name || ''}
												onStatusChange={(s, p) => handleTransferChange(item, s, p)}
											/>
										{/if}
									</td>
									<td class="px-1 py-2.5 text-center">
										<WhatsAppButton
											phone={item.whatsapp || ''}
											name={item.recipient_name || ''}
											amount={item.amount}
											compact={true}
											disabled={!isEditMode || item.transfer_status !== 'done'}
											details={isSpecial ? undefined : {
												saturdays_attended: item.saturdays_attended,
												transport_rate: batch.transport_rate,
												zoom_type: item.zoom_type,
												zoom_amount: getZoomAmount(item)
											}}
											proofUrl={item.has_transfer_proof ? getProofUrl(item) : undefined}
											transferInfo={buildTransferInfo(item)}
											notifyStatus={item.notify_status}
											onNotified={() => handleNotify(item)}
										/>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Mobile Card View (hidden on desktop) -->
			<div class="lg:hidden space-y-3 fade-up">
				{#each visibleItems as item, i}
					<div class="glass-card rounded-xl p-4 {item.transfer_status === 'done' && item.notify_status === 'sent' ? 'border-l-4 border-l-emerald-500/50' : isCash(item) ? 'border-l-4 border-l-sky-400/60' : item.transfer_status === 'done' ? 'border-l-4 border-l-amber-500/50' : ''}">
						<div class="flex justify-between items-start gap-3">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-white/40 text-xs">{i + 1}.</span>
									<p class="text-white font-medium text-sm truncate">{item.recipient_name}</p>
								</div>
								{#if item.transfer_to_name}
									<p class="text-amber-200/70 text-xs mt-0.5 ml-5">via {item.transfer_to_name}</p>
								{/if}
								<div class="mt-1 ml-5">
									{#if item.transfer_to_id}
										<p class="text-white/50 text-xs">
											<span class="text-amber-200/60">&#8594;</span>
											{item.actual_bank_name} <span class="font-mono">{item.actual_account_number}</span>
										</p>
									{:else if item.bank_name}
										<p class="text-white/50 text-xs">
											{item.bank_name} <span class="font-mono">{item.account_number}</span>
										</p>
									{/if}
								</div>
							</div>
							<div class="text-right flex-shrink-0">
								{#if isSpecial}
									<input
										type="text"
										inputmode="numeric"
										disabled={!isEditMode}
										class="glass-input rounded-lg px-2 py-1 text-xs text-white/90 w-[120px] text-right"
										value={formatCurrencyInput(item.amount)}
										onfocus={(e) => { (e.target as HTMLInputElement).value = String(item.amount || 0); }}
										onblur={(e) => {
											const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
											updateAmount(item, parsed);
											(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
										}}
									/>
								{:else}
									<span class="text-white font-bold text-sm font-mono">{formatRupiah(item.amount)}</span>
								{/if}
							</div>
						</div>

						<!-- Transfer fee (mobile) -->
						<div class="mt-2 ml-5 flex items-center justify-between">
							<span class="text-white/40 text-xs">Biaya TF</span>
							{#if isCash(item)}
								<span class="text-white/30 text-xs">-</span>
							{:else}
								<input
									type="text"
									inputmode="numeric"
									disabled={!isEditMode}
									class="glass-input rounded-lg px-2 py-1 text-xs text-white/90 w-[110px] text-right"
									value={formatCurrencyInput(item.transfer_fee || 0)}
									onfocus={(e) => { (e.target as HTMLInputElement).value = String(item.transfer_fee || 0); }}
									onblur={(e) => {
										const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
										updateTransferFee(item, parsed);
										(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
									}}
								/>
							{/if}
						</div>

						<div class="mt-2 ml-5 flex items-center justify-between">
							<span class="text-white/40 text-xs">Metode</span>
							<select
								class="glass-input rounded-lg px-2 py-1 text-xs text-white/90"
								disabled={!isEditMode}
								value={normalizePaymentMethod(item.payment_method)}
								onchange={(e) =>
									updatePaymentMethod(
										item,
										((e.target as HTMLSelectElement).value === 'cash' ? 'cash' : 'transfer')
									)}
							>
								<option value="transfer">Transfer</option>
								<option value="cash">Cash</option>
							</select>
						</div>

						{#if !isSpecial}
							<!-- Saturday + Zoom controls -->
							<div class="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
								<div class="flex items-center justify-between">
									<span class="text-white/40 text-xs w-12">Sabat</span>
									<SaturdayDots
										total={batch.total_saturdays}
										attended={item.saturdays_attended}
										disabled={!isEditMode}
										onchange={(n) => updateSaturdays(item, n)}
									/>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-white/40 text-xs w-12">Zoom</span>
									<div class="flex flex-col items-end gap-1">
										<ZoomBadge
											zoomType={item.zoom_type}
											singleRate={batch.zoom_single_rate}
											familyRate={batch.zoom_family_rate}
											customAmount={item.custom_zoom_amount}
											disabled={!isEditMode}
											onchange={(t) => updateZoomType(item, t)}
										/>
										{#if item.zoom_type === 'custom'}
											<input
												type="text"
												inputmode="numeric"
												disabled={!isEditMode}
												class="glass-input rounded-md px-2 py-1 text-[11px] text-white/90 w-[120px] text-right"
												value={formatCurrencyInput(item.custom_zoom_amount || 0)}
												onfocus={(e) => { (e.target as HTMLInputElement).value = String(item.custom_zoom_amount || 0); }}
												onblur={(e) => {
													const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
													updateCustomZoomAmount(item, parsed);
													(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
												}}
											/>
										{/if}
									</div>
								</div>
							</div>
						{/if}

						<!-- Actions -->
						<div class="mt-3 pt-3 border-t border-white/[0.06]">
							<div class="flex items-center gap-2 flex-wrap">
								{#if isCash(item)}
									<button
										type="button"
										disabled={!isEditMode}
										onclick={() => toggleCashPaid(item)}
										class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all
											{item.transfer_status === 'done'
												? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
												: 'bg-white/5 text-white/50 border border-white/15 hover:border-white/30'}"
									>
										<Banknote class="w-3.5 h-3.5" />
										{item.transfer_status === 'done' ? 'Cash' : 'Bayar'}
									</button>
								{:else}
									<TransferProof
										itemId={item.id!}
										{batchId}
										disabled={!isEditMode}
										transferStatus={item.transfer_status}
										hasProof={!!item.has_transfer_proof}
										recipientName={item.recipient_name || ''}
										onStatusChange={(s, p) => handleTransferChange(item, s, p)}
									/>
								{/if}
								{#if item.transfer_status === 'done'}
									<input
										type="date"
										disabled={!isEditMode}
										class="glass-input rounded-lg px-2 py-1 text-xs text-white/80"
										value={formatDateInput(item.transfer_at)}
										onchange={(e) => updateTransferDate(item, (e.target as HTMLInputElement).value)}
									/>
								{/if}
							</div>
							<div class="mt-2 flex justify-end">
								<WhatsAppButton
									phone={item.whatsapp || ''}
									name={item.recipient_name || ''}
									amount={item.amount}
									disabled={!isEditMode || item.transfer_status !== 'done'}
									details={isSpecial ? undefined : {
										saturdays_attended: item.saturdays_attended,
										transport_rate: batch.transport_rate,
										zoom_type: item.zoom_type,
										zoom_amount: getZoomAmount(item)
									}}
									proofUrl={item.has_transfer_proof ? getProofUrl(item) : undefined}
									transferInfo={buildTransferInfo(item)}
									notifyStatus={item.notify_status}
									onNotified={() => handleNotify(item)}
								/>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if selectedFamilyGroup}
			<div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
				<div class="glass-card w-full max-w-lg rounded-2xl p-4 border border-white/15">
					<div class="flex items-start justify-between gap-3 mb-3">
						<div>
							<p class="text-white text-base font-semibold">Transfer Keluarga</p>
							<p class="text-white/55 text-xs mt-0.5">
								Via {selectedFamilyGroup.payeeName} • {selectedFamilyGroup.members.length} anggota
							</p>
						</div>
						<button
							type="button"
							class="text-white/40 hover:text-white/70 text-xs"
							onclick={closeFamilyTransfer}
							disabled={familyTransferSubmitting}
						>
							Tutup
						</button>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 text-xs">
						<div class="rounded-lg bg-white/5 px-2.5 py-2">
							<p class="text-white/45">Total Hak</p>
							<p class="text-white font-semibold">{formatRupiah(selectedFamilyGroup.totalAmount)}</p>
						</div>
						<div class="rounded-lg bg-white/5 px-2.5 py-2">
							<p class="text-white/45">Biaya TF</p>
							<p class="text-violet-200 font-semibold">{formatRupiah(parseCurrencyInput(familyTransferFeeInput))}</p>
						</div>
						<div class="rounded-lg bg-white/5 px-2.5 py-2">
							<p class="text-white/45">Total Kirim</p>
							<p class="text-emerald-200 font-semibold">
								{formatRupiah(selectedFamilyGroup.totalAmount + parseCurrencyInput(familyTransferFeeInput))}
							</p>
						</div>
					</div>

					<div class="space-y-2.5 mb-3">
						<div>
							<label for="family-transfer-date" class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Tanggal Transfer</label>
							<input
								id="family-transfer-date"
								type="date"
								class="glass-input rounded-lg px-3 py-2 text-sm text-white w-full"
								bind:value={familyTransferDate}
								disabled={familyTransferSubmitting}
							/>
						</div>
						<div>
							<label for="family-transfer-fee" class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Biaya Transfer (1x)</label>
							<input
								id="family-transfer-fee"
								type="text"
								inputmode="numeric"
								class="glass-input rounded-lg px-3 py-2 text-sm text-white w-full"
								value={formatCurrencyInput(parseCurrencyInput(familyTransferFeeInput))}
								disabled={familyTransferSubmitting}
								onfocus={(e) => { (e.target as HTMLInputElement).value = String(parseCurrencyInput(familyTransferFeeInput)); }}
								onblur={(e) => { familyTransferFeeInput = String(parseCurrencyInput((e.target as HTMLInputElement).value)); }}
							/>
						</div>
						<div>
							<label for="family-transfer-proof" class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Bukti Transfer (1 file untuk semua anggota)</label>
							<input
								id="family-transfer-proof"
								type="file"
								accept="image/*"
								class="glass-input rounded-lg px-3 py-2 text-sm text-white w-full"
								disabled={familyTransferSubmitting}
								onchange={(e) => {
									familyTransferFile = (e.target as HTMLInputElement).files?.[0] || null;
								}}
							/>
							{#if familyTransferFile}
								<p class="text-white/45 text-xs mt-1">File: {familyTransferFile.name}</p>
							{/if}
						</div>
					</div>

					<div class="flex justify-end gap-2">
						<button
							type="button"
							class="glass-button rounded-lg px-3 py-2 text-xs border border-white/20 text-white/70"
							onclick={closeFamilyTransfer}
							disabled={familyTransferSubmitting}
						>
							Batal
						</button>
						<button
							type="button"
							class="glass-button rounded-lg px-3 py-2 text-xs border border-emerald-500/30 bg-emerald-500/20 text-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
							onclick={submitFamilyTransfer}
							disabled={familyTransferSubmitting}
						>
							{familyTransferSubmitting ? 'Menyimpan...' : 'Terapkan ke Semua Anggota'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	{:else}
		<EmptyState
			icon={Layers}
			title="Batch tidak ditemukan"
			description="Batch yang Anda cari mungkin sudah dihapus."
			actionLabel="Kembali ke Batches"
			actionHref="/batches"
		/>
	{/if}
</div>
