<script lang="ts">
	import type { BoardApproval, BoardApprovalVote } from '$lib/types.js';
	import type { PageData } from './$types.js';
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileImage from '@lucide/svelte/icons/file-image';
	import Receipt from '@lucide/svelte/icons/receipt';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ThumbsDown from '@lucide/svelte/icons/thumbs-down';
	import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
	import Users from '@lucide/svelte/icons/users';
	import XCircle from '@lucide/svelte/icons/x-circle';

	let { data }: { data: PageData } = $props();

	let savedApproval = $state<BoardApproval | null>(null);
	let savedVotes = $state<BoardApprovalVote[] | null>(null);
	let savingVote = $state<'agree' | 'disagree' | null>(null);
	let comment = $state('');
	let commentInitialized = $state(false);
	let approval = $derived(savedApproval ?? data.approval);
	let votes = $derived(savedVotes ?? data.votes ?? []);

	$effect(() => {
		if (!commentInitialized) {
			comment = approval.user_vote?.comment || '';
			commentInitialized = true;
		}
	});

	function dateLabel(value: string): string {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function amountLabel(item: BoardApproval): string {
		if (!item.amount) return 'No amount';
		if ((item.currency || 'IDR').toUpperCase() === 'IDR') return formatRupiah(item.amount);
		return `${item.currency} ${Number(item.amount).toLocaleString('id-ID')}`;
	}

	function proofUrl(item: BoardApproval): string {
		return `/api/approvals/${item.id}/proof`;
	}

	function voteLabel(vote: string): string {
		return vote === 'agree' ? 'Setuju' : 'Tidak setuju';
	}

	function initials(value: string): string {
		const parts = value
			.split(/[.\s@_-]+/)
			.map((item) => item.trim())
			.filter(Boolean);
		return (parts[0]?.[0] || '?').toUpperCase();
	}

	async function submitVote(vote: 'agree' | 'disagree') {
		if (!approval.id) return;
		savingVote = vote;
		try {
			const res = await fetch(`/api/approvals/${approval.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ vote, comment })
			});
			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				throw new Error(error.error || 'failed');
			}
			const result = await res.json();
			savedApproval = {
				...approval,
				vote_summary: result.summary,
				user_vote: result.vote
			};
			savedVotes = result.votes || [];
			addToast(vote === 'agree' ? 'Vote setuju tersimpan' : 'Vote tidak setuju tersimpan', 'success');
		} catch (error) {
			console.error('Failed to save vote:', error);
			addToast('Gagal menyimpan vote', 'error');
		} finally {
			savingVote = null;
		}
	}
</script>

<svelte:head>
	<title>Vote Approval | EFATA</title>
</svelte:head>

<div class="p-4 sm:p-6 max-w-3xl mx-auto">
	<a href="/approvals" class="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-4">
		<ArrowLeft class="w-4 h-4" />
		Board Approval Trail
	</a>

	<section class="glass-card rounded-xl p-4 sm:p-6 mb-4">
		<div class="flex flex-wrap items-center gap-2 mb-4">
			<span class="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200">
				<ShieldCheck class="w-3.5 h-3.5" />
				In-app approval
			</span>
			<span class="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-white/70">
				<CalendarDays class="w-3.5 h-3.5" />
				{dateLabel(approval.decision_date)}
			</span>
		</div>

		<h1 class="text-2xl sm:text-3xl font-bold text-white brand-font leading-tight">{approval.title}</h1>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
			<div class="glass rounded-xl p-4">
				<div class="flex items-center gap-2 text-white/50 text-xs uppercase tracking-wider">
					<Receipt class="w-3.5 h-3.5 text-sky-300" />
					Amount
				</div>
				<p class="text-2xl font-bold text-white mt-2">{amountLabel(approval)}</p>
			</div>
			<div class="glass rounded-xl p-4">
				<div class="flex items-center gap-2 text-white/50 text-xs uppercase tracking-wider">
					<BadgeCheck class="w-3.5 h-3.5 text-emerald-300" />
					Votes
				</div>
				<p class="text-2xl font-bold text-white mt-2">
					{approval.vote_summary?.agree || 0}
					<span class="text-white/35">/</span>
					{approval.vote_summary?.disagree || 0}
				</p>
				<p class="text-white/45 text-xs mt-1">Setuju / Tidak setuju</p>
			</div>
		</div>

		{#if approval.notes}
			<div class="glass rounded-xl p-4 mt-3">
				<p class="text-white/50 text-xs uppercase tracking-wider mb-2">Explanation</p>
				<p class="text-white/75 text-sm whitespace-pre-wrap">{approval.notes}</p>
			</div>
		{/if}

	</section>

	<section class="glass-card rounded-xl p-4 sm:p-5 mb-4">
		<p class="text-white font-semibold mb-3">Your decision</p>
		<textarea
			class="glass-input rounded-xl px-3 py-2.5 w-full text-white min-h-20 mb-3"
			bind:value={comment}
			placeholder="Catatan singkat jika perlu"
		></textarea>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<button
				type="button"
				onclick={() => submitVote('agree')}
				disabled={savingVote !== null}
				class="rounded-xl border border-emerald-400/35 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-50 px-5 py-5 text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
			>
				<ThumbsUp class="w-5 h-5" />
				{savingVote === 'agree' ? 'Menyimpan...' : 'Setuju'}
			</button>
			<button
				type="button"
				onclick={() => submitVote('disagree')}
				disabled={savingVote !== null}
				class="rounded-xl border border-rose-400/35 bg-rose-500/20 hover:bg-rose-500/30 text-rose-50 px-5 py-5 text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
			>
				<ThumbsDown class="w-5 h-5" />
				{savingVote === 'disagree' ? 'Menyimpan...' : 'Tidak Setuju'}
			</button>
		</div>

		{#if approval.user_vote}
			<div class="mt-3 rounded-xl border border-white/12 bg-white/[0.07] px-3 py-2 text-sm text-white/70">
				Your current vote: <span class="font-semibold text-white">{voteLabel(approval.user_vote.vote)}</span>
			</div>
		{/if}
	</section>

	{#if votes.length > 0}
		<section class="glass-card rounded-xl p-4 sm:p-5 mb-4">
			<div class="flex items-center gap-2 text-white/55 text-xs uppercase tracking-wider mb-3">
				<Users class="w-3.5 h-3.5" />
				Online signatures
			</div>
			<div class="grid grid-cols-1 gap-2">
				{#each votes as vote}
					<div class="glass rounded-xl p-3 flex items-start gap-3">
						<div class="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 text-sm font-bold shrink-0">
							{initials(vote.voter_name || vote.voter_email)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-white font-semibold text-sm truncate">{vote.voter_name || vote.voter_email}</p>
								<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border {vote.vote === 'agree' ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200' : 'bg-rose-500/15 border-rose-400/30 text-rose-200'}">
									{#if vote.vote === 'agree'}
										<CheckCircle2 class="w-3 h-3" />
									{:else}
										<XCircle class="w-3 h-3" />
									{/if}
									{voteLabel(vote.vote)}
								</span>
							</div>
							<p class="text-white/40 text-xs mt-1">{dateLabel(vote.updated_at)}</p>
							{#if vote.comment}
								<p class="text-white/65 text-sm mt-2 whitespace-pre-wrap">{vote.comment}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if approval.proof_filename}
		<section class="glass-card rounded-xl p-4 sm:p-5 mb-4">
			<div class="flex items-center gap-2 text-white/55 text-xs uppercase tracking-wider mb-3">
				<FileImage class="w-3.5 h-3.5" />
				Fallback proof
			</div>
			<a href={proofUrl(approval)} target="_blank" rel="noreferrer" class="glass rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors">
				<span class="inline-flex items-center gap-2 text-white/75 text-sm">
					<FileImage class="w-4 h-4 text-amber-300" />
					View WhatsApp screenshot
				</span>
				<ExternalLink class="w-4 h-4 text-white/45" />
			</a>
		</section>
	{/if}
</div>
