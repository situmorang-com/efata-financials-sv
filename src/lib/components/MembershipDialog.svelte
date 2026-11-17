<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { formatMemberDate, formatPeriod, nextDay, todayJakarta } from '$lib/membership.js';

	let {
		open = $bindable(false),
		mode,
		name,
		startDate = null,
		endDate = null,
		canPurge = false,
		onConfirm,
		onPurge
	}: {
		open?: boolean;
		mode: 'end' | 'rejoin';
		name: string;
		/** Start of the current period (mode "end") */
		startDate?: string | null;
		/** End of the last period (mode "rejoin") */
		endDate?: string | null;
		/** Show the "entered by mistake" permanent delete (mode "end") */
		canPurge?: boolean;
		onConfirm: (date: string) => void;
		onPurge?: () => void;
	} = $props();

	let date = $state('');
	let minDate = $derived(mode === 'end' ? startDate || '' : endDate ? nextDay(endDate) : '');

	$effect(() => {
		if (open) {
			const today = todayJakarta();
			date = minDate && today < minDate ? minDate : today;
		}
	});

	let invalid = $derived(!date || (minDate !== '' && date < minDate));
	const dateInputId = 'membership-date';
</script>

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
		<DialogPrimitive.Content
			class="fixed left-[50%] top-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] sm:max-w-md glass-card rounded-2xl p-6 border border-white/15"
		>
			<div class="flex flex-col gap-4">
				<div class="flex items-start gap-3">
					<div
						class="w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center {mode === 'end'
							? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
							: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'}"
					>
						{#if mode === 'end'}
							<UserMinus class="w-5 h-5" />
						{:else}
							<RotateCcw class="w-5 h-5" />
						{/if}
					</div>
					<div>
						<DialogPrimitive.Title class="text-lg font-semibold text-white brand-font">
							{mode === 'end' ? `Nonaktifkan ${name}` : `Aktifkan kembali ${name}`}
						</DialogPrimitive.Title>
						<DialogPrimitive.Description class="text-white/60 text-sm mt-1">
							{#if mode === 'end'}
								Riwayat transfer tetap tersimpan. {name} masih ikut batch sampai bulan tanggal berhenti.
							{:else}
								Periode baru dimulai; periode lama ({formatMemberDate(endDate)} berhenti) tetap tersimpan.
							{/if}
						</DialogPrimitive.Description>
					</div>
				</div>

				<div>
					<label for={dateInputId} class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">
						{mode === 'end' ? 'Tanggal Berhenti (hari terakhir)' : 'Tanggal Mulai Kembali'}
					</label>
					<input
						id={dateInputId}
						type="date"
						bind:value={date}
						min={minDate || undefined}
						class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
					/>
					{#if date && !invalid}
						<p class="text-white/40 text-xs mt-1">
							{mode === 'end'
								? `Terakhir ikut batch ${formatPeriod(date.slice(0, 7))}.`
								: `Ikut lagi mulai batch ${formatPeriod(date.slice(0, 7))}.`}
						</p>
					{:else if invalid && minDate}
						<p class="text-red-400 text-xs mt-1">Paling awal {formatMemberDate(minDate)}.</p>
					{/if}
				</div>

				<div class="flex gap-3 w-full">
					<button
						onclick={() => (open = false)}
						class="flex-1 glass-button rounded-xl px-4 py-2.5 text-white/80 text-sm font-medium"
					>
						Batal
					</button>
					<button
						disabled={invalid}
						onclick={() => {
							open = false;
							onConfirm(date);
						}}
						class="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all disabled:opacity-50 {mode === 'end'
							? 'bg-amber-500/25 hover:bg-amber-500/40 border-amber-500/40 text-amber-200'
							: 'bg-emerald-500/25 hover:bg-emerald-500/40 border-emerald-500/40 text-emerald-200'}"
					>
						{mode === 'end' ? 'Nonaktifkan' : 'Aktifkan'}
					</button>
				</div>

				{#if mode === 'end' && canPurge && onPurge}
					<button
						onclick={() => {
							open = false;
							onPurge?.();
						}}
						class="self-center flex items-center gap-1.5 text-xs text-red-300/70 hover:text-red-300 transition-colors"
					>
						<Trash2 class="w-3.5 h-3.5" />
						Salah input? Hapus permanen
					</button>
				{/if}
			</div>

			<DialogPrimitive.Close
				class="absolute end-3 top-3 text-white/40 hover:text-white/70 transition-colors rounded-lg p-1"
			>
				<X class="w-4 h-4" />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
