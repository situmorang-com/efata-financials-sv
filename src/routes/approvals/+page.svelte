<script lang="ts">
	import type { BoardApproval } from '$lib/types.js';
	import type { PageData } from './$types.js';
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Clipboard from '@lucide/svelte/icons/clipboard';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileImage from '@lucide/svelte/icons/file-image';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Save from '@lucide/svelte/icons/save';
	import Search from '@lucide/svelte/icons/search';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';

	let { data }: { data: PageData } = $props();

	const kindOptions = [
		{ value: 'expense', label: 'Expense' },
		{ value: 'decision', label: 'Decision' },
		{ value: 'budget', label: 'Budget' },
		{ value: 'policy', label: 'Policy' },
		{ value: 'other', label: 'Other' }
	];

	const statusOptions = [
		{ value: 'pending', label: 'Pending' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'superseded', label: 'Superseded' },
		{ value: 'rejected', label: 'Rejected' }
	];

	let reloadedApprovals = $state<BoardApproval[] | null>(null);
	let showForm = $state(false);
	let saving = $state(false);
	let editingId = $state<number | null>(null);
	let proofFile = $state<File | null>(null);
	let filterQuery = $state('');
	let filterKind = $state('all');
	let filterStatus = $state('all');
	let expandedMonths = $state<string[]>([]);

	let formState = $state({
		kind: 'expense',
		title: '',
		decision_date: new Date().toISOString().slice(0, 10),
		amount: 0,
		currency: 'IDR',
		status: 'pending',
		approvers: '',
		notes: ''
	});

	let session = $derived(data.session);
	let isAuthenticated = $derived(Boolean(session?.user));
	let approvals = $derived(reloadedApprovals ?? data.approvals ?? []);
	let currentYearValue = $derived(currentYear());
	let currentYearLabelValue = $derived(String(currentYearValue));
	let currentYearApprovals = $derived(
		approvals.filter((item) => item.status === 'approved' && yearKey(item.decision_date) === currentYearValue)
	);
	let currentYearExpenseAmount = $derived(
		currentYearApprovals
			.filter((item) => item.kind === 'expense')
			.reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0)
	);
	let filteredApprovals = $derived(
		approvals.filter((item) => {
			if (filterKind !== 'all' && item.kind !== filterKind) return false;
			if (filterStatus !== 'all' && item.status !== filterStatus) return false;
			const q = filterQuery.trim().toLowerCase();
			if (!q) return true;
			const voterNames = (item.votes || []).map((vote) => vote.voter_name || vote.voter_email);
			return [item.title, item.approvers, item.notes, ...voterNames]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(q));
		})
	);
	let monthGroups = $derived(groupByMonth(filteredApprovals));

	function resetForm() {
		formState = {
			kind: 'expense',
			title: '',
			decision_date: new Date().toISOString().slice(0, 10),
			amount: 0,
			currency: 'IDR',
			status: 'pending',
			approvers: '',
			notes: ''
		};
		editingId = null;
		proofFile = null;
	}

	function startCreate() {
		resetForm();
		showForm = true;
	}

	function dateToInput(value: string): string {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
		return d.toISOString().slice(0, 10);
	}

	function startEdit(item: BoardApproval) {
		formState = {
			kind: item.kind,
			title: item.title,
			decision_date: dateToInput(item.decision_date),
			amount: item.amount || 0,
			currency: item.currency || 'IDR',
			status: item.status,
			approvers: item.approvers || '',
			notes: item.notes || ''
		};
		editingId = item.id || null;
		proofFile = null;
		showForm = true;
	}

	function cancelForm() {
		showForm = false;
		resetForm();
	}

	function onProofChange(event: Event) {
		const input = event.target as HTMLInputElement;
		proofFile = input.files?.[0] || null;
	}

	async function reloadApprovals() {
		const res = await fetch('/api/approvals');
		if (!res.ok) throw new Error('failed');
		reloadedApprovals = await res.json();
	}

	async function submitApproval(event: Event) {
		event.preventDefault();
		if (!formState.title.trim() || !formState.decision_date) {
			addToast('Judul dan tanggal wajib diisi', 'warning');
			return;
		}

		saving = true;
		try {
			const payload = new FormData();
			for (const [key, value] of Object.entries(formState)) {
				payload.set(key, String(value ?? ''));
			}
			if (proofFile) payload.set('proof', proofFile);

			const res = await fetch(editingId ? `/api/approvals/${editingId}` : '/api/approvals', {
				method: editingId ? 'PUT' : 'POST',
				body: payload
			});
			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				throw new Error(error.error || 'failed');
			}

			addToast(editingId ? 'Approval diperbarui' : 'Approval ditambahkan', 'success');
			showForm = false;
			resetForm();
			await reloadApprovals();
		} catch (error) {
			console.error('Failed to save approval:', error);
			addToast('Gagal menyimpan approval', 'error');
		} finally {
			saving = false;
		}
	}

	function proofUrl(item: BoardApproval): string {
		return `/api/approvals/${item.id}/proof`;
	}

	function kindLabel(kind: string): string {
		return kindOptions.find((item) => item.value === kind)?.label || 'Other';
	}

	function statusLabel(status: string): string {
		return statusOptions.find((item) => item.value === status)?.label || status;
	}

	function statusClass(status: string): string {
		if (status === 'approved') return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30';
		if (status === 'pending') return 'bg-amber-500/20 text-amber-200 border-amber-400/30';
		if (status === 'superseded') return 'bg-amber-500/20 text-amber-200 border-amber-400/30';
		return 'bg-rose-500/20 text-rose-200 border-rose-400/30';
	}

	function kindClass(kind: string): string {
		if (kind === 'expense') return 'bg-sky-500/15 text-sky-200 border-sky-400/25';
		if (kind === 'budget') return 'bg-violet-500/15 text-violet-200 border-violet-400/25';
		if (kind === 'policy') return 'bg-amber-500/15 text-amber-200 border-amber-400/25';
		return 'bg-white/10 text-white/70 border-white/20';
	}

	function dateLabel(value: string): string {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function yearKey(value: string): number {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return NaN;
		return d.getFullYear();
	}

	function monthKey(value: string): string {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return 'unknown';
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function currentYear(): number {
		const d = new Date();
		return d.getFullYear();
	}

	function monthLabel(key: string): string {
		if (key === 'unknown') return 'No date';
		const [year, month] = key.split('-').map(Number);
		const d = new Date(year, month - 1, 1);
		return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
	}

	function groupByMonth(items: BoardApproval[]): Array<{
		key: string;
		label: string;
		items: BoardApproval[];
		approvedCount: number;
		expenseAmount: number;
	}> {
		const groups = new Map<string, BoardApproval[]>();
		for (const item of items) {
			const key = monthKey(item.decision_date);
			groups.set(key, [...(groups.get(key) || []), item]);
		}

		return Array.from(groups.entries())
			.sort(([a], [b]) => {
				if (a === 'unknown') return 1;
				if (b === 'unknown') return -1;
				return a < b ? 1 : -1;
			})
			.map(([key, groupItems]) => ({
				key,
				label: monthLabel(key),
				items: groupItems,
				approvedCount: groupItems.filter((item) => item.status === 'approved').length,
				expenseAmount: groupItems
					.filter((item) => item.status === 'approved' && item.kind === 'expense')
					.reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0)
			}));
	}

	function monthExpanded(key: string): boolean {
		return expandedMonths.includes(key);
	}

	function toggleMonth(key: string) {
		expandedMonths = monthExpanded(key)
			? expandedMonths.filter((item) => item !== key)
			: [...expandedMonths, key];
	}

	function votePath(item: BoardApproval): string {
		return `/approvals/${item.id}/vote`;
	}

	async function copyVoteLink(item: BoardApproval) {
		if (!item.id || typeof window === 'undefined') return;
		const url = new URL(votePath(item), window.location.origin).toString();
		await navigator.clipboard.writeText(url);
		addToast('Vote link copied', 'success');
	}

	function amountLabel(item: BoardApproval): string {
		if (!item.amount) return 'No amount';
		if ((item.currency || 'IDR').toUpperCase() === 'IDR') return formatRupiah(item.amount);
		return `${item.currency} ${Number(item.amount).toLocaleString('id-ID')}`;
	}

	function approverList(value?: string | null): string[] {
		return (value || '')
			.split(/[\n,]+/)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function voteNames(item: BoardApproval, voteValue: 'agree' | 'disagree'): string[] {
		return (item.votes || [])
			.filter((vote) => vote.vote === voteValue)
			.map((vote) => vote.voter_name || vote.voter_email)
			.filter(Boolean);
	}
</script>

<svelte:head>
	<title>Board Approvals | EFATA</title>
</svelte:head>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<div class="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4 mb-6 pt-4 fade-up">
		<div>
			<div class="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 mb-3">
				<ShieldCheck class="w-3.5 h-3.5" />
				Private board approval
			</div>
			<h1 class="text-3xl sm:text-4xl font-bold text-white glow-text brand-font">
				Board Approval Trail
			</h1>
			<p class="text-white/65 mt-2 max-w-2xl text-sm sm:text-base">
				Ringkasan proposal, voting board, dan bukti pendukung untuk keputusan penting.
			</p>
		</div>
		<div class="flex flex-wrap gap-2 w-full lg:w-auto">
			<button
				type="button"
				onclick={startCreate}
				class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
			>
				<Plus class="w-4 h-4" />
				Add Proposal
			</button>
		</div>
	</div>

	<div class="glass-card rounded-xl p-3 sm:p-4 mb-5 stagger">
		<p class="text-white/45 text-[10px] uppercase tracking-wider mb-3">{currentYearLabelValue}</p>
		<div class="grid grid-cols-2 gap-3 divide-x divide-white/10">
			<div class="pr-3 sm:pr-4 min-w-0">
				<div class="flex items-center gap-2 text-white/55 text-[10px] sm:text-xs uppercase tracking-wider">
					<BadgeCheck class="w-3.5 h-3.5 text-emerald-300 shrink-0" />
					Approved This Year
				</div>
				<p class="text-xl sm:text-2xl font-bold text-white mt-2 leading-none">{currentYearApprovals.length}</p>
			</div>
			<div class="pl-3 sm:pl-4 min-w-0">
				<div class="flex items-center gap-2 text-white/55 text-[10px] sm:text-xs uppercase tracking-wider">
					<Receipt class="w-3.5 h-3.5 text-sky-300 shrink-0" />
					Expenses This Year
				</div>
				<p class="text-xl sm:text-2xl font-bold text-white mt-2 leading-none truncate">{formatRupiah(currentYearExpenseAmount)}</p>
			</div>
		</div>
	</div>

	{#if showForm && isAuthenticated}
		<form class="glass-card rounded-xl p-4 sm:p-5 mb-5 fade-up" onsubmit={submitApproval}>
			<div class="flex items-start justify-between gap-3 mb-4">
				<div>
					<h2 class="text-white font-semibold text-lg">
						{editingId ? 'Edit Proposal' : 'Add Board Proposal'}
					</h2>
					<p class="text-white/55 text-sm mt-0.5">Isi ringkas supaya mudah dicek board di mobile.</p>
				</div>
				<button
					type="button"
					onclick={cancelForm}
					class="glass-button rounded-full p-2 text-white/70 hover:text-white"
					title="Close form"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
				<label class="md:col-span-2">
					<span class="text-white/60 text-xs uppercase tracking-wider">Title</span>
					<input class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white" bind:value={formState.title} placeholder="Contoh: Pembelian laptop pelayanan" />
				</label>
				<label>
					<span class="text-white/60 text-xs uppercase tracking-wider">Type</span>
					<select class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white" bind:value={formState.kind}>
						{#each kindOptions as item}
							<option value={item.value}>{item.label}</option>
						{/each}
					</select>
				</label>
				<label>
					<span class="text-white/60 text-xs uppercase tracking-wider">Status</span>
					<select class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white" bind:value={formState.status}>
						{#each statusOptions as item}
							<option value={item.value}>{item.label}</option>
						{/each}
					</select>
				</label>
				<label>
					<span class="text-white/60 text-xs uppercase tracking-wider">Decision Date</span>
					<input type="date" class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white" bind:value={formState.decision_date} />
				</label>
				<label>
					<span class="text-white/60 text-xs uppercase tracking-wider">Amount</span>
					<input type="number" min="0" class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white" bind:value={formState.amount} />
				</label>
				<label>
					<span class="text-white/60 text-xs uppercase tracking-wider">Currency</span>
					<input class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white uppercase" bind:value={formState.currency} />
				</label>
				<label class="md:col-span-1">
					<span class="text-white/60 text-xs uppercase tracking-wider">Fallback Proof Screenshot</span>
					<input type="file" accept="image/*" class="glass-input rounded-xl px-3 py-2 w-full mt-1 text-white text-sm" onchange={onProofChange} />
				</label>
				<label class="md:col-span-2">
					<span class="text-white/60 text-xs uppercase tracking-wider">Fallback / Manual Approvers</span>
					<textarea class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white min-h-24" bind:value={formState.approvers} placeholder="Optional. Isi hanya jika board approve di WhatsApp atau di luar app."></textarea>
				</label>
				<label class="md:col-span-4">
					<span class="text-white/60 text-xs uppercase tracking-wider">Notes</span>
					<textarea class="glass-input rounded-xl px-3 py-2.5 w-full mt-1 text-white min-h-20" bind:value={formState.notes} placeholder="Catatan singkat keputusan, vendor, tujuan, atau batasan approval"></textarea>
				</label>
			</div>

			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
				<p class="text-white/45 text-xs">
					{#if proofFile}
						Selected proof: {proofFile.name}
					{:else if editingId}
						Leave proof empty to keep the current fallback screenshot.
					{:else}
						Start with the vote link. Screenshot and manual approvers are optional fallback evidence.
					{/if}
				</p>
				<div class="flex gap-2">
					<button type="button" onclick={cancelForm} class="glass-button rounded-full px-4 py-2 text-white/70 text-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={saving}
						class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 inline-flex items-center gap-1.5 disabled:opacity-50"
					>
						<Save class="w-4 h-4" />
						{saving ? 'Saving...' : 'Save Approval'}
					</button>
				</div>
			</div>
		</form>
	{/if}

	<div class="glass-card rounded-xl p-3 sm:p-4 mb-5">
		<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
			<label class="md:col-span-2 relative">
				<span class="sr-only">Search approvals</span>
				<Search class="w-4 h-4 text-white/40 absolute left-3 top-3.5" />
				<input
					class="glass-input rounded-xl pl-9 pr-3 py-2.5 w-full text-white"
					bind:value={filterQuery}
					placeholder="Search title, voter, fallback approver, or notes"
				/>
			</label>
			<label>
				<span class="sr-only">Filter by type</span>
				<select class="glass-input rounded-xl px-3 py-2.5 w-full text-white" bind:value={filterKind}>
					<option value="all">All types</option>
					{#each kindOptions as item}
						<option value={item.value}>{item.label}</option>
					{/each}
				</select>
			</label>
			<label>
				<span class="sr-only">Filter by status</span>
				<select class="glass-input rounded-xl px-3 py-2.5 w-full text-white" bind:value={filterStatus}>
					<option value="all">All statuses</option>
					{#each statusOptions as item}
						<option value={item.value}>{item.label}</option>
					{/each}
				</select>
			</label>
		</div>
	</div>

	{#if filteredApprovals.length === 0}
		<EmptyState
			icon={ShieldCheck}
			title="Belum ada approval"
			description="Approval yang ditambahkan akan muncul untuk board yang sudah sign in."
		/>
	{:else}
		<div class="grid grid-cols-1 gap-3 pb-8">
			{#each monthGroups as group}
				<section class="glass-card rounded-xl overflow-hidden">
					<button
						type="button"
						onclick={() => toggleMonth(group.key)}
						class="w-full px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-white/5 transition-colors"
						aria-expanded={monthExpanded(group.key)}
					>
						<div class="min-w-0">
							<p class="text-white font-semibold text-lg brand-font">{group.label}</p>
							<p class="text-white/45 text-xs mt-1">
								{group.approvedCount} approved
								<span class="mx-1.5">&middot;</span>
								{group.items.length} total records
							</p>
						</div>
						<div class="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
							<div class="text-left sm:text-right min-w-0">
								<p class="text-white/45 text-[10px] uppercase tracking-wider">Approved expenses</p>
								<p class="text-white font-bold text-lg sm:text-xl truncate">{formatRupiah(group.expenseAmount)}</p>
							</div>
							<ChevronDown class="w-5 h-5 text-white/55 shrink-0 transition-transform {monthExpanded(group.key) ? 'rotate-180' : ''}" />
						</div>
					</button>

					{#if monthExpanded(group.key)}
						<div class="border-t border-white/10 px-3 sm:px-4 py-3 grid grid-cols-1 gap-3">
						{#each group.items as item}
								<article class="glass rounded-xl p-4 sm:p-5">
									<div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
										<div class="min-w-0">
											<div class="flex flex-wrap items-center gap-2 mb-3">
												<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold {kindClass(item.kind)}">
													{kindLabel(item.kind)}
												</span>
												<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold {statusClass(item.status)}">
													{statusLabel(item.status)}
												</span>
												<span class="inline-flex items-center gap-1 text-white/55 text-xs">
													<CalendarDays class="w-3.5 h-3.5" />
													{dateLabel(item.decision_date)}
												</span>
											</div>

											<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
												<div>
													<h2 class="text-xl font-bold text-white brand-font leading-tight">{item.title}</h2>
													<p class="text-2xl font-bold text-emerald-200 mt-2">{amountLabel(item)}</p>
												</div>
												<div class="flex flex-wrap gap-2 self-start">
													<a
														href={votePath(item)}
														class="glass-button rounded-full px-3 py-2 text-white/75 hover:text-white text-sm inline-flex items-center gap-1.5"
													>
														<BadgeCheck class="w-4 h-4" />
														Vote
													</a>
													<button
														type="button"
														onclick={() => copyVoteLink(item)}
														class="glass-button rounded-full p-2 text-white/70 hover:text-white"
														title="Copy vote link"
													>
														<Clipboard class="w-4 h-4" />
													</button>
													<button
														type="button"
														onclick={() => startEdit(item)}
														class="glass-button rounded-full px-3 py-2 text-white/75 hover:text-white text-sm inline-flex items-center gap-1.5"
													>
														<Pencil class="w-4 h-4" />
														Edit
													</button>
												</div>
											</div>

											<div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
												<div class="glass rounded-xl p-3">
													<div class="flex items-center gap-2 text-white/55 text-xs uppercase tracking-wider mb-2">
														<BadgeCheck class="w-3.5 h-3.5" />
														Online approval
													</div>
													<p class="text-white/80 text-sm mb-2">
														<span class="text-emerald-200 font-semibold">{item.vote_summary?.agree || 0}</span>
														setuju
														<span class="mx-1 text-white/35">/</span>
														<span class="text-rose-200 font-semibold">{item.vote_summary?.disagree || 0}</span>
														tidak setuju
													</p>
													<div class="space-y-2">
														<div>
															<p class="text-white/40 text-[10px] uppercase tracking-wider mb-1">Setuju</p>
															<div class="flex flex-wrap gap-1.5">
																{#each voteNames(item, 'agree') as approver}
																	<span class="rounded-full bg-emerald-500/15 border border-emerald-400/25 px-2 py-1 text-xs text-emerald-100">{approver}</span>
																{:else}
																	<span class="text-white/35 text-xs">Belum ada</span>
																{/each}
															</div>
														</div>
														<div>
															<p class="text-white/40 text-[10px] uppercase tracking-wider mb-1">Tidak setuju</p>
															<div class="flex flex-wrap gap-1.5">
																{#each voteNames(item, 'disagree') as approver}
																	<span class="rounded-full bg-rose-500/15 border border-rose-400/25 px-2 py-1 text-xs text-rose-100">{approver}</span>
																{:else}
																	<span class="text-white/35 text-xs">Belum ada</span>
																{/each}
															</div>
														</div>
													</div>
												</div>
												<div class="glass rounded-xl p-3">
													<div class="flex items-center gap-2 text-white/55 text-xs uppercase tracking-wider mb-2">
														<Users class="w-3.5 h-3.5" />
														Fallback manual approvers
													</div>
													<div class="flex flex-wrap gap-1.5">
														{#each approverList(item.approvers) as approver}
															<span class="rounded-full bg-white/10 border border-white/15 px-2 py-1 text-xs text-white/80">{approver}</span>
														{:else}
															<span class="text-white/35 text-xs">Only needed when approval happened outside the app.</span>
														{/each}
													</div>
												</div>
											</div>

											{#if item.notes}
												<p class="text-white/65 text-sm mt-3 whitespace-pre-wrap">{item.notes}</p>
											{/if}

											<div class="flex flex-wrap gap-x-4 gap-y-1 text-white/40 text-xs mt-4">
												<span>Updated {dateLabel(item.updated_at)}</span>
												{#if item.proof_sha256}
													<span>Proof checksum {item.proof_sha256.slice(0, 12)}</span>
												{/if}
											</div>
										</div>

										<div class="lg:border-l lg:border-white/10 lg:pl-4">
											{#if item.proof_filename}
												<a href={proofUrl(item)} target="_blank" rel="noreferrer" class="block group">
													<div class="rounded-xl overflow-hidden border border-white/15 bg-black/20">
														<img src={proofUrl(item)} alt="WhatsApp proof for {item.title}" class="w-full max-h-80 object-contain bg-black/25" loading="lazy" />
													</div>
													<div class="flex items-center justify-between gap-2 mt-2 text-xs text-white/55 group-hover:text-white/80">
														<span class="inline-flex items-center gap-1">
															<FileImage class="w-3.5 h-3.5" />
															Fallback proof
														</span>
														<span class="inline-flex items-center gap-1">
															Open
															<ExternalLink class="w-3.5 h-3.5" />
														</span>
													</div>
												</a>
											{:else}
												<div class="rounded-xl border border-dashed border-white/20 bg-white/5 p-5 text-center text-white/45 text-sm">
													<FileImage class="w-7 h-7 mx-auto mb-2 opacity-60" />
													No fallback screenshot attached
												</div>
											{/if}
										</div>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>
