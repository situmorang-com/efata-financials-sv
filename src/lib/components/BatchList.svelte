<script lang="ts">
	import type { Batch, BatchItem } from '$lib/types.js';
	import { formatRupiah, formatDate } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import { confirmDialog } from '$lib/stores/confirm.svelte.js';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import EmptyState from './EmptyState.svelte';
	import BatchCardSkeleton from './skeletons/BatchCardSkeleton.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Layers from '@lucide/svelte/icons/layers';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Banknote from '@lucide/svelte/icons/banknote';
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	let batches = $state<Batch[]>([]);
	let loading = $state(true);
	let showForm = $state(false);
	let createMode = $state<'monthly' | 'special'>('monthly');
	let formData = $state({
		name: '',
		description: 'Transport & Zoom',
		total_saturdays: 4,
		transport_rate: 25000,
		zoom_single_rate: 50000,
		zoom_family_rate: 30000
	});
	let specialFormData = $state({
		name: '',
		description: 'Batch Spesial',
		amount: 100000
	});
	let selectedMonth = $state((new Date().getMonth() + 11) % 12);
	let selectedYear = $state(new Date().getFullYear());
	const months = [
		'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
		'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
	];
	const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);
	let statusFilter = $state<'all' | 'active' | 'done'>('all');
	let attendanceMap = $state<Record<number, { avg: number; total: number; totalAmount: number }>>({});

	let filteredBatches = $derived(
		statusFilter === 'all'
			? batches
			: batches.filter(b => statusFilter === 'active' ? b.status === 'active' : b.status !== 'active')
	);

	let activeCount = $derived(batches.filter(b => b.status === 'active').length);

	// Live calculation preview
	let previewFullAttendance = $derived(formData.total_saturdays * formData.transport_rate + formData.zoom_single_rate);
	let previewFamilyFull = $derived(formData.total_saturdays * formData.transport_rate + formData.zoom_family_rate);

	function formatCurrencyInput(value: number): string {
		return `Rp. ${Math.max(0, Math.round(value || 0)).toLocaleString('id-ID')}`;
	}

	function parseCurrencyInput(value: string): number {
		const digits = value.replace(/\D/g, '');
		return digits ? Number(digits) : 0;
	}

	async function loadBatches() {
		try {
			const res = await fetch('/api/batches');
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to load batches');
			}
			if (!Array.isArray(payload)) {
				throw new Error('Invalid batches payload');
			}
			batches = payload as Batch[];
			const details = await Promise.all(
				batches
					.filter(b => b.id)
					.map(async (b) => {
						try {
							const itemsRes = await fetch(`/api/batches/${b.id}/items`);
							const items = await itemsRes.json() as BatchItem[];
							const total = items.length;
							const avg = total > 0
								? items.reduce((sum, item) => sum + (item.saturdays_attended || 0), 0) / total
								: 0;
							const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);
							return { id: b.id!, total, avg, totalAmount };
						} catch {
							return { id: b.id!, total: 0, avg: 0, totalAmount: 0 };
						}
					})
			);
			attendanceMap = details.reduce((acc, item) => {
				acc[item.id] = { avg: item.avg, total: item.total, totalAmount: item.totalAmount };
				return acc;
			}, {} as Record<number, { avg: number; total: number; totalAmount: number }>);
		} catch (e) {
			console.error('Failed to load batches:', e);
		} finally {
			loading = false;
		}
	}

	async function createBatch() {
		try {
			let payload: Record<string, unknown>;
			if (createMode === 'special') {
				if (!specialFormData.name.trim()) {
					addToast('Nama batch spesial wajib diisi', 'error');
					return;
				}
				payload = {
					type: 'special',
					name: specialFormData.name.trim(),
					description: specialFormData.description?.trim() || 'Batch Spesial',
					default_amount: Number(specialFormData.amount) || 0
				};
			} else {
				payload = {
					type: 'monthly',
					name: `Transfer ${months[selectedMonth]} ${selectedYear}`,
					description: 'Transport & Zoom',
					total_saturdays: formData.total_saturdays,
					transport_rate: formData.transport_rate,
					zoom_single_rate: formData.zoom_single_rate,
					zoom_family_rate: formData.zoom_family_rate
				};
			}
			const res = await fetch('/api/batches', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const batchResult = await res.json();
			if (!res.ok) {
				throw new Error(batchResult?.error || 'Gagal membuat batch');
			}
			const populateRes = await fetch(`/api/batches/${batchResult.id}/populate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const populateResult = await populateRes.json();
			if (!populateRes.ok) {
				throw new Error(populateResult?.error || 'Batch dibuat, tetapi gagal mengisi penerima');
			}
			showForm = false;
			formData = { name: '', description: 'Transport & Zoom', total_saturdays: 4, transport_rate: 25000, zoom_single_rate: 50000, zoom_family_rate: 30000 };
			specialFormData = { name: '', description: 'Batch Spesial', amount: 100000 };
			addToast('Batch berhasil dibuat', 'success');
			window.location.href = `/batches/${batchResult.id}`;
		} catch (e) {
			console.error('Failed to create batch:', e);
			addToast(e instanceof Error ? e.message : 'Gagal membuat batch', 'error');
		}
	}

	async function deleteBatch(id: number) {
		const confirmed = await confirmDialog({
			title: 'Hapus Batch',
			description: 'Batch dan semua data transfer di dalamnya akan dihapus permanen. Aksi ini tidak bisa dibatalkan.',
			confirmLabel: 'Hapus',
			variant: 'danger'
		});
		if (!confirmed) return;
		try {
			await fetch(`/api/batches/${id}`, { method: 'DELETE' });
			addToast('Batch berhasil dihapus', 'success');
			await loadBatches();
		} catch (e) {
			console.error('Failed to delete batch:', e);
			addToast('Gagal menghapus batch', 'error');
		}
	}

	function downloadReport(batch: Batch) {
		if (!batch.id) return;
		const a = document.createElement('a');
		a.href = `/api/batches/${batch.id}/report`;
		a.download = `batch-${batch.id}-${batch.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	$effect(() => {
		loadBatches();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Dashboard', href: '/', icon: LayoutDashboard },
		{ label: 'Batches', icon: Layers }
	]} />

	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font">Batch Transfer</h1>
			<p class="text-white/60 text-sm mt-1">{batches.length} batch &middot; {activeCount} aktif</p>
		</div>
		<div class="flex flex-wrap gap-3 w-full lg:w-auto">
			<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1">
				<button
					onclick={() => { statusFilter = 'all'; }}
					class="nav-pill {statusFilter === 'all' ? 'nav-pill-active' : ''}"
				>
					Semua
				</button>
				<button
					onclick={() => { statusFilter = 'active'; }}
					class="nav-pill {statusFilter === 'active' ? 'nav-pill-active' : ''}"
				>
					Aktif
				</button>
				<button
					onclick={() => { statusFilter = 'done'; }}
					class="nav-pill {statusFilter === 'done' ? 'nav-pill-active' : ''}"
				>
					Selesai
				</button>
			</div>
			<button
				onclick={() => { showForm = !showForm; }}
				class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold {showForm ? 'bg-white/10' : 'bg-emerald-500/25 hover:bg-emerald-500/40'} flex items-center gap-1.5"
			>
				{#if showForm}
					<ChevronUp class="w-4 h-4" />
					Tutup Form
				{:else}
					<Plus class="w-4 h-4" />
					Batch Baru
				{/if}
			</button>
		</div>
	</div>

	<!-- Inline Create Form -->
	{#if showForm}
		<div class="glass-card rounded-2xl border border-white/15 mb-6 fade-up overflow-hidden">
			<div class="p-5 sm:p-6">
				<div class="flex items-center justify-between mb-4">
					<div>
						<h2 class="text-lg font-semibold text-white brand-font">
							{createMode === 'monthly' ? 'Buat Batch Baru Transport & Zoom Bulanan' : 'Buat Batch Spesial'}
						</h2>
						<p class="text-white/50 text-sm mt-0.5">
							{createMode === 'monthly'
								? 'Konfigurasi transfer bulanan.'
								: 'Batch sederhana dengan nominal tetap untuk semua penerima.'}
						</p>
					</div>
					<button onclick={() => { showForm = false; }} class="text-white/40 hover:text-white/70 transition-colors rounded-lg p-1.5 hover:bg-white/5">
						<X class="w-4 h-4" />
					</button>
				</div>

				<form onsubmit={(e) => { e.preventDefault(); createBatch(); }} class="space-y-4">
					<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1 w-fit">
						<button
							type="button"
							onclick={() => { createMode = 'monthly'; }}
							class="nav-pill {createMode === 'monthly' ? 'nav-pill-active' : ''}"
						>
							Bulanan
						</button>
						<button
							type="button"
							onclick={() => { createMode = 'special'; }}
							class="nav-pill {createMode === 'special' ? 'nav-pill-active' : ''}"
						>
							Spesial
						</button>
					</div>

					{#if createMode === 'monthly'}
						<!-- Basic Info — single row on desktop -->
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Bulan</label>
								<select
									bind:value={selectedMonth}
									class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
								>
									{#each months as m, i}
										<option value={i}>{m}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Tahun</label>
								<select
									bind:value={selectedYear}
									class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
								>
									{#each years as y}
										<option value={y}>{y}</option>
									{/each}
								</select>
							</div>
						</div>

						<!-- Config — all 4 fields in one row on desktop -->
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
							<div>
								<label class="block text-white/50 text-xs mb-1">
									<span class="text-emerald-400">●</span> Jumlah Sabat
								</label>
								<input
									type="number"
									bind:value={formData.total_saturdays}
									min="1"
									max="5"
									class="w-full glass-input rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
								/>
							</div>
							<div>
								<label class="block text-white/50 text-xs mb-1">
									<span class="text-emerald-400">●</span> Rate/Sabat
								</label>
								<input
									type="text"
									inputmode="numeric"
									value={formatCurrencyInput(formData.transport_rate)}
									onfocus={(e) => { (e.target as HTMLInputElement).value = String(formData.transport_rate || 0); }}
									onblur={(e) => {
										const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
										formData.transport_rate = parsed;
										(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
									}}
									class="w-full glass-input rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
								/>
							</div>
							<div>
								<label class="block text-white/50 text-xs mb-1">
									<span class="text-violet-400">●</span> Zoom Sendiri
								</label>
								<input
									type="text"
									inputmode="numeric"
									value={formatCurrencyInput(formData.zoom_single_rate)}
									onfocus={(e) => { (e.target as HTMLInputElement).value = String(formData.zoom_single_rate || 0); }}
									onblur={(e) => {
										const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
										formData.zoom_single_rate = parsed;
										(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
									}}
									class="w-full glass-input rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
								/>
							</div>
							<div>
								<label class="block text-white/50 text-xs mb-1">
									<span class="text-amber-400">●</span> Zoom Keluarga
								</label>
								<input
									type="text"
									inputmode="numeric"
									value={formatCurrencyInput(formData.zoom_family_rate)}
									onfocus={(e) => { (e.target as HTMLInputElement).value = String(formData.zoom_family_rate || 0); }}
									onblur={(e) => {
										const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
										formData.zoom_family_rate = parsed;
										(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
									}}
									class="w-full glass-input rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
								/>
							</div>
						</div>

						<div class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/50">
							<span>Full + Zoom sendiri: <span class="text-emerald-300 font-medium">{formatRupiah(previewFullAttendance)}</span></span>
							<span>Full + Zoom keluarga: <span class="text-amber-300 font-medium">{formatRupiah(previewFamilyFull)}</span></span>
							<span>Full, tanpa zoom: <span class="text-white/70 font-medium">{formatRupiah(formData.total_saturdays * formData.transport_rate)}</span></span>
						</div>
					{:else}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Nama Batch</label>
								<input
									type="text"
									bind:value={specialFormData.name}
									placeholder="Contoh: Bonus Pelayanan Maret 2026"
									class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
								/>
							</div>
							<div>
								<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Nominal Per Orang</label>
								<input
									type="text"
									inputmode="numeric"
									value={formatCurrencyInput(specialFormData.amount)}
									onfocus={(e) => { (e.target as HTMLInputElement).value = String(specialFormData.amount || 0); }}
									onblur={(e) => {
										const parsed = parseCurrencyInput((e.target as HTMLInputElement).value);
										specialFormData.amount = parsed;
										(e.target as HTMLInputElement).value = formatCurrencyInput(parsed);
									}}
									class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
								/>
							</div>
						</div>
						<div>
							<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Deskripsi</label>
							<input
								type="text"
								bind:value={specialFormData.description}
								placeholder="Keterangan batch spesial"
								class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
							/>
						</div>
						<p class="text-xs text-white/50">
							Nominal tetap untuk semua penerima: <span class="text-emerald-300 font-medium">{formatRupiah(specialFormData.amount || 0)}</span>
						</p>
					{/if}

					<!-- Actions -->
					<div class="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-3 pt-2 border-t border-white/5">
						<button type="button" onclick={() => { showForm = false; }} class="glass-button rounded-xl px-4 py-2.5 text-white/80 text-sm">
							Batal
						</button>
						<button type="submit" class="glass-button rounded-xl px-5 py-2.5 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 flex items-center gap-1.5">
							<Plus class="w-4 h-4" />
							Buat & Isi Penerima
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if loading}
		<BatchCardSkeleton count={3} />
	{:else if batches.length === 0 && !showForm}
		<EmptyState
			icon={Layers}
			title="Belum ada batch"
			description="Buat batch baru untuk memulai proses transfer dan notifikasi WhatsApp."
		/>
	{:else}
		<div class="grid gap-4 stagger">
			{#if filteredBatches.length === 0}
				<EmptyState
					icon={Layers}
					title="Tidak ada batch untuk filter ini"
					description="Coba ganti filter status."
				/>
			{/if}
			{#each filteredBatches as b}
				{@const total = b.total_items || 0}
				{@const attendance = b.id ? attendanceMap[b.id] : undefined}
				{@const recipientTotal = total || attendance?.total || 0}
				{@const totalRupiah = attendance?.totalAmount || 0}
				{@const avgAttendance = attendance?.avg || 0}
				{@const transferred = b.transferred_count || 0}
				{@const notified = b.notified_count || 0}
				<a href="/batches/{b.id}" class="block glass-card rounded-2xl p-5 hover:bg-white/5 transition-all lift-on-hover group">
					<div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<h3 class="text-white font-semibold truncate brand-font">{b.name}</h3>
								<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full {b.status === 'active' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30' : 'bg-white/10 text-white/60 border border-white/20'}">
									{#if b.status === 'active'}
										<CircleDot class="w-3 h-3" />
									{:else}
										<CheckCircle2 class="w-3 h-3" />
									{/if}
									{b.status === 'active' ? 'Aktif' : 'Selesai'}
								</span>
								<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-white/20 bg-white/10 text-white/70">
									{b.type === 'special' ? 'Spesial' : 'Bulanan'}
								</span>
							</div>
							{#if b.description}
								<p class="text-white/50 text-sm mt-0.5 truncate">{b.description}</p>
							{/if}
							<p class="text-white/40 text-xs mt-1.5 flex items-center gap-3 flex-wrap">
								<span class="inline-flex items-center gap-1">
									<Calendar class="w-3 h-3" />
									{formatDate(b.created_at)}
								</span>
								{#if b.type === 'special'}
									<span class="inline-flex items-center gap-1">
										<Banknote class="w-3 h-3" />
										{formatRupiah(b.default_amount)} per orang
									</span>
								{:else}
									<span class="inline-flex items-center gap-1">
										<Banknote class="w-3 h-3" />
										{formatRupiah(b.transport_rate)}/Sabat
									</span>
									<span class="inline-flex items-center gap-1 text-white/30">
										{b.total_saturdays} Sabat
									</span>
								{/if}
							</p>
						</div>
						<div class="flex items-center gap-3 text-sm lg:shrink-0">
							<div class="text-center">
								<p class="text-emerald-300 font-bold">{transferred}/{total}</p>
								<p class="text-white/40 text-xs">Transfer</p>
							</div>
							<div class="text-center">
								<p class="text-sky-300 font-bold">{notified}/{total}</p>
								<p class="text-white/40 text-xs">Notif</p>
							</div>
							<button
								onclick={(e) => { e.preventDefault(); e.stopPropagation(); downloadReport(b); }}
								disabled={b.status === 'active'}
								class={`p-1.5 rounded-lg transition-colors ${b.status === 'active' ? 'text-white/20 cursor-not-allowed' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
								title="Unduh PDF"
							>
								<Download class="w-4 h-4" />
							</button>
							<button
								onclick={(e) => { e.preventDefault(); e.stopPropagation(); deleteBatch(b.id!); }}
								class="text-white/30 hover:text-red-300 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
								title="Hapus batch"
							>
								<Trash2 class="w-4 h-4" />
							</button>
						</div>
					</div>
					<div class="mt-3 flex flex-wrap gap-2 text-xs lg:max-w-[70%]">
						<div class="glass rounded-full px-3 py-1.5 text-white/70">
							<span class="text-white/50 uppercase tracking-widest text-[10px]">Penerima</span>
							<span class="text-white font-semibold ml-2">{recipientTotal}</span>
						</div>
						<div class="glass rounded-full px-3 py-1.5 text-white/70">
							<span class="text-white/50 uppercase tracking-widest text-[10px]">Total Rupiah</span>
							<span class="text-emerald-200 font-semibold ml-2">{formatRupiah(totalRupiah)}</span>
						</div>
						{#if b.type === 'special'}
							<div class="glass rounded-full px-3 py-1.5 text-white/70">
								<span class="text-white/50 uppercase tracking-widest text-[10px]">Per Orang</span>
								<span class="text-white font-semibold ml-2">{formatRupiah(b.default_amount)}</span>
							</div>
						{:else}
							<div class="glass rounded-full px-3 py-1.5 text-white/70">
								<span class="text-white/50 uppercase tracking-widest text-[10px]">Rata-rata Sabat</span>
								<span class="text-white font-semibold ml-2">
									{avgAttendance ? avgAttendance.toFixed(1) : '0.0'}/{b.total_saturdays}
								</span>
							</div>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
