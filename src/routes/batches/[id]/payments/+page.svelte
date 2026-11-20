<script lang="ts">
	// Payments: the batch as the bank transfers that pay it. One line per transfer
	// to type into the bank portal (Kopra), with what to copy, and where it stands:
	// not entered → entered, awaiting approval → transferred.
	import { page } from '$app/stores';
	import type { Batch, BatchItem } from '$lib/types.js';
	import { formatRupiah, generateCashPayoutWhatsAppUrl } from '$lib/format.js';
	import { isPdfFile } from '$lib/pdf-to-image.js';
	import { prepareProofImage } from '$lib/proof-image.js';
	import {
		buildPaymentLines,
		sumPaymentLines,
		type CashDistributor,
		type PaymentLine,
		type PaymentStatus
	} from '$lib/payments.js';
	import { DEFAULT_SOURCE_BANK, type SourceBank } from '$lib/transfer-fee.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StatCardSkeleton from '$lib/components/skeletons/StatCardSkeleton.svelte';
	import TableSkeleton from '$lib/components/skeletons/TableSkeleton.svelte';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Layers from '@lucide/svelte/icons/layers';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Camera from '@lucide/svelte/icons/camera';
	import Check from '@lucide/svelte/icons/check';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import X from '@lucide/svelte/icons/x';
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import Pencil from '@lucide/svelte/icons/pencil';
	import SearchX from '@lucide/svelte/icons/search-x';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	type Filter = 'all' | PaymentStatus;
	type PdfScope = 'awaiting' | 'open' | 'all';

	let batchId = $derived(Number($page.params.id));
	let batch = $state<Batch | null>(null);
	let items = $state<BatchItem[]>([]);
	let cashDistributor = $state<CashDistributor | null>(null);
	let loading = $state(true);
	let sourceBank = $state<SourceBank>(DEFAULT_SOURCE_BANK);
	let filter = $state<Filter>('all');
	let pdfScope = $state<PdfScope>('open');
	// Lines being saved. Several can be in flight: ticking lines off one after another must not drop a click.
	let savingKeys = $state<string[]>([]);
	let editingDistributor = $state(false);
	let distributorForm = $state<CashDistributor>({ name: '', bank_name: '', account_number: '', whatsapp: '' });
	let savingDistributor = $state(false);
	// The cash payout's "sent" step: pick its receipt (or go on without one), like a row's transfer.
	let cashPicking = $state(false);
	let cashUploading = $state('');
	let cashUploadError = $state('');

	const STATUS_LABEL: Record<PaymentStatus, string> = {
		todo: 'Belum diinput',
		submitted: 'Menunggu approval',
		done: 'Sudah ditransfer'
	};

	let lines = $derived(batch ? buildPaymentLines(batch, items, { sourceBank, cashDistributor }) : []);
	let visibleLines = $derived(filter === 'all' ? lines : lines.filter((line) => line.status === filter));
	let totals = $derived({
		all: sumPaymentLines(lines),
		todo: sumPaymentLines(lines.filter((line) => line.status === 'todo')),
		submitted: sumPaymentLines(lines.filter((line) => line.status === 'submitted')),
		done: sumPaymentLines(lines.filter((line) => line.status === 'done'))
	});
	let pdfHref = $derived(`/api/batches/${batchId}/payments/pdf?scope=${pdfScope}&bank=${sourceBank}`);

	async function loadData() {
		try {
			const [batchRes, itemsRes, distributorRes] = await Promise.all([
				fetch(`/api/batches/${batchId}`),
				fetch(`/api/batches/${batchId}/items`),
				fetch('/api/settings/cash-distributor')
			]);
			const batchPayload = await batchRes.json();
			const itemsPayload = await itemsRes.json();
			const distributorPayload = await distributorRes.json();
			if (!batchRes.ok) throw new Error(batchPayload?.error || 'Gagal memuat batch');
			if (!itemsRes.ok) throw new Error(itemsPayload?.error || 'Gagal memuat daftar penerima');
			batch = batchPayload as Batch;
			items = Array.isArray(itemsPayload) ? (itemsPayload as BatchItem[]) : [];
			cashDistributor = distributorRes.ok ? (distributorPayload?.cash_distributor ?? null) : null;
		} catch (error) {
			console.error('Failed to load payments:', error);
			addToast(error instanceof Error ? error.message : 'Gagal memuat pembayaran', 'error');
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (batchId) loadData();
	});

	async function copyText(value: string, label: string) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			addToast(`Tersalin ${label}: ${value}`, 'success');
		} catch (error) {
			console.error('Failed to copy:', error);
			addToast('Gagal menyalin', 'error');
		}
	}

	async function postStatus(line: PaymentLine, body: Record<string, unknown>, message: string) {
		if (savingKeys.includes(line.key)) return;
		savingKeys = [...savingKeys, line.key];
		try {
			const res = await fetch(`/api/batches/${batchId}/payments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const payload = await res.json().catch(() => null);
				throw new Error(payload?.error || 'Gagal menyimpan status pembayaran');
			}
			await loadData();
			addToast(message, 'success');
		} catch (error) {
			console.error('Failed to save payment status:', error);
			addToast(error instanceof Error ? error.message : 'Gagal menyimpan status pembayaran', 'error');
		} finally {
			savingKeys = savingKeys.filter((key) => key !== line.key);
		}
	}

	function setSubmitted(line: PaymentLine, submitted: boolean) {
		const message = submitted ? 'Ditandai sudah diinput di Kopra' : 'Tanda sudah diinput dibatalkan';
		if (line.kind === 'cash') return postStatus(line, { cash: true, submitted }, message);
		return postStatus(line, { item_ids: line.itemIds, submitted }, message);
	}

	function setCashDone(line: PaymentLine, done: boolean) {
		return postStatus(
			line,
			{ cash: true, done },
			done ? 'Transfer tunai ditandai sudah ditransfer' : 'Tanda sudah ditransfer dibatalkan'
		);
	}

	async function uploadCashProof(event: Event, line: PaymentLine) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || savingKeys.includes(line.key)) return;
		const isPdf = isPdfFile(file);
		cashUploadError = '';
		cashUploading = isPdf ? 'Mengubah PDF...' : 'Mengompresi...';
		savingKeys = [...savingKeys, line.key];
		try {
			const blob = await prepareProofImage(file);
			cashUploading = `Mengunggah (${Math.round(blob.size / 1024)}KB)...`;
			const res = await fetch(`/api/batches/${batchId}/payments/cash-proof`, {
				method: 'POST',
				headers: { 'Content-Type': blob.type },
				body: blob
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) throw new Error(payload?.error || 'Gagal mengunggah bukti');
			if (payload?.batch) batch = payload.batch as Batch;
			cashPicking = false;
			addToast('Bukti transfer tunai disimpan. Kirim WA ke penyalur.', 'success');
		} catch (error) {
			console.error('Failed to upload cash payout proof:', error);
			cashUploadError = isPdf ? 'PDF tidak bisa dibaca' : 'Gagal mengunggah';
		} finally {
			cashUploading = '';
			savingKeys = savingKeys.filter((key) => key !== line.key);
		}
	}

	async function markCashDoneWithoutProof(line: PaymentLine) {
		cashPicking = false;
		await setCashDone(line, true);
	}

	let batchLabel = $derived((batch?.name || 'bulan ini').replace(/^transfer\s+/i, ''));

	function cashProofUrl(absolute: boolean): string {
		const path = `/api/batches/${batchId}/payments/cash-proof`;
		// The in-app link changes when the receipt is replaced, so the browser doesn't show a cached one.
		return absolute ? `${window.location.origin}${path}` : `${path}?v=${encodeURIComponent(batch?.updated_at || '')}`;
	}

	function sendCashWhatsApp(line: PaymentLine) {
		if (!cashDistributor?.whatsapp) return;
		const url = generateCashPayoutWhatsAppUrl(cashDistributor.whatsapp, {
			distributorName: cashDistributor.name,
			batchLabel,
			bankName: cashDistributor.bank_name,
			accountNumber: cashDistributor.account_number,
			amount: line.amount,
			groups: line.cashGroups ?? [],
			proofUrl: batch?.cash_payout_proof ? cashProofUrl(true) : undefined
		});
		window.open(url, '_blank');
		if (!batch?.cash_payout_notified_at) {
			void postStatus(line, { cash: true, notified: true }, 'WA ke penyalur ditandai terkirim');
		}
	}

	function startEditDistributor() {
		distributorForm = cashDistributor
			? { ...cashDistributor }
			: { name: '', bank_name: '', account_number: '', whatsapp: '' };
		editingDistributor = true;
	}

	async function saveDistributor(event: SubmitEvent) {
		event.preventDefault();
		if (savingDistributor) return;
		savingDistributor = true;
		try {
			const res = await fetch('/api/settings/cash-distributor', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(distributorForm)
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) throw new Error(payload?.error || 'Gagal menyimpan penyalur tunai');
			cashDistributor = payload.cash_distributor;
			editingDistributor = false;
			addToast('Penyalur tunai disimpan', 'success');
		} catch (error) {
			console.error('Failed to save cash distributor:', error);
			addToast(error instanceof Error ? error.message : 'Gagal menyimpan penyalur tunai', 'error');
		} finally {
			savingDistributor = false;
		}
	}

	function statusClass(status: PaymentStatus): string {
		if (status === 'done') return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';
		if (status === 'submitted') return 'border-amber-400/40 bg-amber-500/15 text-amber-100';
		return 'border-white/15 bg-white/5 text-white/60';
	}
</script>

{#snippet copyChip(label: string, value: string, shown: string, mono: boolean)}
	<button
		type="button"
		class="flex items-baseline gap-1.5 max-w-full text-left text-xs leading-5 px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/30 cursor-copy"
		title={`Klik untuk copy ${label}: ${value}`}
		onclick={() => copyText(value, label)}
	>
		<span class="text-[10px] uppercase tracking-wider text-white/40 shrink-0">{label}</span>
		<span class="truncate {mono ? 'font-mono' : ''}">{shown}</span>
	</button>
{/snippet}

{#snippet cashProofPicker(line: PaymentLine)}
	<div class="flex flex-col items-end gap-1.5">
		<div class="flex items-center gap-1.5">
			<label
				class="rounded-full px-3 py-1.5 text-sm text-emerald-50 border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/35 flex items-center gap-1.5 cursor-pointer"
			>
				<Camera class="w-3.5 h-3.5" /> Upload bukti
				<input
					type="file"
					accept="image/*,application/pdf,.pdf"
					class="hidden"
					onchange={(event) => uploadCashProof(event, line)}
				/>
			</label>
			<button
				type="button"
				onclick={() => { cashPicking = false; }}
				class="p-1.5 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5"
				aria-label="Batal"
			>
				<X class="w-3.5 h-3.5" />
			</button>
		</div>
		{#if cashUploadError}
			<span class="text-rose-300 text-xs">{cashUploadError}</span>
		{/if}
		{#if line.status !== 'done'}
			<button
				type="button"
				disabled={savingKeys.includes(line.key)}
				onclick={() => markCashDoneWithoutProof(line)}
				class="text-white/40 hover:text-white/70 text-xs"
			>
				Tandai selesai tanpa bukti →
			</button>
		{/if}
	</div>
{/snippet}

<div class="p-4 sm:p-6 max-w-5xl mx-auto">
	{#if loading}
		<div class="mb-6"><StatCardSkeleton /></div>
		<TableSkeleton rows={6} columns={4} />
	{:else if batch}
		<Breadcrumbs
			items={[
				{ label: 'Dashboard', href: '/', icon: LayoutDashboard },
				{ label: 'Batches', href: '/batches', icon: Layers },
				{ label: batch.name, href: `/batches/${batchId}` },
				{ label: 'Pembayaran' }
			]}
		/>

		<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5 fade-up">
			<div>
				<h1 class="text-2xl font-bold text-white glow-text brand-font">Pembayaran</h1>
				<p class="text-white/60 text-sm mt-1">
					{batch.name} · satu baris per transfer yang diinput di bank
				</p>
			</div>
			<div class="flex items-center gap-2 flex-wrap">
				<label class="flex items-center gap-2 text-white/50 text-xs">
					Dari
					<select
						bind:value={sourceBank}
						class="glass-input rounded-full px-3 py-2 text-white text-sm bg-white/10 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20"
					>
						<option value="mandiri">Mandiri</option>
						<option value="bca">BCA</option>
					</select>
				</label>
				<select
					bind:value={pdfScope}
					aria-label="Isi PDF"
					class="glass-input rounded-full px-3 py-2 text-white text-sm bg-white/10 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20"
				>
					<option value="open">PDF: belum ditransfer</option>
					<option value="awaiting">PDF: menunggu approval</option>
					<option value="all">PDF: semua</option>
				</select>
				<a
					href={pdfHref}
					target="_blank"
					rel="noopener"
					class="glass-button rounded-full px-3 py-2 text-white text-sm border border-sky-500/30 bg-sky-500/15 hover:bg-sky-500/30 flex items-center gap-1.5"
				>
					<FileText class="w-4 h-4" />
					Buka PDF
				</a>
			</div>
		</div>

		<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 fade-up">
			{#each [{ key: 'todo', label: 'Belum diinput', t: totals.todo }, { key: 'submitted', label: 'Menunggu approval', t: totals.submitted }, { key: 'done', label: 'Sudah ditransfer', t: totals.done }] as card}
				<button
					type="button"
					onclick={() => { filter = filter === card.key ? 'all' : (card.key as Filter); }}
					class="glass-card rounded-2xl p-4 text-left lift-on-hover {filter === card.key ? 'ring-2 ring-white/30' : ''}"
				>
					<p class="text-white/60 text-xs uppercase tracking-wider">{card.label}</p>
					<p class="text-xl font-bold text-white mt-1">{formatRupiah(card.t.amount)}</p>
					<p class="text-white/50 text-xs mt-1">{card.t.count} transfer</p>
				</button>
			{/each}
			<div class="glass-card rounded-2xl p-4">
				<p class="text-white/60 text-xs uppercase tracking-wider">Total</p>
				<p class="text-xl font-bold text-white mt-1">{formatRupiah(totals.all.amount)}</p>
				<p class="text-white/50 text-xs mt-1">
					{totals.all.count} transfer · biaya {formatRupiah(totals.all.fee)}
				</p>
			</div>
		</div>

		<div class="flex gap-1.5 flex-wrap mb-4 fade-up">
			{#each [{ key: 'all', label: 'Semua', count: totals.all.count }, { key: 'todo', label: 'Belum diinput', count: totals.todo.count }, { key: 'submitted', label: 'Menunggu approval', count: totals.submitted.count }, { key: 'done', label: 'Sudah ditransfer', count: totals.done.count }] as tab}
				<button
					type="button"
					onclick={() => { filter = tab.key as Filter; }}
					class="nav-pill {filter === tab.key ? 'nav-pill-active' : ''}"
				>
					{tab.label} ({tab.count})
				</button>
			{/each}
		</div>

		{#if lines.length === 0}
			<EmptyState icon={Banknote} title="Belum ada pembayaran" description="Batch ini belum punya penerima dengan nominal." />
		{:else if visibleLines.length === 0}
			<EmptyState icon={SearchX} title="Tidak ada pembayaran" description="Tidak ada pembayaran dengan status ini." />
		{:else}
			<div class="space-y-3 fade-up">
				{#each visibleLines as line, i (line.key)}
					{@const isCash = line.kind === 'cash'}
					{@const needsDistributor = isCash && !cashDistributor}
					<div
						class="glass-card rounded-2xl p-4 {isCash ? 'border border-amber-400/25' : ''} {line.status === 'done' ? 'opacity-70' : ''}"
					>
						<div class="flex flex-col lg:flex-row lg:items-start gap-3">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="text-white/40 text-sm">{i + 1}.</span>
									<span class="text-white font-semibold">
										{#if isCash}
											Tunai melalui {line.payeeName || 'penyalur tunai'}
										{:else}
											{line.members.map((member) => member.name).join(' + ')}
										{/if}
									</span>
									{#if line.viaName}
										<span class="text-amber-200/80 text-xs">
											via {line.viaName}{#if line.viaRelation}&nbsp;({line.viaRelation}){/if}
										</span>
									{/if}
									<span class="text-[11px] px-2 py-0.5 rounded-full border {statusClass(line.status)}">
										{STATUS_LABEL[line.status]}
									</span>
									{#if isCash && cashDistributor && !editingDistributor}
										<button
											type="button"
											onclick={startEditDistributor}
											class="text-white/40 hover:text-white/80 text-xs flex items-center gap-1"
										>
											<Pencil class="w-3 h-3" /> Ubah penyalur
										</button>
									{/if}
								</div>

								{#if isCash && (needsDistributor || editingDistributor)}
									<form class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" onsubmit={saveDistributor}>
										<p class="sm:col-span-2 lg:col-span-4 text-amber-100/80 text-xs">
											Uang tunai dikirim dalam satu transfer ke penyalur, lalu dibagikan ke penerima di bawah.
											Isi rekening penyalur dan nomor WA untuk mengirim bukti transfer; disimpan di database, tidak di kode.
										</p>
										<input
											bind:value={distributorForm.name}
											required
											placeholder="Nama pemilik rekening"
											class="glass-input rounded-lg px-3 py-2 text-white text-sm"
										/>
										<input
											bind:value={distributorForm.bank_name}
											required
											placeholder="Bank (mis. BNI)"
											class="glass-input rounded-lg px-3 py-2 text-white text-sm"
										/>
										<input
											bind:value={distributorForm.account_number}
											required
											inputmode="numeric"
											placeholder="Nomor rekening"
											class="glass-input rounded-lg px-3 py-2 text-white text-sm font-mono"
										/>
										<input
											bind:value={distributorForm.whatsapp}
											type="tel"
											inputmode="tel"
											placeholder="No. WhatsApp (08...)"
											class="glass-input rounded-lg px-3 py-2 text-white text-sm font-mono"
										/>
										<div class="sm:col-span-2 lg:col-span-4 flex gap-2">
											<button
												type="submit"
												disabled={savingDistributor}
												class="glass-button rounded-full px-4 py-1.5 text-white text-sm bg-emerald-500/25 hover:bg-emerald-500/40"
											>
												{savingDistributor ? 'Menyimpan...' : 'Simpan penyalur'}
											</button>
											{#if editingDistributor}
												<button
													type="button"
													onclick={() => { editingDistributor = false; }}
													class="glass-button rounded-full px-4 py-1.5 text-white/70 text-sm border border-white/15"
												>
													Batal
												</button>
											{/if}
										</div>
									</form>
								{/if}

								{#if isCash}
									<!-- Cash is handed over per family: one entry per hand-over. -->
									<div class="mt-2 text-xs text-white/60 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
										{#each line.cashGroups ?? [] as group}
											<div>
												<div class="flex justify-between gap-3 text-white/80">
													<span class="truncate">
														{group.receiverName}
														{#if group.members.length > 1}
															<span class="text-white/40">· {group.members.length} orang</span>
														{/if}
													</span>
													<span class="font-mono shrink-0">{formatRupiah(group.amount)}</span>
												</div>
												{#if group.members.length > 1}
													{#each group.members as member}
														<div class="flex justify-between gap-3 pl-3 text-white/50">
															<span class="truncate">{member.name}</span>
															<span class="font-mono shrink-0">{formatRupiah(member.amount)}</span>
														</div>
													{/each}
												{/if}
											</div>
										{/each}
									</div>
								{:else if line.members.length > 1}
									<div class="mt-2 text-xs text-white/60 space-y-0.5">
										{#each line.members as member}
											<div class="flex justify-between gap-3">
												<span class="truncate">{member.name}</span>
												<span class="font-mono text-white/50 shrink-0">{formatRupiah(member.amount)}</span>
											</div>
										{/each}
									</div>
								{/if}

								{#if !needsDistributor}
									<div class="mt-3 flex flex-wrap gap-1.5">
										{#if line.payAccountNumber}
											{@render copyChip('Rekening', line.payAccountNumber, `${line.bankName} ${line.payAccountNumber}`, true)}
										{:else}
											<span class="text-xs leading-5 px-2 py-0.5 rounded-md border border-rose-400/30 bg-rose-500/10 text-rose-200">
												Rekening belum diisi
											</span>
										{/if}
										{@render copyChip('Jumlah', String(line.amount), String(line.amount), true)}
										{@render copyChip('Ref', line.reference, line.reference, true)}
										{@render copyChip('Remark', line.remark, line.remark, false)}
									</div>
								{/if}
							</div>

							<div class="flex lg:flex-col items-center lg:items-end justify-between gap-2 lg:min-w-[190px]">
								<div class="lg:text-right">
									<p class="text-white text-lg font-bold font-mono">{formatRupiah(line.amount)}</p>
									<p class="text-white/40 text-xs">
										{#if line.members.length > 1}{line.members.length} orang · {/if}biaya {formatRupiah(line.fee)}
									</p>
								</div>
								<div class="flex flex-col items-end gap-1.5">
									{#if line.status === 'todo'}
										<button
											type="button"
											disabled={savingKeys.includes(line.key) || needsDistributor}
											onclick={() => setSubmitted(line, true)}
											class="glass-button rounded-full px-3 py-1.5 text-sm text-amber-50 border border-amber-400/40 bg-amber-500/20 hover:bg-amber-500/35 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<Clock class="w-3.5 h-3.5" /> Sudah diinput
										</button>
									{:else if line.status === 'submitted'}
										{#if isCash && cashUploading}
											<span class="rounded-full px-3 py-1.5 text-sm text-white/60 border border-white/15 flex items-center gap-1.5">
												<Loader2 class="w-3.5 h-3.5 animate-spin" /> {cashUploading}
											</span>
										{:else if isCash && cashPicking}
											{@render cashProofPicker(line)}
										{:else if isCash}
											<button
												type="button"
												disabled={savingKeys.includes(line.key)}
												onclick={() => { cashPicking = true; cashUploadError = ''; }}
												class="glass-button rounded-full px-3 py-1.5 text-sm text-emerald-50 border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/35 flex items-center gap-1.5"
											>
												<Check class="w-3.5 h-3.5" /> Sudah ditransfer
											</button>
										{/if}
										<button
											type="button"
											disabled={savingKeys.includes(line.key)}
											onclick={() => setSubmitted(line, false)}
											class="text-white/40 hover:text-white/80 text-xs flex items-center gap-1"
										>
											<Undo2 class="w-3 h-3" /> Batalkan
										</button>
									{:else if isCash}
										{#if cashUploading}
											<span class="rounded-full px-3 py-1.5 text-sm text-white/60 border border-white/15 flex items-center gap-1.5">
												<Loader2 class="w-3.5 h-3.5 animate-spin" /> {cashUploading}
											</span>
										{:else if cashPicking}
											{@render cashProofPicker(line)}
										{:else}
											<div class="flex items-center gap-1.5">
												{#if batch.cash_payout_proof}
													<a
														href={cashProofUrl(false)}
														target="_blank"
														rel="noopener"
														class="rounded-full px-3 py-1.5 text-sm text-emerald-200 border border-emerald-400/30 bg-emerald-500/15 hover:bg-emerald-500/30 flex items-center gap-1.5"
														title="Lihat bukti transfer"
													>
														<ImageIcon class="w-3.5 h-3.5" /> Bukti
													</a>
												{:else}
													<button
														type="button"
														disabled={savingKeys.includes(line.key)}
														onclick={() => { cashPicking = true; cashUploadError = ''; }}
														class="rounded-full px-3 py-1.5 text-sm text-white/60 border border-white/15 hover:text-white hover:border-white/30 flex items-center gap-1.5"
														title="Ditandai tanpa bukti: klik untuk upload bukti"
													>
														<Camera class="w-3.5 h-3.5" /> Upload bukti
													</button>
												{/if}
												<button
													type="button"
													disabled={!cashDistributor?.whatsapp}
													onclick={() => sendCashWhatsApp(line)}
													class="rounded-full px-3 py-1.5 text-sm flex items-center gap-1.5 border disabled:opacity-50 disabled:cursor-not-allowed
														{batch.cash_payout_notified_at
															? 'bg-cyan-400/30 text-cyan-50 border-cyan-300/70 hover:bg-cyan-400/40'
															: 'bg-green-500/20 text-green-200 border-green-500/30 hover:bg-green-500/40'}"
													title={!cashDistributor?.whatsapp
														? 'Isi nomor WA penyalur dulu (Ubah penyalur)'
														: batch.cash_payout_notified_at
															? `Kirim ulang WA ke ${cashDistributor.name}`
															: `Kirim WA ke ${cashDistributor.name}`}
												>
													{#if batch.cash_payout_notified_at}<Check class="w-3.5 h-3.5" />{:else}<MessageCircle class="w-3.5 h-3.5" />{/if}
													WA
												</button>
											</div>
										{/if}
										<button
											type="button"
											disabled={savingKeys.includes(line.key)}
											onclick={() => setCashDone(line, false)}
											class="text-white/40 hover:text-white/80 text-xs flex items-center gap-1"
										>
											<Undo2 class="w-3 h-3" /> Batalkan
										</button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<p class="text-white/40 text-xs mt-4">
				Transfer bank ditandai <em>sudah ditransfer</em> di halaman batch (unggah bukti transfer).
			</p>
		{/if}
	{:else}
		<EmptyState icon={SearchX} title="Batch tidak ditemukan" description="Batch ini tidak ada atau sudah dihapus." />
	{/if}
</div>
