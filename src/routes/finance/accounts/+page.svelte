<script lang="ts">
	import type { FinanceAccount } from '$lib/types.js';
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	let loading = $state(true);
	let saving = $state(false);
	let editingId = $state<number | null>(null);
	let showModal = $state(false);
	let accounts = $state<FinanceAccount[]>([]);
	let search = $state('');
	let filterType = $state<'all' | FinanceAccount['account_type']>('all');

	let formData = $state({
		name: '',
		account_type: 'bank' as FinanceAccount['account_type'],
		bank_name: '',
		account_number: '',
		holder_name: '',
		opening_balance: 0
	});

	const filteredAccounts = $derived(
		accounts.filter((account) => {
			if (filterType !== 'all' && account.account_type !== filterType) return false;
			const term = search.trim().toLowerCase();
			if (!term) return true;
			return [
				account.name,
				account.bank_name,
				account.account_number,
				account.holder_name,
				account.account_type
			]
				.map((value) => String(value || '').toLowerCase())
				.some((value) => value.includes(term));
		})
	);

	function resetForm() {
		formData.name = '';
		formData.account_type = 'bank';
		formData.bank_name = '';
		formData.account_number = '';
		formData.holder_name = '';
		formData.opening_balance = 0;
		editingId = null;
	}

	function openCreate() {
		resetForm();
		showModal = true;
	}

	function openEdit(account: FinanceAccount) {
		editingId = account.id ?? null;
		formData.name = account.name || '';
		formData.account_type = account.account_type;
		formData.bank_name = account.bank_name || '';
		formData.account_number = account.account_number || '';
		formData.holder_name = account.holder_name || '';
		formData.opening_balance = Number(account.opening_balance || 0);
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		resetForm();
	}

	function accountTypeLabel(type: FinanceAccount['account_type']) {
		if (type === 'cash') return 'Cash';
		if (type === 'bank') return 'Bank';
		if (type === 'ewallet') return 'E-Wallet';
		return 'Other';
	}

	async function loadAccounts() {
		loading = true;
		try {
			const res = await fetch('/api/finance/accounts');
			if (!res.ok) throw new Error('failed');
			accounts = await res.json();
		} catch (error) {
			console.error('Failed to load finance accounts:', error);
			addToast('Gagal memuat akun internal', 'error');
		} finally {
			loading = false;
		}
	}

	async function saveAccount() {
		if (!formData.name.trim()) {
			addToast('Nama akun wajib diisi', 'warning');
			return;
		}
		saving = true;
		try {
			const payload = {
				name: formData.name.trim(),
				account_type: formData.account_type,
				bank_name: formData.bank_name.trim() || null,
				account_number: formData.account_number.trim() || null,
				holder_name: formData.holder_name.trim() || null,
				opening_balance: Number(formData.opening_balance) || 0
			};

			const res = await fetch(
				editingId ? `/api/finance/accounts/${editingId}` : '/api/finance/accounts',
				{
					method: editingId ? 'PUT' : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				}
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error || 'Gagal menyimpan akun');
			}
			addToast(editingId ? 'Akun berhasil diperbarui' : 'Akun berhasil ditambahkan', 'success');
			closeModal();
			await loadAccounts();
		} catch (error) {
			console.error('Failed to save finance account:', error);
			addToast(error instanceof Error ? error.message : 'Gagal menyimpan akun', 'error');
		} finally {
			saving = false;
		}
	}

	async function archiveAccount(account: FinanceAccount) {
		if (!account.id) return;
		if (!confirm(`Nonaktifkan akun "${account.name}"?`)) return;
		try {
			const res = await fetch(`/api/finance/accounts/${account.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('failed');
			addToast('Akun dinonaktifkan', 'info');
			await loadAccounts();
		} catch (error) {
			console.error('Failed to archive finance account:', error);
			addToast('Gagal menonaktifkan akun', 'error');
		}
	}

	$effect(() => {
		loadAccounts();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<div class="mb-6 fade-up">
		<Breadcrumbs
			items={[
				{ href: '/', label: 'Home', icon: LayoutDashboard },
				{ href: '/finance', label: 'Finance', icon: Landmark },
				{ label: 'Accounts', icon: Wallet }
			]}
		/>
		<div class="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div>
				<h1 class="text-2xl font-bold text-white glow-text brand-font">Internal Accounts</h1>
				<p class="text-white/60 text-sm mt-1">Kelola akun sumber dana internal untuk ledger dan bank reconciliation.</p>
			</div>
			<button type="button" onclick={openCreate} class="glass-button px-4 py-2.5 rounded-2xl text-white font-semibold inline-flex items-center gap-2 self-start">
				<Plus class="w-4 h-4" />
				Tambah Akun
			</button>
		</div>
	</div>

	<div class="glass-card rounded-3xl p-4 mb-5 fade-up">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
			<div>
				<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Cari</label>
				<input bind:value={search} type="text" placeholder="Nama akun / bank / rekening / holder" class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm" />
			</div>
			<div>
				<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Tipe</label>
				<select bind:value={filterType} class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm">
					<option value="all">Semua Tipe</option>
					<option value="bank">Bank</option>
					<option value="cash">Cash</option>
					<option value="ewallet">E-Wallet</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="glass rounded-2xl px-4 py-3 border border-white/10">
				<p class="text-white/50 text-[11px] uppercase tracking-[0.16em]">Catatan Mapping</p>
				<p class="text-white/75 text-sm mt-1 leading-relaxed">
					Untuk auto-map bank reconciliation, isi <span class="text-sky-200 font-medium">nomor rekening</span> sama persis dengan rekening pada CSV bank.
				</p>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="space-y-3">
			<Skeleton class="h-24 rounded-2xl" />
			<Skeleton class="h-24 rounded-2xl" />
			<Skeleton class="h-24 rounded-2xl" />
		</div>
	{:else if filteredAccounts.length === 0}
		<div class="space-y-4">
			<EmptyState
				icon={Wallet}
				title="Belum ada akun internal"
				description="Tambah akun bank, cash, atau e-wallet agar transaksi dan rekonsiliasi punya sumber dana yang jelas."
			/>
			<div class="flex justify-center">
				<button type="button" onclick={openCreate} class="glass-button px-4 py-2.5 rounded-2xl text-white font-semibold inline-flex items-center gap-2">
					<Plus class="w-4 h-4" />
					Tambah Akun
				</button>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
			{#each filteredAccounts as account}
				<div class="glass-card rounded-3xl p-5 fade-up">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<h2 class="text-white font-semibold brand-font text-lg">{account.name}</h2>
								<span class="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] bg-white/8 text-white/65 border border-white/10">
									{accountTypeLabel(account.account_type)}
								</span>
							</div>
							<p class="text-white/55 text-sm mt-1">
								{account.bank_name || 'Tanpa nama bank'}
								{#if account.account_number}
									<span class="text-white/35"> • </span>{account.account_number}
								{/if}
							</p>
						</div>
						<div class="flex items-center gap-1">
							<button type="button" onclick={() => openEdit(account)} class="text-white/50 hover:text-sky-200 transition-colors p-2 rounded-xl hover:bg-sky-500/10" title="Edit akun">
								<Pencil class="w-4 h-4" />
							</button>
							<button type="button" onclick={() => archiveAccount(account)} class="text-white/40 hover:text-rose-200 transition-colors p-2 rounded-xl hover:bg-rose-500/10" title="Nonaktifkan akun">
								<Trash2 class="w-4 h-4" />
							</button>
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
						<div class="glass rounded-2xl px-4 py-3 border border-white/8">
							<p class="text-white/40 text-[10px] uppercase tracking-[0.14em]">Holder</p>
							<p class="text-white/85 text-sm mt-1 break-words">{account.holder_name || '-'}</p>
						</div>
						<div class="glass rounded-2xl px-4 py-3 border border-white/8">
							<p class="text-white/40 text-[10px] uppercase tracking-[0.14em]">Opening Balance</p>
							<p class="text-emerald-200 text-sm mt-1 font-semibold">{formatRupiah(account.opening_balance || 0)}</p>
						</div>
						<div class="glass rounded-2xl px-4 py-3 border border-white/8">
							<p class="text-white/40 text-[10px] uppercase tracking-[0.14em]">Reconciliation Key</p>
							<p class="text-white/85 text-sm mt-1 break-all">{account.account_number || 'Belum diisi'}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if showModal}
	<div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onclick={closeModal}>
		<div class="glass-card rounded-3xl p-5 w-full max-w-2xl shadow-2xl" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-start justify-between gap-3 mb-5">
				<div>
					<h3 class="text-white font-semibold brand-font text-lg">{editingId ? 'Edit Akun' : 'Tambah Akun'}</h3>
					<p class="text-white/55 text-xs mt-1">Pastikan nomor rekening sama dengan yang muncul pada mutasi bank agar auto-map berjalan.</p>
				</div>
				<button type="button" onclick={closeModal} class="glass-button rounded-lg p-1.5 text-white/70 hover:text-white">
					<X class="w-4 h-4" />
				</button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Nama Akun</label>
					<input bind:value={formData.name} type="text" class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm" placeholder="Contoh: BCA Operasional" />
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Tipe</label>
					<select bind:value={formData.account_type} class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm">
						<option value="bank">Bank</option>
						<option value="cash">Cash</option>
						<option value="ewallet">E-Wallet</option>
						<option value="other">Other</option>
					</select>
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Nama Bank / Provider</label>
					<input bind:value={formData.bank_name} type="text" class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm" placeholder="Contoh: BCA" />
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Nomor Rekening</label>
					<input bind:value={formData.account_number} type="text" class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm" placeholder="Contoh: 1240011627966" />
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Atas Nama</label>
					<input bind:value={formData.holder_name} type="text" class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm" placeholder="Opsional" />
				</div>
				<div>
					<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Opening Balance</label>
					<input bind:value={formData.opening_balance} type="number" min="0" step="1000" class="w-full glass-input rounded-xl px-3 py-2.5 text-white text-sm" />
				</div>
			</div>

			<div class="mt-5 flex items-center justify-end gap-3">
				<button type="button" onclick={closeModal} class="glass-button px-4 py-2 rounded-xl text-white/80">Batal</button>
				<button type="button" onclick={saveAccount} disabled={saving} class="glass-button px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-60">
					{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Akun'}
				</button>
			</div>
		</div>
	</div>
{/if}
