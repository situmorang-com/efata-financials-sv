<script lang="ts">
	import { formatRupiah } from '$lib/format.js';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Landmark from '@lucide/svelte/icons/landmark';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import Scale from '@lucide/svelte/icons/scale';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import FileText from '@lucide/svelte/icons/file-text';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	type Summary = {
		month: string;
		income_total: number;
		expense_total: number;
		net_total: number;
		pending_approvals: number;
		expense_by_category: Array<{ category: string; total: number }>;
	};

	let summary = $state<Summary | null>(null);
	let loading = $state(true);

	function monthKeyNow(): string {
		const now = new Date();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		return `${now.getFullYear()}-${month}`;
	}

	async function loadSummary() {
		try {
			const month = monthKeyNow();
			const res = await fetch(`/api/finance/reports/summary?month=${month}`);
			summary = await res.json();
		} catch (error) {
			console.error('Failed to load finance summary:', error);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadSummary();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<div class="mb-6 fade-up">
		<h1 class="text-2xl font-bold text-white glow-text brand-font flex items-center gap-2">
			<Landmark class="w-6 h-6 text-emerald-300" />
			Finance Overview
		</h1>
		<p class="text-white/60 text-sm mt-1">Ringkasan keuangan EFATA bulan berjalan.</p>
	</div>

	{#if loading}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<Skeleton class="h-28 rounded-2xl" />
			<Skeleton class="h-28 rounded-2xl" />
			<Skeleton class="h-28 rounded-2xl" />
			<Skeleton class="h-28 rounded-2xl" />
		</div>
	{:else if summary}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger">
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<TrendingUp class="w-4 h-4 text-emerald-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Cash In</p>
				</div>
				<p class="text-2xl font-bold text-emerald-200">{formatRupiah(summary.income_total)}</p>
				<p class="text-white/45 text-xs mt-1">{summary.month}</p>
			</div>
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<TrendingDown class="w-4 h-4 text-amber-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Cash Out</p>
				</div>
				<p class="text-2xl font-bold text-amber-100">{formatRupiah(summary.expense_total)}</p>
				<p class="text-white/45 text-xs mt-1">{summary.month}</p>
			</div>
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<Scale class="w-4 h-4 text-sky-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Net</p>
				</div>
				<p class="text-2xl font-bold {summary.net_total >= 0 ? 'text-sky-200' : 'text-rose-200'}">{formatRupiah(summary.net_total)}</p>
				<p class="text-white/45 text-xs mt-1">{summary.month}</p>
			</div>
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<Clock3 class="w-4 h-4 text-rose-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Pending Approval</p>
				</div>
				<p class="text-2xl font-bold text-rose-200">{summary.pending_approvals}</p>
				<p class="text-white/45 text-xs mt-1">Pengeluaran menunggu approval</p>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<div class="glass-card rounded-2xl p-5 fade-up">
				<h2 class="text-white font-semibold mb-3 brand-font">Top Kategori Pengeluaran</h2>
				{#if summary.expense_by_category.length === 0}
					<p class="text-white/50 text-sm">Belum ada data pengeluaran pada periode ini.</p>
				{:else}
					<div class="space-y-2">
						{#each summary.expense_by_category.slice(0, 6) as item}
							<div class="flex items-center justify-between text-sm">
								<p class="text-white/75 truncate pr-4">{item.category || 'Tanpa kategori'}</p>
								<p class="text-amber-100 font-medium">{formatRupiah(item.total)}</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="glass-card rounded-2xl p-5 fade-up">
				<h2 class="text-white font-semibold mb-3 brand-font">Quick Links</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<a href="/finance/income" class="glass rounded-xl p-3 hover:bg-white/5 transition-colors">
						<p class="text-white font-medium text-sm">Income Ledger</p>
						<p class="text-white/50 text-xs mt-1">Persepuluhan, persembahan, donasi</p>
					</a>
					<a href="/finance/expenses" class="glass rounded-xl p-3 hover:bg-white/5 transition-colors">
						<p class="text-white font-medium text-sm">Expense Ledger</p>
						<p class="text-white/50 text-xs mt-1">Pengajuan, approval, pembayaran</p>
					</a>
					<a href="/finance/reports" class="glass rounded-xl p-3 hover:bg-white/5 transition-colors">
						<p class="text-white font-medium text-sm">Reports</p>
						<p class="text-white/50 text-xs mt-1">Ringkasan bulanan dan export</p>
					</a>
					<a href="/batches" class="glass rounded-xl p-3 hover:bg-white/5 transition-colors">
						<p class="text-white font-medium text-sm">Transfer Module</p>
						<p class="text-white/50 text-xs mt-1">Bantuan transfer penerima</p>
					</a>
				</div>
				<a href="/finance/reports" class="inline-flex items-center gap-1.5 text-sky-200 text-xs mt-4 hover:text-sky-100 transition-colors">
					<FileText class="w-3.5 h-3.5" />
					Buka laporan keuangan
					<ArrowRight class="w-3.5 h-3.5" />
				</a>
			</div>
		</div>
	{:else}
		<EmptyState
			icon={Landmark}
			title="Ringkasan keuangan belum tersedia"
			description="Silakan tambah transaksi income/expense terlebih dahulu."
		/>
	{/if}
</div>
