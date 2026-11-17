<script lang="ts">
	/** Whole-rupiah amount field: shows 1.250.000 while typing, binds a number. */
	let {
		value = $bindable(0),
		id,
		disabled = false,
		label,
		oninput
	}: { value?: number; id?: string; disabled?: boolean; label?: string; oninput?: () => void } = $props();

	const format = (n: number) => (n ? n.toLocaleString('id-ID') : '');
	let text = $state(format(value));

	// Follow outside changes (presets, reset) without fighting the user's typing.
	$effect(() => {
		const n = value;
		if (Number(text.replace(/\D/g, '') || 0) !== n) text = format(n);
	});

	function handle(e: Event) {
		const digits = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12);
		value = Number(digits || 0);
		text = format(value);
		oninput?.();
	}
</script>

<div class="relative">
	<span class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">Rp</span>
	<input
		{id}
		type="text"
		inputmode="numeric"
		autocomplete="off"
		aria-label={label}
		{disabled}
		value={text}
		oninput={handle}
		placeholder="0"
		class="w-full glass-input rounded-xl pl-10 pr-3 py-2.5 text-white text-base text-right tabular-nums disabled:opacity-60"
	/>
</div>
