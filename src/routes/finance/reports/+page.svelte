<script lang="ts">
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Download from '@lucide/svelte/icons/download';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import Scale from '@lucide/svelte/icons/scale';
	import Clock3 from '@lucide/svelte/icons/clock-3';

	type Summary = {
		month: string;
		income_total: number;
		expense_total: number;
		net_total: number;
		pending_approvals: number;
		expense_by_category: Array<{ category: string; total: number }>;
	};

	type CashflowPoint = {
		period: string;
		income_total: number;
		expense_total: number;
		net_total: number;
		cumulative_net: number;
	};

	type Cashflow = {
		date_from: string;
		date_to: string;
		group_by: 'day' | 'week' | 'month';
		income_total: number;
		expense_total: number;
		net_total: number;
		points: CashflowPoint[];
	};

	type AllocationGroup = {
		destination: string;
		total: number;
		tx_count: number;
		percent_of_total: number;
		sub_breakdown: Array<{
			sub_type: string;
			total: number;
			tx_count: number;
		}>;
	};

	type Allocation = {
		date_from: string;
		date_to: string;
		type: 'income' | 'expense' | 'all';
		grand_total: number;
		groups: AllocationGroup[];
	};

	let loading = $state(true);
	let summary = $state<Summary | null>(null);
	let selectedMonth = $state('');
	let cashflowLoading = $state(true);
	let cashflow = $state<Cashflow | null>(null);
	let allocationLoading = $state(true);
	let allocation = $state<Allocation | null>(null);
	let dateFrom = $state('');
	let dateTo = $state('');
	let cashflowGroupBy = $state<'day' | 'week' | 'month'>('week');
	let allocationType = $state<'income' | 'expense' | 'all'>('income');
	let initialized = $state(false);

	function monthNow(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function monthRange(month: string): { start: string; end: string } {
		const [yearStr, monthStr] = month.split('-');
		const year = Number(yearStr);
		const monthNumber = Number(monthStr);
		if (!year || !monthNumber) return { start: '', end: '' };
		const daysInMonth = new Date(year, monthNumber, 0).getDate();
		return {
			start: `${yearStr}-${monthStr}-01`,
			end: `${yearStr}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`
		};
	}

	async function loadSummary() {
		loading = true;
		try {
			const month = selectedMonth || monthNow();
			const res = await fetch(`/api/finance/reports/summary?month=${month}`);
			if (!res.ok) throw new Error('failed');
			summary = await res.json();
		} catch (error) {
			console.error('Failed to load finance summary:', error);
			addToast('Gagal memuat report finance', 'error');
		} finally {
			loading = false;
		}
	}

	async function loadCashflow() {
		if (!dateFrom || !dateTo) return;
		cashflowLoading = true;
		try {
			const search = new URLSearchParams({
				date_from: dateFrom,
				date_to: dateTo,
				group_by: cashflowGroupBy
			});
			const res = await fetch(`/api/finance/reports/cashflow?${search.toString()}`);
			if (!res.ok) throw new Error('failed');
			cashflow = await res.json();
		} catch (error) {
			console.error('Failed to load finance cashflow:', error);
			addToast('Gagal memuat cashflow trend', 'error');
		} finally {
			cashflowLoading = false;
		}
	}

	async function loadAllocation() {
		if (!dateFrom || !dateTo) return;
		allocationLoading = true;
		try {
			const search = new URLSearchParams({
				date_from: dateFrom,
				date_to: dateTo,
				type: allocationType
			});
			const res = await fetch(`/api/finance/reports/allocation?${search.toString()}`);
			if (!res.ok) throw new Error('failed');
			allocation = await res.json();
		} catch (error) {
			console.error('Failed to load finance allocation:', error);
			addToast('Gagal memuat ringkasan alokasi dana', 'error');
		} finally {
			allocationLoading = false;
		}
	}

	function onMonthChange() {
		const range = monthRange(selectedMonth);
		if (range.start && range.end) {
			dateFrom = range.start;
			dateTo = range.end;
		}
		loadSummary();
		loadCashflow();
		loadAllocation();
	}

	function cashflowGroupLabel(groupBy: 'day' | 'week' | 'month'): string {
		if (groupBy === 'day') return 'Per Hari';
		if (groupBy === 'month') return 'Per Bulan';
		return 'Per Minggu';
	}

	function allocationTypeLabel(type: 'income' | 'expense' | 'all'): string {
		if (type === 'expense') return 'Pengeluaran';
		if (type === 'all') return 'Semua Transaksi';
		return 'Pemasukan';
	}

	function subTypeLabel(subType: string): string {
		if (subType === 'tithe') return 'Persepuluhan';
		if (subType === 'offering') return 'Persembahan';
		if (subType === 'other_income') return 'Lainnya';
		if (subType === 'expense') return 'Expense';
		return subType;
	}

	function downloadSummaryCsv() {
		if (!summary) return;
		const lines = [
			['Month', summary.month],
			['Income Total', String(summary.income_total)],
			['Expense Total', String(summary.expense_total)],
			['Net Total', String(summary.net_total)],
			['Pending Approvals', String(summary.pending_approvals)],
			[],
			['Expense Category', 'Total']
		];
		for (const item of summary.expense_by_category) {
			lines.push([item.category || 'Tanpa kategori', String(item.total)]);
		}

		const csv = lines
			.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
			.join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `finance-summary-${summary.month}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	$effect(() => {
		if (initialized) return;
		initialized = true;
		selectedMonth = monthNow();
		const range = monthRange(selectedMonth);
		dateFrom = range.start;
		dateTo = range.end;
		loadSummary();
		loadCashflow();
		loadAllocation();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Finance', href: '/finance', icon: Landmark },
		{ label: 'Reports' }
	]} />

	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-4 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font">Finance Reports</h1>
			<p class="text-white/60 text-sm mt-1">Ringkasan income, expense, dan net berdasarkan bulan.</p>
		</div>
		<div class="flex items-center gap-2">
			<input
				type="month"
				bind:value={selectedMonth}
				onchange={onMonthChange}
				class="glass-input rounded-xl px-3 py-2 text-white text-sm"
			/>
			<button
				type="button"
				onclick={downloadSummaryCsv}
				disabled={!summary}
				class="glass-button rounded-xl px-3 py-2 text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
			>
				<Download class="w-4 h-4" />
				CSV
			</button>
		</div>
	</div>

	{#if loading}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
			<Skeleton class="h-28 rounded-2xl" />
			<Skeleton class="h-28 rounded-2xl" />
			<Skeleton class="h-28 rounded-2xl" />
			<Skeleton class="h-28 rounded-2xl" />
		</div>
	{:else if summary}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 stagger">
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<TrendingUp class="w-4 h-4 text-emerald-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Income</p>
				</div>
				<p class="text-2xl font-bold text-emerald-200">{formatRupiah(summary.income_total)}</p>
			</div>
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<TrendingDown class="w-4 h-4 text-amber-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Expense</p>
				</div>
				<p class="text-2xl font-bold text-amber-100">{formatRupiah(summary.expense_total)}</p>
			</div>
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<Scale class="w-4 h-4 text-sky-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Net</p>
				</div>
				<p class="text-2xl font-bold {summary.net_total >= 0 ? 'text-sky-200' : 'text-rose-200'}">{formatRupiah(summary.net_total)}</p>
			</div>
			<div class="glass-card rounded-2xl p-4">
				<div class="flex items-center gap-2 mb-1">
					<Clock3 class="w-4 h-4 text-rose-300" />
					<p class="text-white/60 text-xs uppercase tracking-wider">Pending Approval</p>
				</div>
				<p class="text-2xl font-bold text-rose-200">{summary.pending_approvals}</p>
			</div>
		</div>

		<div class="glass-card rounded-2xl p-5 fade-up">
			<h2 class="text-white font-semibold mb-3 brand-font">Expense by Category ({summary.month})</h2>
			{#if summary.expense_by_category.length === 0}
				<EmptyState icon={Landmark} title="Belum ada data pengeluaran" description="Belum ada expense pada bulan ini." />
			{:else}
				<div class="space-y-2">
					{#each summary.expense_by_category as item}
						<div class="glass rounded-xl p-3 flex items-center justify-between gap-3">
							<p class="text-white/75 text-sm truncate">{item.category || 'Tanpa kategori'}</p>
							<p class="text-amber-100 text-sm font-semibold">{formatRupiah(item.total)}</p>
						</div>
					{/each}
				</div>
				{/if}
			</div>

			<div class="glass-card rounded-2xl p-5 mt-4 fade-up">
				<div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-3">
					<div>
						<h2 class="text-white font-semibold brand-font">Cashflow Trend</h2>
						<p class="text-white/60 text-xs mt-1">
							Ringkasan {cashflowGroupLabel(cashflowGroupBy).toLowerCase()} dari {dateFrom} sampai {dateTo}.
						</p>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full lg:w-auto">
						<input
							type="date"
							bind:value={dateFrom}
							onchange={loadCashflow}
							class="glass-input rounded-xl px-3 py-2 text-white text-sm"
						/>
						<input
							type="date"
							bind:value={dateTo}
							onchange={loadCashflow}
							class="glass-input rounded-xl px-3 py-2 text-white text-sm"
						/>
						<select
							bind:value={cashflowGroupBy}
							onchange={loadCashflow}
							class="glass-input rounded-xl px-3 py-2 text-white text-sm"
						>
							<option value="day">Per Hari</option>
							<option value="week">Per Minggu</option>
							<option value="month">Per Bulan</option>
						</select>
						<button
							type="button"
							onclick={loadCashflow}
							class="glass-button rounded-xl px-3 py-2 text-white text-sm"
						>
							Refresh
						</button>
					</div>
				</div>

				{#if cashflowLoading}
					<div class="space-y-2">
						<Skeleton class="h-14 rounded-xl" />
						<Skeleton class="h-14 rounded-xl" />
						<Skeleton class="h-14 rounded-xl" />
					</div>
				{:else if cashflow}
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
						<div class="glass rounded-xl p-3">
							<p class="text-[11px] uppercase tracking-wider text-white/55">Income</p>
							<p class="text-emerald-200 font-semibold">{formatRupiah(cashflow.income_total)}</p>
						</div>
						<div class="glass rounded-xl p-3">
							<p class="text-[11px] uppercase tracking-wider text-white/55">Expense</p>
							<p class="text-amber-100 font-semibold">{formatRupiah(cashflow.expense_total)}</p>
						</div>
						<div class="glass rounded-xl p-3">
							<p class="text-[11px] uppercase tracking-wider text-white/55">Net</p>
							<p class="font-semibold {cashflow.net_total >= 0 ? 'text-sky-200' : 'text-rose-200'}">
								{formatRupiah(cashflow.net_total)}
							</p>
						</div>
					</div>

					{#if cashflow.points.length === 0}
						<EmptyState
							icon={Scale}
							title="Belum ada arus kas"
							description="Belum ada transaksi pada rentang tanggal yang dipilih."
						/>
					{:else}
						<div class="space-y-2">
							{#each cashflow.points as point}
								<div class="glass rounded-xl p-3">
									<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
										<div>
											<p class="text-white/80 text-sm font-semibold">{point.period}</p>
											<p class="text-xs text-white/55">
												Income {formatRupiah(point.income_total)} • Expense {formatRupiah(point.expense_total)}
											</p>
										</div>
										<div class="text-left sm:text-right">
											<p class="text-sm font-semibold {point.net_total >= 0 ? 'text-sky-200' : 'text-rose-200'}">
												Net {formatRupiah(point.net_total)}
											</p>
											<p class="text-xs text-white/55">Kumulatif {formatRupiah(point.cumulative_net)}</p>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<EmptyState
						icon={Scale}
						title="Cashflow tidak tersedia"
						description="Data cashflow belum dapat dimuat."
					/>
				{/if}
			</div>

			<div class="glass-card rounded-2xl p-5 mt-4 fade-up">
				<div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-3">
					<div>
						<h2 class="text-white font-semibold brand-font">Fund Allocation</h2>
						<p class="text-white/60 text-xs mt-1">
							Pembagian {allocationTypeLabel(allocationType).toLowerCase()} berdasarkan tujuan dana.
						</p>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full lg:w-auto">
						<select
							bind:value={allocationType}
							onchange={loadAllocation}
							class="glass-input rounded-xl px-3 py-2 text-white text-sm"
						>
							<option value="income">Pemasukan</option>
							<option value="expense">Pengeluaran</option>
							<option value="all">Semua Transaksi</option>
						</select>
						<button
							type="button"
							onclick={loadAllocation}
							class="glass-button rounded-xl px-3 py-2 text-white text-sm"
						>
							Refresh
						</button>
					</div>
				</div>

				{#if allocationLoading}
					<div class="space-y-2">
						<Skeleton class="h-16 rounded-xl" />
						<Skeleton class="h-16 rounded-xl" />
					</div>
				{:else if allocation}
					<div class="glass rounded-xl p-3 mb-3 flex items-center justify-between gap-3">
						<p class="text-white/70 text-sm">Total {allocationTypeLabel(allocation.type)}</p>
						<p class="text-white text-sm font-semibold">{formatRupiah(allocation.grand_total)}</p>
					</div>

					{#if allocation.groups.length === 0}
						<EmptyState
							icon={Landmark}
							title="Belum ada data alokasi"
							description="Tidak ada transaksi pada rentang dan jenis yang dipilih."
						/>
					{:else}
						<div class="space-y-2">
							{#each allocation.groups as group}
								<div class="glass rounded-xl p-3">
									<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
										<div>
											<p class="text-white text-sm font-semibold">{group.destination}</p>
											<p class="text-xs text-white/55">
												{group.tx_count} transaksi • {group.percent_of_total}% dari total
											</p>
										</div>
										<p class="text-sm font-semibold text-emerald-200">{formatRupiah(group.total)}</p>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each group.sub_breakdown as sub}
											<span class="text-[11px] px-2 py-1 rounded-full border border-white/15 text-white/75 bg-white/5">
												{subTypeLabel(sub.sub_type)}: {formatRupiah(sub.total)}
											</span>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<EmptyState
						icon={Landmark}
						title="Alokasi tidak tersedia"
						description="Data alokasi belum dapat dimuat."
					/>
				{/if}
			</div>
	{:else}
		<EmptyState
			icon={Landmark}
			title="Report tidak tersedia"
			description="Data ringkasan belum bisa ditampilkan untuk periode ini."
		/>
	{/if}
</div>
