<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import { formatRupiah } from '$lib/format.js';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Upload from '@lucide/svelte/icons/upload';
	import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import Link from '@lucide/svelte/icons/link';
	import FileDown from '@lucide/svelte/icons/file-down';
	import Lock from '@lucide/svelte/icons/lock';
	import Unlock from '@lucide/svelte/icons/unlock';
	import CircleOff from '@lucide/svelte/icons/circle-off';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';

	type ImportRow = {
		id: number;
		account_no: string;
		file_name: string;
		linked_account_id?: number | null;
		linked_account_name?: string | null;
		linked_account_bank_name?: string | null;
		linked_account_number?: string | null;
		period_from?: string | null;
		period_to?: string | null;
		opening_balance?: number | null;
		closing_balance?: number | null;
		status: 'open' | 'in_review' | 'closed';
		line_count: number;
		total_credit: number;
		total_debit: number;
		matched_count: number;
		suggested_count: number;
		unmatched_count: number;
		ignored_count: number;
	};

	type LineRow = {
		id: number;
		line_no: number;
		post_date: string;
		remarks?: string | null;
		additional_desc?: string | null;
		signed_amount: number;
		match_status: 'unmatched' | 'suggested' | 'matched' | 'ignored';
		suggested_txn_id?: number | null;
		suggestion_score: number;
		matched_txn_id?: number | null;
		match_confidence: number;
		matched_service_label?: string | null;
		matched_txn_date?: string | null;
		suggested_service_label?: string | null;
		suggested_txn_date?: string | null;
	};

	type CandidateRow = {
		id: number;
		type: 'income' | 'expense';
		amount: number;
		txn_date: string;
		reference_no?: string | null;
		service_label?: string | null;
		status: string;
		amount_diff: number;
	};

	type CategoryOption = {
		id: number;
		name: string;
		kind: 'income' | 'expense';
	};

	let loadingImports = $state(true);
	let loadingLines = $state(false);
	let imports = $state<ImportRow[]>([]);
	let selectedImportId = $state<number | null>(null);
	let importDetail = $state<ImportRow | null>(null);
	let lines = $state<LineRow[]>([]);
	let filterStatus = $state<'all' | 'unmatched' | 'suggested' | 'matched' | 'ignored'>('all');
	let uploading = $state(false);
	let selectedFile = $state<File | null>(null);
	let expandedLineId = $state<number | null>(null);
	let candidates = $state<Record<number, CandidateRow[]>>({});
	let loadingCandidatesFor = $state<number | null>(null);
	let candidateQuery = $state<Record<number, string>>({});
	let closing = $state(false);
	let incomeCategories = $state<CategoryOption[]>([]);
	let expenseCategories = $state<CategoryOption[]>([]);
	let showCreateModal = $state(false);
	let createSaving = $state(false);
	let createTargetLine = $state<LineRow | null>(null);
	let createForm = $state({
		sub_type: 'other_income' as 'tithe' | 'offering' | 'other_income' | 'expense',
		category_id: '',
		service_label: '',
		payment_method: 'transfer'
	});

	function dateLabel(value?: string | null): string {
		if (!value) return '-';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function dateTimeLabel(value?: string | null): string {
		if (!value) return '-';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function statusClass(status: string): string {
		if (status === 'matched') return 'bg-emerald-500/20 border border-emerald-500/35 text-emerald-100';
		if (status === 'suggested') return 'bg-amber-500/20 border border-amber-500/35 text-amber-100';
		if (status === 'ignored') return 'bg-white/10 border border-white/20 text-white/60';
		return 'bg-rose-500/20 border border-rose-500/35 text-rose-100';
	}

	function sourceAccountLabel(item: ImportRow): string {
		if (item.linked_account_name) {
			const rawNo = item.linked_account_number || item.account_no;
			return `${item.linked_account_name} (${rawNo})`;
		}
		return item.account_no;
	}

	function normalizeText(value?: string | null): string {
		return String(value || '').toLowerCase();
	}

	function guessIncomeSubType(line: LineRow): 'tithe' | 'offering' | 'other_income' {
		const raw = normalizeText(`${line.remarks || ''} ${line.additional_desc || ''}`);
		if (raw.includes('persepuluhan') || raw.includes('perpuluhan')) return 'tithe';
		if (raw.includes('persembahan')) return 'offering';
		return 'other_income';
	}

	function categoryIdByName(options: CategoryOption[], name: string): string {
		const target = name.toLowerCase();
		const found = options.find((item) => item.name.toLowerCase() === target);
		return found?.id ? String(found.id) : '';
	}

	function defaultIncomeCategoryId(
		subType: 'tithe' | 'offering' | 'other_income' | 'expense'
	): string {
		if (subType === 'tithe') {
			return categoryIdByName(incomeCategories, 'Persepuluhan') || String(incomeCategories[0]?.id || '');
		}
		if (subType === 'offering') {
			return categoryIdByName(incomeCategories, 'Persembahan') || String(incomeCategories[0]?.id || '');
		}
		return categoryIdByName(incomeCategories, 'Donasi') || String(incomeCategories[0]?.id || '');
	}

	function defaultExpenseCategoryId(): string {
		return categoryIdByName(expenseCategories, 'Operasional Gereja') || String(expenseCategories[0]?.id || '');
	}

	function activeCreateCategories(): CategoryOption[] {
		if (!createTargetLine) return [];
		return createTargetLine.signed_amount >= 0 ? incomeCategories : expenseCategories;
	}

	async function loadCategoryLookups() {
		try {
			const [incomeRes, expenseRes] = await Promise.all([
				fetch('/api/finance/categories?kind=income'),
				fetch('/api/finance/categories?kind=expense')
			]);
			const incomePayload = await incomeRes.json();
			const expensePayload = await expenseRes.json();
			if (!incomeRes.ok || !expenseRes.ok) {
				throw new Error('Gagal memuat kategori');
			}
			incomeCategories = Array.isArray(incomePayload) ? (incomePayload as CategoryOption[]) : [];
			expenseCategories = Array.isArray(expensePayload) ? (expensePayload as CategoryOption[]) : [];
		} catch (err) {
			console.error('Failed to load categories for reconciliation create flow:', err);
			addToast('Gagal memuat kategori transaksi', 'error');
		}
	}

	async function loadImports() {
		loadingImports = true;
		try {
			const res = await fetch('/api/finance/reconciliation/imports');
			const payload = await res.json();
			imports = Array.isArray(payload) ? payload : [];
			if (!selectedImportId && imports.length > 0) {
				selectedImportId = imports[0].id;
			}
		} catch (err) {
			console.error('Failed to load reconciliation imports:', err);
			addToast('Gagal memuat import reconciliation', 'error');
		} finally {
			loadingImports = false;
		}
	}

	async function loadLines() {
		if (!selectedImportId) return;
		loadingLines = true;
		try {
			const params = new URLSearchParams();
			if (filterStatus !== 'all') params.set('status', filterStatus);
			const res = await fetch(`/api/finance/reconciliation/imports/${selectedImportId}?${params.toString()}`);
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Failed to load lines');
			importDetail = payload.import as ImportRow;
			lines = Array.isArray(payload.lines) ? payload.lines as LineRow[] : [];
		} catch (err) {
			console.error('Failed to load reconciliation lines:', err);
			addToast(err instanceof Error ? err.message : 'Gagal memuat line reconciliation', 'error');
		} finally {
			loadingLines = false;
		}
	}

	async function importCsv() {
		if (!selectedFile) {
			addToast('Pilih file CSV dulu', 'warning');
			return;
		}
		uploading = true;
		try {
			const fd = new FormData();
			fd.set('file', selectedFile);
			const res = await fetch('/api/finance/reconciliation/imports', {
				method: 'POST',
				body: fd
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Import gagal');
			addToast(payload?.reused ? 'File sudah pernah diimport, data lama dibuka' : 'CSV berhasil diimport', 'success');
			selectedFile = null;
			await loadImports();
			if (payload?.import?.id) selectedImportId = Number(payload.import.id);
			await loadLines();
		} catch (err) {
			console.error('Import failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal import CSV', 'error');
		} finally {
			uploading = false;
		}
	}

	async function refreshSuggestions(auto = false) {
		if (!selectedImportId) return;
		try {
			const res = await fetch(`/api/finance/reconciliation/imports/${selectedImportId}/suggest`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ auto_match: auto })
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Gagal update suggestion');
			addToast(auto ? 'Auto match high-confidence selesai' : 'Suggestion diperbarui', 'success');
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Failed to refresh suggestions:', err);
			addToast(err instanceof Error ? err.message : 'Gagal update suggestion', 'error');
		}
	}

	async function actionMatch(lineId: number, txnId: number) {
		try {
			const res = await fetch(`/api/finance/reconciliation/lines/${lineId}/match`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ txn_id: txnId })
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Match gagal');
			addToast('Line berhasil di-match', 'success');
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Match failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal match line', 'error');
		}
	}

	async function actionIgnore(lineId: number) {
		try {
			const res = await fetch(`/api/finance/reconciliation/lines/${lineId}/ignore`, { method: 'POST' });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Ignore gagal');
			addToast('Line di-ignore', 'success');
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Ignore failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal ignore line', 'error');
		}
	}

	async function actionUnmatch(lineId: number) {
		try {
			const res = await fetch(`/api/finance/reconciliation/lines/${lineId}/unmatch`, { method: 'POST' });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Unmatch gagal');
			addToast('Match dibatalkan', 'success');
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Unmatch failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal unmatch line', 'error');
		}
	}

	async function openCreateTransactionDialog(line: LineRow) {
		if (incomeCategories.length === 0 || expenseCategories.length === 0) {
			await loadCategoryLookups();
		}
		if (line.signed_amount >= 0 && incomeCategories.length === 0) {
			addToast('Kategori income belum tersedia. Tambahkan kategori dulu.', 'error');
			return;
		}
		if (line.signed_amount < 0 && expenseCategories.length === 0) {
			addToast('Kategori expense belum tersedia. Tambahkan kategori dulu.', 'error');
			return;
		}
		createTargetLine = line;
		if (line.signed_amount >= 0) {
			const guessedType = guessIncomeSubType(line);
			createForm.sub_type = guessedType;
			createForm.category_id = defaultIncomeCategoryId(guessedType);
		} else {
			createForm.sub_type = 'expense';
			createForm.category_id = defaultExpenseCategoryId();
		}
		createForm.service_label = String(line.remarks || line.additional_desc || '').trim().slice(0, 120);
		createForm.payment_method = 'transfer';
		showCreateModal = true;
	}

	function closeCreateTransactionDialog() {
		showCreateModal = false;
		createTargetLine = null;
		createSaving = false;
	}

	function onCreateSubTypeChange() {
		if (!createTargetLine || createTargetLine.signed_amount < 0) return;
		createForm.category_id = defaultIncomeCategoryId(createForm.sub_type);
	}

	async function confirmCreateTransaction() {
		if (!createTargetLine) return;
		if (!createForm.category_id) {
			addToast('Kategori wajib dipilih sebelum membuat transaksi', 'warning');
			return;
		}
		if (
			createTargetLine.signed_amount >= 0 &&
			!['tithe', 'offering', 'other_income'].includes(createForm.sub_type)
		) {
			addToast('Jenis income wajib dipilih', 'warning');
			return;
		}

		createSaving = true;
		try {
			const res = await fetch(
				`/api/finance/reconciliation/lines/${createTargetLine.id}/create-transaction`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						sub_type:
							createTargetLine.signed_amount >= 0 ? createForm.sub_type : 'expense',
						category_id: Number(createForm.category_id),
						service_label: createForm.service_label,
						payment_method: createForm.payment_method
					})
				}
			);
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Create transaction gagal');
			addToast(`Transaksi #${payload.id} dibuat & di-match`, 'success');
			closeCreateTransactionDialog();
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Create transaction failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal create transaction', 'error');
		} finally {
			createSaving = false;
		}
	}

	async function loadCandidates(lineId: number) {
		loadingCandidatesFor = lineId;
		try {
			const q = candidateQuery[lineId]?.trim();
			const res = await fetch(`/api/finance/reconciliation/lines/${lineId}/candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`);
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Failed to load candidates');
			candidates = { ...candidates, [lineId]: Array.isArray(payload) ? payload as CandidateRow[] : [] };
		} catch (err) {
			console.error('Load candidates failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal memuat kandidat', 'error');
		} finally {
			loadingCandidatesFor = null;
		}
	}

	async function toggleExpand(lineId: number) {
		if (expandedLineId === lineId) {
			expandedLineId = null;
			return;
		}
		expandedLineId = lineId;
		if (!candidates[lineId]) {
			await loadCandidates(lineId);
		}
	}

	async function closePeriod() {
		if (!selectedImportId) return;
		closing = true;
		try {
			const res = await fetch(`/api/finance/reconciliation/imports/${selectedImportId}/close`, { method: 'POST' });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Close gagal');
			addToast('Periode reconciliation ditutup', 'success');
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Close failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal close period', 'error');
		} finally {
			closing = false;
		}
	}

	async function reopenPeriod() {
		if (!selectedImportId) return;
		try {
			const res = await fetch(`/api/finance/reconciliation/imports/${selectedImportId}/reopen`, { method: 'POST' });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Reopen gagal');
			addToast('Periode dibuka lagi', 'success');
			await loadImports();
			await loadLines();
		} catch (err) {
			console.error('Reopen failed:', err);
			addToast(err instanceof Error ? err.message : 'Gagal reopen period', 'error');
		}
	}

	function downloadReport() {
		if (!selectedImportId) return;
		window.open(`/api/finance/reconciliation/imports/${selectedImportId}/report`, '_blank');
	}

	$effect(() => {
		loadImports();
		loadCategoryLookups();
	});

	$effect(() => {
		if (selectedImportId) loadLines();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Finance', href: '/finance', icon: Landmark },
		{ label: 'Reconciliation' }
	]} />

	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-4 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font flex items-center gap-2">
				<ShieldCheck class="w-5 h-5 text-sky-300" />
				Bank Reconciliation
			</h1>
			<p class="text-white/60 text-sm mt-1">Import statement, review suggestions, match, lalu close period.</p>
		</div>
		<a href="/finance/expenses" class="glass-button rounded-full px-4 py-2 text-white/80 text-sm">
			Kembali ke Expense Ledger
		</a>
	</div>

	<div class="glass-card rounded-2xl p-4 mb-4 fade-up">
		<div class="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
			<input
				type="file"
				accept=".csv,text/csv"
				onchange={(e) => {
					const f = (e.currentTarget as HTMLInputElement).files?.[0];
					selectedFile = f || null;
				}}
				class="text-white/80 text-sm file:mr-3 file:rounded-lg file:border file:border-white/20 file:bg-white/10 file:text-white/80 file:px-3 file:py-1.5"
			/>
			<button
				type="button"
				onclick={importCsv}
				disabled={!selectedFile || uploading}
				class="glass-button rounded-xl px-3 py-2 text-white text-sm inline-flex items-center gap-1.5
					{!selectedFile || uploading ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-500/20 hover:bg-emerald-500/35'}"
			>
				<Upload class="w-4 h-4" />
				{uploading ? 'Mengimpor...' : 'Import Statement CSV'}
			</button>
		</div>
	</div>

	{#if loadingImports}
		<Skeleton class="h-28 rounded-2xl mb-4" />
	{:else if imports.length === 0}
		<EmptyState
			icon={ShieldCheck}
			title="Belum ada statement import"
			description="Upload CSV mutasi bank untuk mulai reconciliation."
		/>
	{:else}
		<div class="grid grid-cols-1 xl:grid-cols-4 gap-4">
			<div class="xl:col-span-1 space-y-2">
				{#each imports as item}
					<button
						type="button"
						onclick={() => { selectedImportId = item.id; }}
						class="w-full text-left glass-card rounded-xl p-3 transition-all border
							{selectedImportId === item.id ? 'border-sky-400/50 bg-sky-500/10' : 'border-white/10 hover:border-white/25'}"
					>
						<div class="flex items-center justify-between gap-2">
							<p class="text-white font-medium text-sm truncate">{sourceAccountLabel(item)}</p>
							<span class="text-[10px] px-2 py-0.5 rounded-full {item.status === 'closed' ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/35' : item.status === 'in_review' ? 'bg-amber-500/20 text-amber-100 border border-amber-500/35' : 'bg-white/10 text-white/70 border border-white/20'}">
								{item.status}
							</span>
						</div>
						{#if !item.linked_account_id}
							<p class="text-amber-200/80 text-[11px] mt-1">Akun sumber dana belum dipetakan</p>
						{/if}
						<p class="text-white/55 text-xs mt-1">{dateLabel(item.period_from)} → {dateLabel(item.period_to)}</p>
						<p class="text-white/45 text-[11px] mt-1 truncate">{item.file_name}</p>
						<p class="text-white/55 text-xs mt-2">Matched {item.matched_count}/{item.line_count}</p>
					</button>
				{/each}
			</div>

			<div class="xl:col-span-3">
				{#if loadingLines}
					<Skeleton class="h-[420px] rounded-2xl" />
				{:else if importDetail}
					<div class="glass-card rounded-2xl p-4 mb-3">
						<div class="flex flex-wrap items-center gap-2 justify-between">
							<div class="flex items-center gap-2 flex-wrap text-xs">
								<span class="text-white/60">Account:</span>
								<span class="text-white font-medium">{sourceAccountLabel(importDetail)}</span>
								{#if !importDetail.linked_account_id}
									<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-100 border border-amber-500/30">Belum dipetakan</span>
								{/if}
								<span class="text-white/30">•</span>
								<span class="text-white/60">Opening:</span>
								<span class="text-white">{formatRupiah(importDetail.opening_balance || 0)}</span>
								<span class="text-white/30">•</span>
								<span class="text-white/60">Closing:</span>
								<span class="text-white">{formatRupiah(importDetail.closing_balance || 0)}</span>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<button type="button" onclick={() => refreshSuggestions(false)} class="glass-button rounded-lg px-2.5 py-1.5 text-xs text-white inline-flex items-center gap-1"><RefreshCcw class="w-3.5 h-3.5" />Suggest</button>
								<button type="button" onclick={() => refreshSuggestions(true)} class="glass-button rounded-lg px-2.5 py-1.5 text-xs text-white inline-flex items-center gap-1"><WandSparkles class="w-3.5 h-3.5" />Auto Match</button>
								<button type="button" onclick={downloadReport} class="glass-button rounded-lg px-2.5 py-1.5 text-xs text-white inline-flex items-center gap-1"><FileDown class="w-3.5 h-3.5" />Report</button>
								{#if importDetail.status === 'closed'}
									<button type="button" onclick={reopenPeriod} class="glass-button rounded-lg px-2.5 py-1.5 text-xs text-white inline-flex items-center gap-1"><Unlock class="w-3.5 h-3.5" />Reopen</button>
								{:else}
									<button type="button" onclick={closePeriod} disabled={closing} class="glass-button rounded-lg px-2.5 py-1.5 text-xs text-white inline-flex items-center gap-1 {closing ? 'opacity-50 cursor-not-allowed' : ''}"><Lock class="w-3.5 h-3.5" />Close Period</button>
								{/if}
							</div>
						</div>
						<div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
							<div class="glass rounded-lg px-3 py-2 text-white/75">Matched: <span class="text-emerald-100 font-semibold">{importDetail.matched_count}</span></div>
							<div class="glass rounded-lg px-3 py-2 text-white/75">Suggested: <span class="text-amber-100 font-semibold">{importDetail.suggested_count}</span></div>
							<div class="glass rounded-lg px-3 py-2 text-white/75">Unmatched: <span class="text-rose-100 font-semibold">{importDetail.unmatched_count}</span></div>
							<div class="glass rounded-lg px-3 py-2 text-white/75">Ignored: <span class="text-white font-semibold">{importDetail.ignored_count}</span></div>
						</div>
					</div>

					<div class="glass-card rounded-2xl p-3 mb-3">
						<div class="flex items-center gap-2">
							<button type="button" onclick={() => { filterStatus = 'all'; }} class="nav-pill {filterStatus === 'all' ? 'nav-pill-active' : ''}">Semua</button>
							<button type="button" onclick={() => { filterStatus = 'unmatched'; }} class="nav-pill {filterStatus === 'unmatched' ? 'nav-pill-active' : ''}">Unmatched</button>
							<button type="button" onclick={() => { filterStatus = 'suggested'; }} class="nav-pill {filterStatus === 'suggested' ? 'nav-pill-active' : ''}">Suggested</button>
							<button type="button" onclick={() => { filterStatus = 'matched'; }} class="nav-pill {filterStatus === 'matched' ? 'nav-pill-active' : ''}">Matched</button>
							<button type="button" onclick={() => { filterStatus = 'ignored'; }} class="nav-pill {filterStatus === 'ignored' ? 'nav-pill-active' : ''}">Ignored</button>
						</div>
					</div>

					<div class="glass-card rounded-2xl overflow-hidden">
						<div class="overflow-x-auto glass-scrollbar">
							<table class="w-full">
								<thead>
									<tr class="border-b border-white/10 table-head-row">
										<th class="text-left px-3 py-3 table-head-cell">Tanggal</th>
										<th class="text-left px-3 py-3 table-head-cell">Deskripsi</th>
										<th class="text-right px-3 py-3 table-head-cell">Amount</th>
										<th class="text-center px-3 py-3 table-head-cell">Status</th>
										<th class="text-left px-3 py-3 table-head-cell">Linked Txn</th>
										<th class="text-center px-3 py-3 table-head-cell">Aksi</th>
									</tr>
								</thead>
								<tbody>
									{#each lines as line}
										<tr class="glass-table-row">
											<td class="px-3 py-2.5 text-white/75 text-xs">{dateTimeLabel(line.post_date)}</td>
											<td class="px-3 py-2.5 text-white/80 text-xs max-w-[440px] align-middle">
												<div class="whitespace-normal break-all leading-snug">{line.remarks || line.additional_desc || '-'}</div>
											</td>
											<td class="px-3 py-2.5 text-right text-xs font-mono {line.signed_amount >= 0 ? 'text-emerald-200' : 'text-rose-200'}">
												{line.signed_amount >= 0 ? '+' : '-'}{formatRupiah(Math.abs(line.signed_amount))}
											</td>
											<td class="px-3 py-2.5 text-center">
												<span class="text-[11px] px-2 py-0.5 rounded-full {statusClass(line.match_status)}">{line.match_status}</span>
											</td>
											<td class="px-3 py-2.5 text-xs text-white/65">
												{#if line.matched_txn_id}
													<div>#{line.matched_txn_id} · {dateLabel(line.matched_txn_date)}</div>
													<div class="truncate max-w-[200px]">{line.matched_service_label || '-'}</div>
												{:else if line.suggested_txn_id}
													<div class="text-amber-100">Suggest #{line.suggested_txn_id} ({line.suggestion_score})</div>
													<div class="truncate max-w-[200px]">{line.suggested_service_label || '-'}</div>
												{:else}
													-
												{/if}
											</td>
												<td class="px-3 py-2.5">
													<div class="flex items-center justify-center gap-1 flex-wrap">
														{#if line.match_status === 'suggested' && line.suggested_txn_id}
															<button type="button" onclick={() => actionMatch(line.id, line.suggested_txn_id!)} class="glass-button rounded-lg px-2 py-1 text-[11px] text-emerald-100 inline-flex items-center gap-1"><Link class="w-3 h-3" />Match</button>
														{/if}
														{#if line.match_status !== 'matched'}
															<button type="button" onclick={() => openCreateTransactionDialog(line)} class="glass-button rounded-lg px-2 py-1 text-[11px] text-sky-100">Create Txn</button>
															<button type="button" onclick={() => actionIgnore(line.id)} class="glass-button rounded-lg px-2 py-1 text-[11px] text-white/80 inline-flex items-center gap-1"><CircleOff class="w-3 h-3" />Ignore</button>
														{:else}
															<button type="button" onclick={() => actionUnmatch(line.id)} class="glass-button rounded-lg px-2 py-1 text-[11px] text-amber-100 inline-flex items-center gap-1"><CircleCheck class="w-3 h-3" />Unmatch</button>
														{/if}
														<button type="button" onclick={() => toggleExpand(line.id)} class="glass-button rounded-lg px-2 py-1 text-[11px] text-white/80 inline-flex items-center gap-1"><Search class="w-3 h-3" />Candidates</button>
													</div>
											</td>
										</tr>
										{#if expandedLineId === line.id}
											<tr class="bg-white/[0.02] border-b border-white/10">
												<td class="px-3 py-2.5" colspan="6">
													<div class="flex items-center gap-2 mb-2">
														<input
															type="text"
															class="glass-input rounded-lg px-2 py-1 text-xs text-white w-[260px]"
															placeholder="Cari kandidat by notes/ref..."
															value={candidateQuery[line.id] || ''}
															oninput={(e) => { candidateQuery[line.id] = (e.target as HTMLInputElement).value; }}
														/>
														<button type="button" onclick={() => loadCandidates(line.id)} class="glass-button rounded-lg px-2 py-1 text-xs text-white/80">Refresh</button>
													</div>
													{#if loadingCandidatesFor === line.id}
														<div class="text-white/60 text-xs">Loading candidates...</div>
													{:else if !candidates[line.id] || candidates[line.id].length === 0}
														<div class="text-white/50 text-xs">Tidak ada kandidat.</div>
													{:else}
														<div class="space-y-1">
															{#each candidates[line.id] as cand}
																<div class="flex items-center justify-between gap-2 glass rounded-lg px-2 py-1.5">
																	<div class="text-xs text-white/75">
																		<span class="text-white">#{cand.id}</span> · {dateLabel(cand.txn_date)} · {formatRupiah(cand.amount)} · Δ {formatRupiah(cand.amount_diff)}
																		<div class="text-white/45 truncate max-w-[600px]">{cand.service_label || cand.reference_no || '-'}</div>
																	</div>
																	<button type="button" onclick={() => actionMatch(line.id, cand.id)} class="glass-button rounded-lg px-2 py-1 text-[11px] text-emerald-100">Match #{cand.id}</button>
																</div>
															{/each}
														</div>
													{/if}
												</td>
											</tr>
										{/if}
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if showCreateModal && createTargetLine}
		<div class="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm p-4 flex items-center justify-center">
			<div class="glass-card rounded-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto glass-scrollbar">
				<div class="flex items-start justify-between gap-3 mb-4">
					<div>
						<h3 class="text-white font-semibold brand-font">Konfirmasi Create Transaction</h3>
						<p class="text-white/55 text-xs mt-1">Pilih jenis dan kategori sebelum transaksi dibuat dari mutasi bank.</p>
					</div>
					<button type="button" onclick={closeCreateTransactionDialog} class="glass-button rounded-lg p-1.5 text-white/70 hover:text-white">
						<X class="w-4 h-4" />
					</button>
				</div>

				<div class="glass rounded-xl p-3 mb-4 text-xs text-white/70 space-y-1">
					<div>Tanggal: <span class="text-white">{dateTimeLabel(createTargetLine.post_date)}</span></div>
					<div>Amount: <span class="{createTargetLine.signed_amount >= 0 ? 'text-emerald-200' : 'text-rose-200'}">{createTargetLine.signed_amount >= 0 ? '+' : '-'}{formatRupiah(Math.abs(createTargetLine.signed_amount))}</span></div>
					<div class="break-all">Deskripsi: <span class="text-white/85">{createTargetLine.remarks || createTargetLine.additional_desc || '-'}</span></div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Jenis</label>
						{#if createTargetLine.signed_amount >= 0}
							<select bind:value={createForm.sub_type} onchange={onCreateSubTypeChange} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
								<option value="tithe">Persepuluhan</option>
								<option value="offering">Persembahan</option>
								<option value="other_income">Lainnya</option>
							</select>
						{:else}
							<div class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">Expense</div>
						{/if}
					</div>
					<div>
						<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Kategori</label>
						<select bind:value={createForm.category_id} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm">
							<option value="">Pilih kategori...</option>
							{#each activeCreateCategories() as category}
								<option value={String(category.id)}>{category.name}</option>
							{/each}
						</select>
					</div>
					<div class="md:col-span-2">
						<label class="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Tujuan Dana / Service Label</label>
						<input type="text" bind:value={createForm.service_label} class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" placeholder="opsional" />
					</div>
				</div>

				<div class="mt-4 flex justify-end gap-2">
					<button type="button" onclick={closeCreateTransactionDialog} class="glass-button rounded-xl px-4 py-2 text-white/80 text-sm">Batal</button>
					<button type="button" disabled={createSaving} onclick={confirmCreateTransaction} class="glass-button rounded-xl px-4 py-2 text-white text-sm bg-sky-500/25 hover:bg-sky-500/40 disabled:opacity-70">
						{createSaving ? 'Membuat...' : 'Create & Match'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
