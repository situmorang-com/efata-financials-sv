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
	import Check from '@lucide/svelte/icons/check';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let loading = $state(true);
	let saving = $state(false);
	let showForm = $state(false);
	let items = $state<FinanceTransaction[]>([]);
	let categories = $state<FinanceCategory[]>([]);
	let parties = $state<FinanceParty[]>([]);
	let accounts = $state<FinanceAccount[]>([]);
	const expenseTargets = [
		'Operasional Gereja',
		'Sosial & Bantuan Jemaat',
		'Pelayanan & Misi',
		'Pemeliharaan Fasilitas',
		'Pendidikan & Pemuridan'
	];

	let filterStatus = $state<'all' | 'draft' | 'pending_approval' | 'approved' | 'posted' | 'void'>('all');
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterQuery = $state('');

	let formData = $state({
		category_id: '',
		party_id: '',
		account_id: '',
		amount: 0,
		txn_date: new Date().toISOString().slice(0, 10),
		payment_method: 'transfer',
		service_label: 'Operasional Gereja',
		notes: '',
		is_draft: false
	});

	function queryString(): string {
		const params = new URLSearchParams();
		if (filterStatus !== 'all') params.set('status', filterStatus);
		if (filterFrom) params.set('from', filterFrom);
		if (filterTo) params.set('to', filterTo);
		if (filterQuery.trim()) params.set('q', filterQuery.trim());
		return params.toString();
	}

	async function loadLookups() {
		const [catRes, partyRes, accRes] = await Promise.all([
			fetch('/api/finance/categories?kind=expense'),
			fetch('/api/finance/parties'),
			fetch('/api/finance/accounts')
		]);
		categories = await catRes.json();
		parties = await partyRes.json();
		accounts = await accRes.json();
		if (!formData.category_id && categories.length > 0) {
			formData.category_id = String(categories[0].id || '');
		}
	}

	async function loadItems() {
		const qs = queryString();
		const res = await fetch(`/api/finance/expenses${qs ? `?${qs}` : ''}`);
		items = await res.json();
	}

	async function loadData() {
		loading = true;
		try {
			await Promise.all([loadLookups(), loadItems()]);
		} catch (error) {
			console.error('Failed to load expense data:', error);
			addToast('Gagal memuat data pengeluaran', 'error');
		} finally {
			loading = false;
		}
	}

	async function createExpense() {
		if (!formData.category_id || !formData.txn_date || !formData.amount) {
			addToast('Kategori, tanggal, dan nominal wajib diisi', 'warning');
			return;
		}
		saving = true;
		try {
			const res = await fetch('/api/finance/expenses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					category_id: Number(formData.category_id),
					party_id: formData.party_id ? Number(formData.party_id) : null,
					account_id: formData.account_id ? Number(formData.account_id) : null,
					amount: Number(formData.amount),
					txn_date: `${formData.txn_date}T12:00:00.000Z`,
					payment_method: formData.payment_method,
					service_label: formData.service_label,
					notes: formData.notes,
					status: formData.is_draft ? 'draft' : 'pending_approval'
				})
			});
			if (!res.ok) throw new Error('failed');
			addToast('Pengeluaran berhasil ditambahkan', 'success');
			showForm = false;
			formData.amount = 0;
			formData.service_label = expenseTargets[0];
			formData.notes = '';
			await loadItems();
		} catch (error) {
			console.error('Failed to create expense:', error);
			addToast('Gagal menambah pengeluaran', 'error');
		} finally {
			saving = false;
		}
	}

	async function runAction(id: number, action: 'approve' | 'mark-paid' | 'void') {
		try {
			let payload: Record<string, unknown> | undefined;
			if (action === 'approve') {
				const note = prompt('Catatan approval (opsional):') || '';
				payload = { approval_note: note };
			}
			const res = await fetch(`/api/finance/expenses/${id}/${action}`, {
				method: 'POST',
				headers: payload ? { 'Content-Type': 'application/json' } : undefined,
				body: payload ? JSON.stringify(payload) : undefined
			});
			if (!res.ok) throw new Error('failed');
			addToast('Status pengeluaran diperbarui', 'success');
			await loadItems();
		} catch (error) {
			console.error(`Failed to ${action}:`, error);
			addToast('Gagal memperbarui status', 'error');
		}
	}

	function statusLabel(status: string): string {
		if (status === 'pending_approval') return 'Pending Approval';
		if (status === 'approved') return 'Approved';
		if (status === 'posted') return 'Paid';
		if (status === 'void') return 'Void';
		if (status === 'draft') return 'Draft';
		return status;
	}

	function statusClass(status: string): string {
		if (status === 'pending_approval') return 'bg-amber-500/20 text-amber-200 border border-amber-500/35';
		if (status === 'approved') return 'bg-sky-500/20 text-sky-200 border border-sky-500/35';
		if (status === 'posted') return 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/35';
		if (status === 'void') return 'bg-rose-500/20 text-rose-200 border border-rose-500/35';
		return 'bg-white/10 text-white/70 border border-white/20';
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

	function approvalTrail(item: FinanceTransaction): string {
		if (!item.approved_at) return '-';
		const d = new Date(item.approved_at);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	$effect(() => {
		loadData();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Finance', href: '/finance', icon: Landmark },
		{ label: 'Expenses' }
	]} />

	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-4 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font">Expense Ledger</h1>
			<p class="text-white/60 text-sm mt-1">Pengajuan, approval, dan pembayaran pengeluaran.</p>
		</div>
		<button
			type="button"
			onclick={() => { showForm = !showForm; }}
			class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold bg-emerald-500/20 hover:bg-emerald-500/35 inline-flex items-center gap-1.5"
		>
			<Plus class="w-4 h-4" />
			{showForm ? 'Tutup Form' : 'Tambah Pengeluaran'}
		</button>
	</div>

	{#if showForm}
			<div class="glass-card rounded-2xl p-5 mb-4 fade-up">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
					<div class="md:col-span-2 text-[10px] uppercase tracking-[0.14em] text-white/45">Core Transaction</div>
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
						<select bind:value={formData.category_id} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
							{#each categories as c}
								<option value={String(c.id)}>{c.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Tujuan Pengeluaran</label>
						<select bind:value={formData.service_label} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
							{#each expenseTargets as target}
								<option value={target}>{target}</option>
							{/each}
						</select>
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
				</div>
			<div class="mt-3">
				<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Catatan</label>
				<input type="text" bind:value={formData.notes} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" placeholder="opsional" />
			</div>
			<div class="mt-3 flex items-center gap-2">
				<input id="is-draft" type="checkbox" bind:checked={formData.is_draft} class="accent-emerald-400" />
				<label for="is-draft" class="text-white/70 text-sm">Simpan sebagai draft (jangan kirim approval)</label>
			</div>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" onclick={() => { showForm = false; }} class="glass-button rounded-xl px-4 py-2 text-white/80 text-sm">Batal</button>
				<button type="button" disabled={saving} onclick={createExpense} class="glass-button rounded-xl px-4 py-2 text-white text-sm bg-emerald-500/25 hover:bg-emerald-500/40">{saving ? 'Menyimpan...' : 'Simpan'}</button>
			</div>
		</div>
	{/if}

	<div class="glass-card rounded-2xl p-4 mb-4 fade-up">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
			<select bind:value={filterStatus} class="glass-input rounded-xl px-3 py-2 text-white text-sm" onchange={loadItems}>
				<option value="all">Semua Status</option>
				<option value="draft">Draft</option>
				<option value="pending_approval">Pending Approval</option>
				<option value="approved">Approved</option>
				<option value="posted">Paid</option>
				<option value="void">Void</option>
			</select>
			<input type="date" bind:value={filterFrom} class="glass-input rounded-xl px-3 py-2 text-white text-sm" onchange={loadItems} />
			<input type="date" bind:value={filterTo} class="glass-input rounded-xl px-3 py-2 text-white text-sm" onchange={loadItems} />
			<input type="text" bind:value={filterQuery} placeholder="Cari pihak/catatan/ref..." class="glass-input rounded-xl px-3 py-2 text-white text-sm" onkeydown={(e) => e.key === 'Enter' && loadItems()} />
		</div>
	</div>

	{#if loading}
		<Skeleton class="h-40 rounded-2xl" />
	{:else if items.length === 0}
		<EmptyState icon={Landmark} title="Belum ada transaksi pengeluaran" description="Tambahkan transaksi pertama untuk mulai pencatatan." />
	{:else}
		<div class="glass-card rounded-2xl overflow-hidden fade-up">
			<div class="overflow-x-auto glass-scrollbar">
				<table class="w-full">
					<thead>
						<tr class="border-b border-white/10 table-head-row">
							<th class="text-left px-3 py-3 table-head-cell">Tanggal</th>
							<th class="text-left px-3 py-3 table-head-cell">Pihak</th>
							<th class="text-left px-3 py-3 table-head-cell">Kategori</th>
							<th class="text-left px-3 py-3 table-head-cell">Tujuan</th>
							<th class="text-right px-3 py-3 table-head-cell">Nominal</th>
							<th class="text-left px-3 py-3 table-head-cell">Status</th>
							<th class="text-left px-3 py-3 table-head-cell">Approved At</th>
							<th class="text-left px-3 py-3 table-head-cell">Catatan</th>
							<th class="text-center px-3 py-3 table-head-cell">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each items as item}
							<tr class="glass-table-row">
								<td class="px-3 py-2.5 text-white/80 text-sm">{dateLabel(item.txn_date)}</td>
								<td class="px-3 py-2.5 text-white/70 text-sm">{partyName(item.party_id)}</td>
								<td class="px-3 py-2.5 text-white/70 text-sm">{categoryName(item.category_id)}</td>
								<td class="px-3 py-2.5 text-white/65 text-sm">{item.service_label || '-'}</td>
								<td class="px-3 py-2.5 text-right text-amber-100 text-sm font-semibold">{formatRupiah(item.amount)}</td>
								<td class="px-3 py-2.5 text-sm">
									<span class={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusClass(item.status)}`}>
										{statusLabel(item.status)}
									</span>
								</td>
								<td class="px-3 py-2.5 text-white/60 text-xs">{approvalTrail(item)}</td>
								<td class="px-3 py-2.5 text-white/60 text-sm max-w-[250px] truncate">{item.notes || '-'}</td>
								<td class="px-3 py-2.5">
									<div class="flex items-center justify-center gap-1">
										{#if item.status === 'pending_approval'}
											<button type="button" onclick={() => runAction(item.id!, 'approve')} class="text-white/35 hover:text-sky-300 transition-colors p-1.5 rounded-lg hover:bg-sky-500/10" title="Approve"><Check class="w-4 h-4" /></button>
										{/if}
										{#if item.status === 'approved'}
											<button type="button" onclick={() => runAction(item.id!, 'mark-paid')} class="text-white/35 hover:text-emerald-300 transition-colors p-1.5 rounded-lg hover:bg-emerald-500/10" title="Mark Paid"><Wallet class="w-4 h-4" /></button>
										{/if}
										{#if item.status !== 'void'}
											<button type="button" onclick={() => runAction(item.id!, 'void')} class="text-white/35 hover:text-red-300 transition-colors p-1.5 rounded-lg hover:bg-red-500/10" title="Void"><Trash2 class="w-4 h-4" /></button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
