<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import RupiahInput from '$lib/components/RupiahInput.svelte';
	import Lock from '@lucide/svelte/icons/lock';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Send from '@lucide/svelte/icons/send';
	import Loader from '@lucide/svelte/icons/loader-circle';
	import MessageSquare from '@lucide/svelte/icons/message-square';

	let { data, form } = $props();

	type Line = NonNullable<typeof data.lines>[number] & {
		saveState: 'idle' | 'saving' | 'saved' | 'error';
		saveError: string;
		showNote: boolean;
	};

	let pinBusy = $state(false);
	let lines = $state<Line[]>([]);
	let submitNote = $state('');
	let submitting = $state(false);
	let submitError = $state('');
	let showSubmit = $state(false);
	const timers = new Map<number, ReturnType<typeof setTimeout>>();

	$effect(() => {
		if (data.unlocked) {
			lines = data.lines.map((l) => ({ ...l, saveState: 'idle', saveError: '', showNote: !!l.note }));
			submitNote = data.giver_note ?? '';
		}
	});

	const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
	const sumOf = (l: Line) => l.tithe + l.offering + l.special;
	const isBalanced = (l: Line) => l.not_mine || sumOf(l) === l.amount;
	const differsFromSuggestion = (l: Line) =>
		l.not_mine || l.tithe !== l.suggested.tithe || l.offering !== l.suggested.offering || l.special !== l.suggested.special;

	function dateLabel(value: string): string {
		return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
	}

	let totals = $derived(
		lines.reduce(
			(t, l) => (l.not_mine ? t : { tithe: t.tithe + l.tithe, offering: t.offering + l.offering, special: t.special + l.special }),
			{ tithe: 0, offering: 0, special: 0 }
		)
	);
	let unbalanced = $derived(lines.filter((l) => !isBalanced(l)).length);
	let changedCount = $derived(lines.filter(differsFromSuggestion).length);

	/** Saves a line shortly after the last edit, once its parts add up. */
	function queueSave(l: Line, delay = 600) {
		clearTimeout(timers.get(l.id));
		if (!isBalanced(l)) {
			l.saveState = 'idle';
			return;
		}
		timers.set(l.id, setTimeout(() => save(l), delay));
	}

	async function save(l: Line) {
		l.saveState = 'saving';
		const body = new FormData();
		body.set('line_id', String(l.id));
		body.set('tithe', String(l.tithe));
		body.set('offering', String(l.offering));
		body.set('special', String(l.special));
		body.set('not_mine', l.not_mine ? '1' : '0');
		body.set('note', l.note);
		try {
			const res = await fetch('?/save', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				l.saveState = 'saved';
				l.saveError = '';
			} else {
				l.saveState = 'error';
				l.saveError = result.type === 'failure' ? String(result.data?.error ?? 'Gagal menyimpan') : 'Gagal menyimpan';
			}
		} catch {
			l.saveState = 'error';
			l.saveError = 'Tidak ada koneksi. Perubahan akan dicoba lagi saat Anda mengubah angka.';
		}
	}

	function preset(l: Line, kind: 'tithe' | 'offering' | 'special') {
		l.not_mine = false;
		l.tithe = kind === 'tithe' ? l.amount : 0;
		l.offering = kind === 'offering' ? l.amount : 0;
		l.special = kind === 'special' ? l.amount : 0;
		queueSave(l, 0);
	}

	function resetToSuggestion(l: Line) {
		l.not_mine = false;
		l.tithe = l.suggested.tithe;
		l.offering = l.suggested.offering;
		l.special = l.suggested.special;
		queueSave(l, 0);
	}

	/** Puts whatever is left of the transfer into one field. */
	function fillRest(l: Line, kind: 'tithe' | 'offering' | 'special') {
		const others = sumOf(l) - l[kind];
		l[kind] = Math.max(0, l.amount - others);
		queueSave(l, 0);
	}

	const KINDS = [
		{ key: 'tithe', label: 'Perpuluhan', hint: '100% disetor ke Konferens' },
		{ key: 'offering', label: 'Persembahan', hint: 'Terpadu: 50% Konferens, 50% jemaat' },
		{ key: 'special', label: 'Persembahan Khusus', hint: '100% untuk jemaat EFATA' }
	] as const;
</script>

<svelte:head>
	<title>Konfirmasi Persembahan — GMAHK EFATA</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen px-4 py-6 sm:py-10 {data.unlocked && data.editable ? 'pb-40' : ''}">
	<div class="max-w-xl mx-auto">
		<div class="flex items-center gap-3 mb-6">
			<span class="w-10 h-10 rounded-2xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-emerald-200 text-sm font-semibold">EF</span>
			<div>
				<p class="text-white font-semibold leading-tight">GMAHK EFATA</p>
				<p class="text-white/50 text-xs">Konfirmasi persembahan</p>
			</div>
		</div>

		{#if !data.unlocked}
			<div class="glass-card rounded-3xl p-6 fade-up">
				<div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
					<Lock class="w-5 h-5 text-white/70" />
				</div>
				<h1 class="text-white text-xl font-semibold brand-font">Masukkan PIN</h1>
				<p class="text-white/60 text-sm mt-1">PIN 6 angka dikirim bersama link ini oleh bendahara.</p>
				<form method="POST" action="?/pin" class="mt-5" use:enhance={() => {
					pinBusy = true;
					return async ({ result, update, formElement }) => {
						pinBusy = false;
						if (result.type === 'success') return invalidateAll();
						await update();
						// A wrong PIN must not stay in the field, or a full 6-digit
						// field silently swallows the next attempt.
						formElement.reset();
						formElement.querySelector('input')?.focus();
					};
				}}>
					<input
						name="pin"
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						pattern="[0-9]*"
						required
						aria-label="PIN 6 angka"
						class="w-full glass-input rounded-2xl px-4 py-4 text-white text-3xl text-center font-mono tracking-[0.5em]"
						placeholder="••••••"
					/>
					{#if form && 'pinError' in form && form.pinError}
						<p class="text-rose-200 text-sm mt-3 flex items-start gap-1.5"><CircleAlert class="w-4 h-4 mt-0.5 shrink-0" />{form.pinError}</p>
					{/if}
					<button type="submit" disabled={pinBusy} class="mt-4 w-full rounded-2xl py-3.5 font-semibold bg-emerald-500/30 hover:bg-emerald-500/40 border border-emerald-400/30 text-emerald-50 disabled:opacity-50">
						{pinBusy ? 'Memeriksa…' : 'Buka'}
					</button>
				</form>
			</div>
		{:else}
			<div class="fade-up">
				<h1 class="text-white text-2xl font-semibold brand-font">Shalom, {data.giver_name}</h1>
				{#if data.editable}
					<p class="text-white/70 text-sm mt-2 leading-relaxed">
						Di bawah ini setiap transfer Anda ke rekening jemaat. Mohon periksa pembagiannya. Angka sudah kami isi
						berdasarkan kwitansi atau keterangan transfer — <strong class="text-white">ubah jika kurang tepat</strong>.
						Perubahan tersimpan otomatis. Setelah semuanya benar, tekan <strong class="text-white">Kirim konfirmasi</strong>.
					</p>
				{:else}
					<div class="glass-card rounded-2xl p-4 mt-3 border border-emerald-400/25">
						<p class="text-emerald-100 font-medium flex items-center gap-2"><Check class="w-4 h-4" /> Terima kasih, konfirmasi Anda sudah kami terima.</p>
						<p class="text-white/60 text-sm mt-1">Jika masih ada yang perlu diubah, hubungi bendahara.</p>
					</div>
				{/if}

				<div class="grid grid-cols-1 gap-2 mt-4">
					{#each KINDS as k (k.key)}
						<div class="glass rounded-xl px-3 py-2 flex items-center justify-between gap-3">
							<div>
								<p class="text-white text-sm font-medium">{k.label}</p>
								<p class="text-white/45 text-xs">{k.hint}</p>
							</div>
							<p class="text-white font-semibold tabular-nums">{rp(totals[k.key])}</p>
						</div>
					{/each}
				</div>
			</div>

			<div class="space-y-3 mt-6">
				{#each lines as l, i (l.id)}
					<div class="glass-card rounded-2xl p-4 fade-up {l.not_mine ? 'opacity-70' : ''} {isBalanced(l) ? '' : 'border border-amber-400/40'}">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="text-white/50 text-xs">{i + 1} dari {lines.length} · {dateLabel(l.txn_date)}</p>
								<p class="text-white text-xl font-semibold tabular-nums mt-0.5">{rp(l.amount)}</p>
							</div>
							<div class="text-right shrink-0 text-xs pt-1">
								{#if l.saveState === 'saving'}
									<span class="text-white/50 inline-flex items-center gap-1"><Loader class="w-3.5 h-3.5 animate-spin" /> Menyimpan</span>
								{:else if l.saveState === 'saved'}
									<span class="text-emerald-200 inline-flex items-center gap-1"><Check class="w-3.5 h-3.5" /> Tersimpan</span>
								{/if}
							</div>
						</div>

						{#if l.remark}
							<p class="text-white/45 text-xs mt-2 break-words">Keterangan transfer: <span class="text-white/65">{l.remark}</span></p>
						{/if}
						<p class="text-xs mt-1.5">
							<span class="px-2 py-0.5 rounded-full border {l.suggestion_source === 'Belum diketahui' ? 'bg-amber-500/10 text-amber-200 border-amber-400/25' : 'bg-sky-500/10 text-sky-200 border-sky-400/20'}">
								Saran: {l.suggestion_source}
							</span>
						</p>
						{#if l.suggestion_detail}
							<p class="text-white/50 text-xs mt-1.5">{l.suggestion_detail}</p>
						{/if}

						{#if data.editable}
							{#if !l.not_mine}
								<div class="flex flex-wrap gap-1.5 mt-3">
									<span class="text-white/40 text-xs self-center mr-1">Semua untuk:</span>
									{#each KINDS as k (k.key)}
										<button type="button" onclick={() => preset(l, k.key)}
											class="text-xs rounded-full px-3 py-1.5 border {l[k.key] === l.amount ? 'bg-emerald-500/25 border-emerald-400/40 text-emerald-50' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}">
											{k.label}
										</button>
									{/each}
								</div>

								<div class="space-y-2.5 mt-3">
									{#each KINDS as k (k.key)}
										<div>
											<div class="flex items-center justify-between">
												<label for="l{l.id}-{k.key}" class="text-white/75 text-sm">{k.label}</label>
												{#if !isBalanced(l) && l.amount - (sumOf(l) - l[k.key]) > 0}
													<button type="button" onclick={() => fillRest(l, k.key)} class="text-[11px] text-sky-200 hover:underline">isi sisanya di sini</button>
												{/if}
											</div>
											<RupiahInput id="l{l.id}-{k.key}" label={k.label} bind:value={l[k.key]} oninput={() => queueSave(l)} />
										</div>
									{/each}
								</div>

								{#if !isBalanced(l)}
									<p class="text-amber-200 text-sm mt-2.5 flex items-start gap-1.5">
										<CircleAlert class="w-4 h-4 mt-0.5 shrink-0" />
										{sumOf(l) < l.amount ? `Kurang ${rp(l.amount - sumOf(l))}` : `Lebih ${rp(sumOf(l) - l.amount)}`} dari jumlah transfer.
									</p>
								{/if}
							{/if}

							<div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-white/5">
								<label class="inline-flex items-center gap-2 text-sm text-white/70">
									<input type="checkbox" bind:checked={l.not_mine} onchange={() => queueSave(l, 0)} class="w-4 h-4 accent-rose-400" />
									Bukan transfer saya
								</label>
								{#if differsFromSuggestion(l)}
									<button type="button" onclick={() => resetToSuggestion(l)} class="text-sm text-white/60 hover:text-white inline-flex items-center gap-1">
										<Undo2 class="w-3.5 h-3.5" /> Kembalikan ke saran
									</button>
								{/if}
								{#if !l.showNote}
									<button type="button" onclick={() => (l.showNote = true)} class="text-sm text-white/60 hover:text-white inline-flex items-center gap-1">
										<MessageSquare class="w-3.5 h-3.5" /> Tambah catatan
									</button>
								{/if}
							</div>
							{#if l.showNote}
								<textarea
									bind:value={l.note}
									oninput={() => queueSave(l, 900)}
									rows="2"
									maxlength="500"
									placeholder="Contoh: sebagian atas nama ibu saya, atau untuk dana pembangunan"
									class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm mt-2"
								></textarea>
							{/if}
							{#if l.saveState === 'error'}
								<p class="text-rose-200 text-sm mt-2">{l.saveError}</p>
							{/if}
						{:else}
							<div class="grid grid-cols-3 gap-2 mt-3 text-center">
								{#each KINDS as k (k.key)}
									<div class="glass rounded-xl px-2 py-2">
										<p class="text-white/45 text-[11px]">{k.label}</p>
										<p class="text-white text-sm font-medium tabular-nums">{l.not_mine ? '—' : rp(l[k.key])}</p>
									</div>
								{/each}
							</div>
							{#if l.not_mine}<p class="text-rose-200 text-sm mt-2">Ditandai bukan transfer Anda.</p>{/if}
							{#if l.note}<p class="text-white/60 text-sm mt-2">Catatan: {l.note}</p>{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if data.unlocked && data.editable}
	<div class="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/90 backdrop-blur-md">
		<div class="max-w-xl mx-auto px-4 py-3">
			{#if showSubmit}
				<form method="POST" action="?/submit" use:enhance={() => {
					submitting = true;
					submitError = '';
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'success') {
							showSubmit = false;
							await invalidateAll();
						} else if (result.type === 'failure') {
							submitError = String(result.data?.error ?? 'Gagal mengirim');
						}
					};
				}}>
					<p class="text-white text-sm font-medium">Kirim konfirmasi?</p>
					<p class="text-white/55 text-xs mt-0.5">Setelah dikirim, angka tidak bisa diubah lagi dari halaman ini.</p>
					<textarea name="note" bind:value={submitNote} rows="2" maxlength="1000" placeholder="Catatan untuk bendahara (opsional)" class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm mt-2"></textarea>
					{#if submitError}<p class="text-rose-200 text-sm mt-1">{submitError}</p>{/if}
					<div class="grid grid-cols-2 gap-2 mt-2">
						<button type="button" onclick={() => (showSubmit = false)} class="rounded-xl py-3 text-sm glass-button text-white">Batal</button>
						<button type="submit" disabled={submitting} class="rounded-xl py-3 text-sm font-semibold bg-emerald-500/35 hover:bg-emerald-500/45 border border-emerald-400/40 text-emerald-50 disabled:opacity-50">
							{submitting ? 'Mengirim…' : 'Ya, kirim'}
						</button>
					</div>
				</form>
			{:else}
				<div class="flex items-center gap-3">
					<div class="flex-1 min-w-0">
						{#if unbalanced > 0}
							<p class="text-amber-200 text-sm">{unbalanced} transfer belum pas jumlahnya</p>
						{:else}
							<p class="text-white text-sm">{lines.length} transfer siap dikirim</p>
						{/if}
						<p class="text-white/45 text-xs">{changedCount > 0 ? `${changedCount} Anda ubah dari saran` : 'Semua sesuai saran'}</p>
					</div>
					<button
						type="button"
						disabled={unbalanced > 0}
						onclick={() => (showSubmit = true)}
						class="rounded-xl px-4 py-3 text-sm font-semibold inline-flex items-center gap-1.5 bg-emerald-500/35 hover:bg-emerald-500/45 border border-emerald-400/40 text-emerald-50 disabled:opacity-40"
					>
						<Send class="w-4 h-4" /> Kirim konfirmasi
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
