<script lang="ts">
	import type { Recipient } from '$lib/types.js';
	import RecipientForm from './RecipientForm.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import EmptyState from './EmptyState.svelte';
	import StatCardSkeleton from './skeletons/StatCardSkeleton.svelte';
	import TableSkeleton from './skeletons/TableSkeleton.svelte';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import { confirmDialog } from '$lib/stores/confirm.svelte.js';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import UsersIcon from '@lucide/svelte/icons/users';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import X from '@lucide/svelte/icons/x';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Video from '@lucide/svelte/icons/video';
	import Users2 from '@lucide/svelte/icons/users-2';

	let recipients = $state<Recipient[]>([]);
	let searchQuery = $state('');
	let filteredRecipients = $derived(
		searchQuery
			? recipients.filter(r =>
				r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(r.bank_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
				(r.account_number || '').includes(searchQuery) ||
				(r.keterangan || '').toLowerCase().includes(searchQuery.toLowerCase())
			)
			: recipients
	);
	let showForm = $state(false);
	let editingRecipient = $state<Recipient | undefined>(undefined);
	let loading = $state(true);
	let bankReadyCount = $derived(recipients.filter(r => r.bank_name && r.account_number).length);
	let whatsappCount = $derived(recipients.filter(r => r.whatsapp).length);

	async function loadRecipients() {
		try {
			const res = await fetch('/api/recipients');
			recipients = await res.json();
		} catch (e) {
			console.error('Failed to load recipients:', e);
		} finally {
			loading = false;
		}
	}

	async function handleSubmit(data: Partial<Recipient>) {
		try {
			if (editingRecipient) {
				await fetch(`/api/recipients/${editingRecipient.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data)
				});
				addToast(`${data.name} berhasil diperbarui`, 'success');
			} else {
				await fetch('/api/recipients', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data)
				});
				addToast(`${data.name} berhasil ditambahkan`, 'success');
			}
			showForm = false;
			editingRecipient = undefined;
			await loadRecipients();
		} catch (e) {
			console.error('Failed to save recipient:', e);
			addToast('Gagal menyimpan penerima', 'error');
		}
	}

	async function handleDelete(id: number, name: string) {
		const confirmed = await confirmDialog({
			title: 'Hapus Penerima',
			description: `"${name}" akan dihapus dari daftar penerima. Aksi ini tidak bisa dibatalkan.`,
			confirmLabel: 'Hapus',
			variant: 'danger'
		});
		if (!confirmed) return;
		try {
			await fetch(`/api/recipients/${id}`, { method: 'DELETE' });
			addToast(`${name} berhasil dihapus`, 'success');
			await loadRecipients();
		} catch (e) {
			console.error('Failed to delete recipient:', e);
			addToast('Gagal menghapus penerima', 'error');
		}
	}

	function startEdit(r: Recipient) {
		editingRecipient = r;
		showForm = true;
	}

	$effect(() => {
		loadRecipients();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Dashboard', href: '/', icon: LayoutDashboard },
		{ label: 'Recipients', icon: UsersIcon }
	]} />

	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font">Daftar Penerima</h1>
			<p class="text-white/60 text-sm mt-1">{recipients.length} penerima terdaftar &middot; {filteredRecipients.length} tampil</p>
		</div>
		<div class="flex gap-3 w-full lg:w-auto">
			<div class="relative flex-1 sm:w-64">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Cari nama, bank, rekening..."
					class="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
				/>
			</div>
			<button
				onclick={() => { if (showForm) { showForm = false; editingRecipient = undefined; } else { editingRecipient = undefined; showForm = true; } }}
				class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold {showForm ? 'bg-white/10' : 'bg-emerald-500/25 hover:bg-emerald-500/40'} whitespace-nowrap flex items-center gap-1.5"
			>
				{#if showForm}
					<ChevronUp class="w-4 h-4" />
					Tutup
				{:else}
					<UserPlus class="w-4 h-4" />
					Tambah
				{/if}
			</button>
		</div>
	</div>

	{#if loading}
		<div class="mb-6">
			<StatCardSkeleton />
		</div>
		<TableSkeleton rows={5} columns={6} />
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 stagger">
			<div class="glass-card rounded-2xl p-4 lift-on-hover">
				<div class="flex items-center gap-2 mb-1">
					<UsersIcon class="w-3.5 h-3.5 text-white/50" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Total Penerima</p>
				</div>
				<p class="text-2xl font-bold text-white mt-1">{recipients.length}</p>
			</div>
			<div class="glass-card rounded-2xl p-4 lift-on-hover">
				<div class="flex items-center gap-2 mb-1">
					<CreditCard class="w-3.5 h-3.5 text-emerald-400/70" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Rekening Lengkap</p>
				</div>
				<p class="text-2xl font-bold text-emerald-300 mt-1">{bankReadyCount}</p>
			</div>
			<div class="glass-card rounded-2xl p-4 lift-on-hover">
				<div class="flex items-center gap-2 mb-1">
					<MessageCircle class="w-3.5 h-3.5 text-sky-400/70" />
					<p class="text-white/60 text-xs uppercase tracking-wider">WhatsApp Tersedia</p>
				</div>
				<p class="text-2xl font-bold text-sky-300 mt-1">{whatsappCount}</p>
			</div>
		</div>

		<!-- Inline Recipient Form -->
		{#if showForm}
			<div class="glass-card rounded-2xl border border-white/15 mb-6 fade-up overflow-hidden">
				<div class="p-5 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<div>
							<h2 class="text-lg font-semibold text-white brand-font">{editingRecipient ? 'Edit' : 'Tambah'} Penerima</h2>
							<p class="text-white/50 text-sm mt-0.5">Pastikan nama, bank, dan nomor rekening sesuai.</p>
						</div>
						<button onclick={() => { showForm = false; editingRecipient = undefined; }} class="text-white/40 hover:text-white/70 transition-colors rounded-lg p-1.5 hover:bg-white/5">
							<X class="w-4 h-4" />
						</button>
					</div>
					<RecipientForm
						recipient={editingRecipient}
						{recipients}
						onSubmit={handleSubmit}
						onCancel={() => { showForm = false; editingRecipient = undefined; }}
					/>
				</div>
			</div>
		{/if}

		{#if filteredRecipients.length === 0}
			<EmptyState
				icon={SearchX}
				title="Tidak ada data yang cocok"
				description="Coba ubah kata kunci pencarian."
			/>
		{:else}
			<!-- Desktop Table (hidden on mobile) -->
			<div class="glass-card rounded-2xl overflow-hidden fade-up hidden md:block">
				<div class="overflow-x-auto glass-scrollbar">
					<table class="w-full">
						<thead>
							<tr class="border-b border-white/10 table-head-row">
								<th class="text-left px-4 py-3 table-head-cell">#</th>
								<th class="text-left px-4 py-3 table-head-cell">Nama</th>
								<th class="text-left px-4 py-3 table-head-cell">Bank</th>
								<th class="text-left px-4 py-3 table-head-cell">No. Rekening</th>
								<th class="text-left px-4 py-3 table-head-cell">WhatsApp</th>
								<th class="text-center px-4 py-3 table-head-cell">Zoom</th>
								<th class="text-left px-4 py-3 table-head-cell">Catatan</th>
								<th class="text-right px-4 py-3 table-head-cell">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredRecipients as r, i}
								<tr class="glass-table-row">
									<td class="px-4 py-3 text-white/60 text-sm">{i + 1}</td>
									<td class="px-4 py-3 text-white text-sm font-medium">{r.name}</td>
									<td class="px-4 py-3 text-white/80 text-sm">{r.bank_name || '-'}</td>
									<td class="px-4 py-3 text-white/80 text-sm font-mono text-xs">{r.account_number || '-'}</td>
									<td class="px-4 py-3 text-white/80 text-sm font-mono text-xs">{r.whatsapp || '-'}</td>
									<td class="px-4 py-3 text-center">
										{#if r.zoom_eligible}
											{#if r.family_group_id}
												<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
													<Users2 class="w-3 h-3" />
													Keluarga
												</span>
											{:else}
												<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 border border-violet-500/25">
													<Video class="w-3 h-3" />
													Sendiri
												</span>
											{/if}
										{:else}
											<span class="text-white/30 text-xs">—</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-sm">
										{#if r.transfer_to_name}
											<span class="text-amber-200/80">→ {r.transfer_to_name}</span>
										{:else if r.keterangan}
											<span class="text-white/60">{r.keterangan}</span>
										{:else}
											<span class="text-white/40">-</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-right">
										<div class="flex items-center justify-end gap-1">
											<button
												onclick={() => startEdit(r)}
												class="text-white/30 hover:text-sky-300 transition-colors p-1.5 rounded-lg hover:bg-sky-500/10"
												title="Edit"
											>
												<Pencil class="w-4 h-4" />
											</button>
											<button
												onclick={() => handleDelete(r.id!, r.name)}
												class="text-white/30 hover:text-red-300 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
												title="Hapus"
											>
												<Trash2 class="w-4 h-4" />
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Mobile Card View (hidden on desktop) -->
			<div class="md:hidden space-y-3 fade-up">
				{#each filteredRecipients as r, i}
					<div class="glass-card rounded-xl p-4">
						<div class="flex justify-between items-start gap-3">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="text-white/40 text-xs">{i + 1}.</span>
									<p class="text-white font-medium text-sm">{r.name}</p>
									{#if r.zoom_eligible}
										{#if r.family_group_id}
											<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
												<Users2 class="w-2.5 h-2.5" />
												Keluarga
											</span>
										{:else}
											<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-200 border border-violet-500/25">
												<Video class="w-2.5 h-2.5" />
												Zoom
											</span>
										{/if}
									{/if}
								</div>
								<div class="mt-1.5 ml-5 space-y-0.5">
									{#if r.bank_name}
										<p class="text-white/60 text-xs">{r.bank_name} &middot; <span class="font-mono">{r.account_number || '-'}</span></p>
									{/if}
									{#if r.whatsapp}
										<p class="text-white/50 text-xs font-mono">{r.whatsapp}</p>
									{/if}
									{#if r.transfer_to_name}
										<p class="text-amber-200/70 text-xs">→ {r.transfer_to_name}</p>
									{:else if r.keterangan}
										<p class="text-white/40 text-xs">{r.keterangan}</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-1 flex-shrink-0">
								<button
									onclick={() => startEdit(r)}
									class="text-white/30 hover:text-sky-300 transition-colors p-2 rounded-lg hover:bg-sky-500/10"
									title="Edit"
								>
									<Pencil class="w-4 h-4" />
								</button>
								<button
									onclick={() => handleDelete(r.id!, r.name)}
									class="text-white/30 hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-red-500/10"
									title="Hapus"
								>
									<Trash2 class="w-4 h-4" />
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
