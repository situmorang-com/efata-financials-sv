<script lang="ts">
	import type { FinanceTransaction, FinanceCategory, FinanceParty, FinanceAccount } from '$lib/types.js';
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let loading = $state(true);
	let saving = $state(false);
	let showForm = $state(false);
	let items = $state<FinanceTransaction[]>([]);
	let categories = $state<FinanceCategory[]>([]);
	let parties = $state<FinanceParty[]>([]);
	let accounts = $state<FinanceAccount[]>([]);
	const offeringPlans = [
		'Local Church Budget',
		'Conference Advance',
		'Union Mission',
		'World Mission',
		'Special Project'
	];

	let filterType = $state<'all' | 'tithe' | 'offering' | 'other_income'>('all');
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterQuery = $state('');

	let formData = $state({
		sub_type: 'tithe' as 'tithe' | 'offering' | 'other_income',
		party_id: '',
		category_id: '',
		account_id: '',
		amount: 0,
		txn_date: new Date().toISOString().slice(0, 10),
		payment_method: 'transfer',
		service_label: '',
		reference_no: '',
		notes: ''
	});

	let visibleItems = $derived(items.filter((i) => i.status !== 'void'));
	let categoryLocked = $derived(formData.sub_type === 'tithe' || formData.sub_type === 'offering');

	function mappedCategoryName(subType: 'tithe' | 'offering' | 'other_income'): string | null {
		if (subType === 'tithe') return 'Persepuluhan';
		if (subType === 'offering') return 'Persembahan';
		return null;
	}

	function syncMappedCategory() {
		const mapped = mappedCategoryName(formData.sub_type);
		if (!mapped) return;
		const found = categories.find((c) => c.name.toLowerCase() === mapped.toLowerCase());
		if (found?.id) {
			formData.category_id = String(found.id);
		}
	}

	function syncDestination() {
		if (formData.sub_type === 'tithe') {
			formData.service_label = 'Storehouse / Conference';
			return;
		}
		if (formData.sub_type === 'offering') {
			if (!formData.service_label) {
				formData.service_label = offeringPlans[0];
			}
			return;
		}
		// other_income: free text, keep existing value
	}

	function queryString(): string {
		const params = new URLSearchParams();
		if (filterType !== 'all') params.set('type', filterType);
		if (filterFrom) params.set('from', filterFrom);
		if (filterTo) params.set('to', filterTo);
		if (filterQuery.trim()) params.set('q', filterQuery.trim());
		return params.toString();
	}

	async function loadLookups() {
		const [catRes, partyRes, accRes] = await Promise.all([
			fetch('/api/finance/categories?kind=income'),
			fetch('/api/finance/parties'),
			fetch('/api/finance/accounts')
		]);
		categories = await catRes.json();
		parties = await partyRes.json();
		accounts = await accRes.json();
		if (!formData.category_id && categories.length > 0) {
			formData.category_id = String(categories[0].id || '');
		}
		syncMappedCategory();
	}

	async function loadItems() {
		const qs = queryString();
		const res = await fetch(`/api/finance/income${qs ? `?${qs}` : ''}`);
		items = await res.json();
	}

	async function loadData() {
		loading = true;
		try {
			await Promise.all([loadLookups(), loadItems()]);
		} catch (error) {
			console.error('Failed to load income data:', error);
			addToast('Gagal memuat data income', 'error');
		} finally {
			loading = false;
		}
	}

	async function createIncome() {
		if (!formData.txn_date || !formData.amount) {
			addToast('Kategori, tanggal, dan nominal wajib diisi', 'warning');
			return;
		}
		if (!formData.category_id) {
			addToast('Kategori income belum tersedia. Tambahkan kategori dulu.', 'error');
			return;
		}
		syncDestination();
		saving = true;
		try {
			const res = await fetch('/api/finance/income', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sub_type: formData.sub_type,
					party_id: formData.party_id ? Number(formData.party_id) : null,
					category_id: Number(formData.category_id),
					account_id: formData.account_id ? Number(formData.account_id) : null,
					amount: Number(formData.amount),
					txn_date: `${formData.txn_date}T12:00:00.000Z`,
					payment_method: formData.payment_method,
					service_label: formData.service_label,
					reference_no: formData.reference_no,
					notes: formData.notes
				})
			});
			if (!res.ok) throw new Error('failed');
			addToast('Income berhasil ditambahkan', 'success');
			showForm = false;
			formData.amount = 0;
			formData.service_label = formData.sub_type === 'tithe'
				? 'Storehouse / Conference'
				: formData.sub_type === 'offering'
					? offeringPlans[0]
					: '';
			formData.reference_no = '';
			formData.notes = '';
			await loadItems();
		} catch (error) {
			console.error('Failed to create income:', error);
			addToast('Gagal menambah income', 'error');
		} finally {
			saving = false;
		}
	}

	async function voidIncome(id: number) {
		if (!confirm('Void transaksi income ini?')) return;
		try {
			const res = await fetch(`/api/finance/income/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('failed');
			addToast('Income di-void', 'info');
			await loadItems();
		} catch (error) {
			console.error('Failed to void income:', error);
			addToast('Gagal void income', 'error');
		}
	}

	function typeLabel(type: string): string {
		if (type === 'tithe') return 'Persepuluhan';
		if (type === 'offering') return 'Persembahan';
		if (type === 'other_income') return 'Lainnya';
		return type;
	}

	function dateLabel(value: string): string {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function partyName(id?: number | null): string {
		if (!id) return '-';
		return parties.find((p) => p.id === id)?.name || '-';
	}

	function categoryName(id: number): string {
		return categories.find((c) => c.id === id)?.name || '-';
	}

	$effect(() => {
		loadData();
	});

	$effect(() => {
		formData.sub_type;
		syncMappedCategory();
		syncDestination();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Finance', href: '/finance', icon: Landmark },
		{ label: 'Income' }
	]} />

	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-4 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font">Income Ledger</h1>
			<p class="text-white/60 text-sm mt-1">Persepuluhan, persembahan, dan pemasukan lainnya.</p>
		</div>
		<button
			type="button"
			onclick={() => { showForm = !showForm; }}
			class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold bg-emerald-500/20 hover:bg-emerald-500/35 inline-flex items-center gap-1.5"
		>
			<Plus class="w-4 h-4" />
			{showForm ? 'Tutup Form' : 'Tambah Income'}
		</button>
	</div>

	{#if showForm}
		<div class="glass-card rounded-2xl p-5 mb-4 fade-up">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
				<div class="md:col-span-2 text-[10px] uppercase tracking-[0.14em] text-white/45">Core Transaction</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Jenis</label>
					<select bind:value={formData.sub_type} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
						<option value="tithe">Persepuluhan</option>
						<option value="offering">Persembahan</option>
						<option value="other_income">Lainnya</option>
					</select>
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Tanggal</label>
					<input type="date" bind:value={formData.txn_date} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" />
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Nominal</label>
					<input type="number" min="0" step="1000" bind:value={formData.amount} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" />
				</div>

				<div class="md:col-span-2 text-[10px] uppercase tracking-[0.14em] text-white/45 mt-1">Classification</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Kategori</label>
					{#if categoryLocked}
						<div class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm flex items-center justify-between">
							<span>{mappedCategoryName(formData.sub_type) || '-'}</span>
							<span class="text-[10px] uppercase tracking-wider text-white/40">Auto</span>
						</div>
						<p class="text-[11px] text-white/45 mt-1">Auto dari jenis pemasukan.</p>
					{:else}
						<select bind:value={formData.category_id} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
							{#each categories as c}
								<option value={String(c.id)}>{c.name}</option>
							{/each}
						</select>
					{/if}
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Tujuan Dana</label>
					{#if formData.sub_type === 'tithe'}
						<div class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm flex items-center justify-between">
							<span>Storehouse / Conference</span>
							<span class="text-[10px] uppercase tracking-wider text-white/40">Tetap</span>
						</div>
						<p class="text-[11px] text-white/45 mt-1">Tujuan tetap untuk persepuluhan.</p>
					{:else if formData.sub_type === 'offering'}
						<select bind:value={formData.service_label} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
							{#each offeringPlans as plan}
								<option value={plan}>{plan}</option>
							{/each}
						</select>
					{:else}
						<input type="text" bind:value={formData.service_label} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" placeholder="contoh: sumbangan acara khusus" />
					{/if}
				</div>

				<div class="md:col-span-2 text-[10px] uppercase tracking-[0.14em] text-white/45 mt-1">Payment Routing</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Akun</label>
					<select bind:value={formData.account_id} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
						<option value="">-</option>
						{#each accounts as a}
							<option value={String(a.id)}>{a.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Metode</label>
					<input type="text" bind:value={formData.payment_method} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" placeholder="cash / transfer" />
				</div>

				<div class="md:col-span-2 text-[10px] uppercase tracking-[0.14em] text-white/45 mt-1">Optional Details</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Pihak (opsional)</label>
					<select bind:value={formData.party_id} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
						<option value="">-</option>
						{#each parties as p}
							<option value={String(p.id)}>{p.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Ref (opsional)</label>
					<input type="text" bind:value={formData.reference_no} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" placeholder="opsional" />
				</div>
			</div>
			<div class="mt-3">
				<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Catatan</label>
				<input type="text" bind:value={formData.notes} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" placeholder="opsional" />
			</div>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" onclick={() => { showForm = false; }} class="glass-button rounded-xl px-4 py-2 text-white/80 text-sm">Batal</button>
				<button type="button" disabled={saving} onclick={createIncome} class="glass-button rounded-xl px-4 py-2 text-white text-sm bg-emerald-500/25 hover:bg-emerald-500/40">{saving ? 'Menyimpan...' : 'Simpan'}</button>
			</div>
		</div>
	{/if}

	<div class="glass-card rounded-2xl p-4 mb-4 fade-up">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
			<select bind:value={filterType} class="glass-input rounded-xl px-3 py-2 text-white text-sm" onchange={loadItems}>
				<option value="all">Semua Jenis</option>
				<option value="tithe">Persepuluhan</option>
				<option value="offering">Persembahan</option>
				<option value="other_income">Lainnya</option>
			</select>
			<input type="date" bind:value={filterFrom} class="glass-input rounded-xl px-3 py-2 text-white text-sm" onchange={loadItems} />
			<input type="date" bind:value={filterTo} class="glass-input rounded-xl px-3 py-2 text-white text-sm" onchange={loadItems} />
			<input type="text" bind:value={filterQuery} placeholder="Cari nama/catatan/ref..." class="glass-input rounded-xl px-3 py-2 text-white text-sm" onkeydown={(e) => e.key === 'Enter' && loadItems()} />
		</div>
	</div>

	{#if loading}
		<Skeleton class="h-40 rounded-2xl" />
	{:else if visibleItems.length === 0}
		<EmptyState icon={Landmark} title="Belum ada transaksi income" description="Tambahkan transaksi pertama untuk mulai pencatatan." />
	{:else}
		<div class="glass-card rounded-2xl overflow-hidden fade-up">
			<div class="overflow-x-auto glass-scrollbar">
				<table class="w-full">
					<thead>
						<tr class="border-b border-white/10 table-head-row">
							<th class="text-left px-3 py-3 table-head-cell">Tanggal</th>
							<th class="text-left px-3 py-3 table-head-cell">Jenis</th>
							<th class="text-left px-3 py-3 table-head-cell">Pihak</th>
							<th class="text-left px-3 py-3 table-head-cell">Kategori</th>
							<th class="text-left px-3 py-3 table-head-cell">Tujuan Dana</th>
							<th class="text-right px-3 py-3 table-head-cell">Nominal</th>
							<th class="text-left px-3 py-3 table-head-cell">Catatan</th>
							<th class="text-center px-3 py-3 table-head-cell">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleItems as item}
							<tr class="glass-table-row">
								<td class="px-3 py-2.5 text-white/80 text-sm">{dateLabel(item.txn_date)}</td>
								<td class="px-3 py-2.5 text-white/80 text-sm">{typeLabel(item.sub_type)}</td>
								<td class="px-3 py-2.5 text-white/70 text-sm">{partyName(item.party_id)}</td>
								<td class="px-3 py-2.5 text-white/70 text-sm">{categoryName(item.category_id)}</td>
								<td class="px-3 py-2.5 text-white/65 text-sm">{item.service_label || '-'}</td>
								<td class="px-3 py-2.5 text-right text-emerald-200 text-sm font-semibold">{formatRupiah(item.amount)}</td>
								<td class="px-3 py-2.5 text-white/60 text-sm max-w-[280px] truncate">{item.notes || '-'}</td>
								<td class="px-3 py-2.5 text-center">
									<button type="button" onclick={() => voidIncome(item.id!)} class="text-white/35 hover:text-red-300 transition-colors p-1.5 rounded-lg hover:bg-red-500/10" title="Void">
										<Trash2 class="w-4 h-4" />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
