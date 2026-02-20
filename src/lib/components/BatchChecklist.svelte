<script lang="ts">
	import type { Batch, BatchItem } from '$lib/types.js';
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

	let { batchId }: { batchId: number } = $props();

	let batch = $state<Batch | null>(null);
	let items = $state<BatchItem[]>([]);
	let loading = $state(true);
	let filterMode = $state<'all' | 'pending-transfer' | 'pending-notify'>('all');
	let searchQuery = $state('');
	let completing = $state(false);
	let autoSkipping = $state(false);
	let downloading = $state(false);
	let isSpecial = $derived(batch?.type === 'special');

	function normalizePaymentMethod(value?: string | null): 'transfer' | 'cash' {
		return String(value || '').trim().toLowerCase() === 'cash' ? 'cash' : 'transfer';
	}

	function isCash(item: BatchItem): boolean {
		return normalizePaymentMethod(item.payment_method) === 'cash';
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
	let visibleItems = $derived(
		items.filter(i => {
			if (filterMode === 'pending-transfer' && i.transfer_status !== 'pending') return false;
			if (filterMode === 'pending-notify' && !(i.transfer_status === 'done' && i.notify_status === 'pending')) return false;
			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return (i.recipient_name || '').toLowerCase().includes(q) || (i.bank_name || '').toLowerCase().includes(q);
		})
	);

	async function updatePaymentMethod(item: BatchItem, method: 'transfer' | 'cash') {
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
		if (!batch) return;
		const oldSat = item.saturdays_attended;
		const newAmount = calculateAmount(newSaturdays, batch.transport_rate, item.zoom_type, batch.zoom_single_rate, batch.zoom_family_rate);
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
			item.amount = calculateAmount(oldSat, batch.transport_rate, item.zoom_type, batch.zoom_single_rate, batch.zoom_family_rate);
			console.error('Failed to update saturdays:', e);
			addToast('Gagal mengubah kehadiran', 'error');
		}
	}

	async function updateZoomType(item: BatchItem, newType: 'none' | 'single' | 'family') {
		if (!batch) return;
		const oldType = item.zoom_type;
		const newAmount = calculateAmount(item.saturdays_attended, batch.transport_rate, newType, batch.zoom_single_rate, batch.zoom_family_rate);
		// Optimistic update
		item.zoom_type = newType;
		item.amount = newAmount;
		try {
			await fetch(`/api/batches/${batchId}/items/${item.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ zoom_type: newType })
			});
		} catch (e) {
			// Revert on error
			item.zoom_type = oldType;
			item.amount = calculateAmount(item.saturdays_attended, batch.transport_rate, oldType, batch.zoom_single_rate, batch.zoom_family_rate);
			console.error('Failed to update zoom:', e);
			addToast('Gagal mengubah zoom', 'error');
		}
	}

	async function updateAmount(item: BatchItem, newAmount: number) {
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
		return item.zoom_type === 'single' ? batch.zoom_single_rate : item.zoom_type === 'family' ? batch.zoom_family_rate : 0;
	}

	function formatCurrencyInput(value: number): string {
		return `Rp. ${Math.max(0, Math.round(value || 0)).toLocaleString('id-ID')}`;
	}

	function parseCurrencyInput(value: string): number {
		const digits = value.replace(/\D/g, '');
		return digits ? Number(digits) : 0;
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
					{#if items.length === 0}
						<button
							onclick={populateBatch}
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
							class="glass-button rounded-full px-3 py-2 text-white text-sm border border-emerald-500/20 flex items-center gap-1.5
								bg-emerald-500/10 hover:bg-emerald-500/25"
						>
							<CalendarDays class="w-4 h-4" />
							Hadir Penuh
						</button>
					{/if}
					<button
						onclick={markAllTransferred}
						disabled={pendingTransferCount === 0}
						class="glass-button rounded-full px-3 py-2 text-white text-sm border border-emerald-500/30 flex items-center gap-1.5
							{pendingTransferCount === 0 ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-500/20 hover:bg-emerald-500/40'}"
					>
						<CheckCheck class="w-4 h-4" />
						Tandai Semua Lunas
					</button>
				</div>
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
		{#if visibleItems.length === 0}
			<EmptyState
				icon={SearchX}
				title="Tidak ada data untuk filter ini"
				description="Coba ganti filter atau kata kunci pencarian."
			/>
		{:else}
			<!-- Desktop Table (hidden on mobile) -->
			<div class="glass-card rounded-2xl overflow-hidden fade-up hidden lg:block">
				<div class="overflow-x-auto glass-scrollbar pr-2">
					<table class="w-full">
						<thead>
							<tr class="border-b border-white/10 table-head-row">
								<th class="text-left px-3 py-3 table-head-cell w-8">#</th>
								<th class="text-left px-3 py-3 table-head-cell">Penerima</th>
								<th class="text-left px-3 py-3 table-head-cell">Rek. Tujuan</th>
								{#if !isSpecial}
									<th class="text-center px-3 py-3 table-head-cell">Sabat</th>
									<th class="text-center px-3 py-3 table-head-cell">Zoom</th>
								{/if}
								<th class="text-right px-3 py-3 table-head-cell">Total</th>
								<th class="text-center px-3 py-3 table-head-cell">Metode</th>
								<th class="text-right px-2 py-3 table-head-cell">Biaya TF</th>
								<th class="text-left px-2 py-3 table-head-cell">Tgl TF</th>
								<th class="text-center px-3 py-3 table-head-cell w-12">TF</th>
								<th class="text-center pl-1 pr-3 py-3 table-head-cell w-14">WA</th>
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
												onchange={(n) => updateSaturdays(item, n)}
											/>
										</td>
										<td class="px-3 py-2.5 text-center">
											<ZoomBadge
												zoomType={item.zoom_type}
												singleRate={batch.zoom_single_rate}
												familyRate={batch.zoom_family_rate}
												onchange={(t) => updateZoomType(item, t)}
											/>
										</td>
									{/if}
									<td class="px-3 py-2.5 text-right">
										{#if isSpecial}
											<input
												type="text"
												inputmode="numeric"
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
											<span class="text-white/80 text-sm font-mono font-medium">
												{formatRupiah(item.amount)}
											</span>
										{/if}
									</td>
									<td class="px-3 py-2.5 text-center">
										<select
											class="glass-input rounded-lg px-2 py-1 text-xs text-white/90"
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
									<td class="px-2 py-2.5 text-right">
										{#if isCash(item)}
											<span class="text-white/30 text-xs">-</span>
										{:else}
											<input
												type="text"
												inputmode="numeric"
												class="glass-input rounded-lg px-2 py-1 text-xs text-white/90 w-[92px] text-right"
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
									<td class="px-2 py-2.5">
										{#if item.transfer_status === 'done'}
											<input
												type="date"
												class="glass-input rounded-lg px-2 py-1 text-xs text-white/80 w-[124px]"
												value={formatDateInput(item.transfer_at)}
												onchange={(e) => updateTransferDate(item, (e.target as HTMLInputElement).value)}
											/>
										{:else}
											<span class="text-white/30 text-xs">-</span>
										{/if}
									</td>
									<td class="px-3 py-2.5">
										{#if isCash(item)}
											<button
												type="button"
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
												transferStatus={item.transfer_status}
												hasProof={!!item.has_transfer_proof}
												recipientName={item.recipient_name || ''}
												onStatusChange={(s, p) => handleTransferChange(item, s, p)}
											/>
										{/if}
									</td>
									<td class="pl-1 pr-3 py-2.5 text-center">
										<WhatsAppButton
											phone={item.whatsapp || ''}
											name={item.recipient_name || ''}
											amount={item.amount}
											disabled={item.transfer_status !== 'done'}
											details={isSpecial ? undefined : {
												saturdays_attended: item.saturdays_attended,
												transport_rate: batch.transport_rate,
												zoom_type: item.zoom_type,
												zoom_amount: getZoomAmount(item)
											}}
											proofUrl={item.has_transfer_proof ? getProofUrl(item) : undefined}
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
										onchange={(n) => updateSaturdays(item, n)}
									/>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-white/40 text-xs w-12">Zoom</span>
									<ZoomBadge
										zoomType={item.zoom_type}
										singleRate={batch.zoom_single_rate}
										familyRate={batch.zoom_family_rate}
										onchange={(t) => updateZoomType(item, t)}
									/>
								</div>
							</div>
						{/if}

						<!-- Actions -->
						<div class="mt-3 pt-3 border-t border-white/[0.06]">
							<div class="flex items-center gap-2 flex-wrap">
								{#if isCash(item)}
									<button
										type="button"
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
										transferStatus={item.transfer_status}
										hasProof={!!item.has_transfer_proof}
										recipientName={item.recipient_name || ''}
										onStatusChange={(s, p) => handleTransferChange(item, s, p)}
									/>
								{/if}
								{#if item.transfer_status === 'done'}
									<input
										type="date"
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
									disabled={item.transfer_status !== 'done'}
									details={isSpecial ? undefined : {
										saturdays_attended: item.saturdays_attended,
										transport_rate: batch.transport_rate,
										zoom_type: item.zoom_type,
										zoom_amount: getZoomAmount(item)
									}}
									proofUrl={item.has_transfer_proof ? getProofUrl(item) : undefined}
									notifyStatus={item.notify_status}
									onNotified={() => handleNotify(item)}
								/>
							</div>
						</div>
					</div>
				{/each}
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
