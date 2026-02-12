<script lang="ts">
	import { formatRupiah } from '$lib/format.js';

	let {
		zoomType,
		singleRate,
		familyRate,
		onchange
	}: {
		zoomType: 'none' | 'single' | 'family';
		singleRate: number;
		familyRate: number;
		onchange: (newType: 'none' | 'single' | 'family') => void;
	} = $props();

	const cycleOrder: ('none' | 'single' | 'family')[] = ['none', 'single', 'family'];

	function cycle() {
		const currentIndex = cycleOrder.indexOf(zoomType);
		const nextIndex = (currentIndex + 1) % cycleOrder.length;
		onchange(cycleOrder[nextIndex]);
	}

	let displayText = $derived(
		zoomType === 'single'
			? formatRupiah(singleRate)
			: zoomType === 'family'
				? formatRupiah(familyRate)
				: '—'
	);

	let label = $derived(
		zoomType === 'single' ? 'Sendiri' : zoomType === 'family' ? 'Keluarga' : 'Tidak'
	);
</script>

<button
	type="button"
	onclick={cycle}
	class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all border
		{zoomType === 'single'
			? 'bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/30'
			: zoomType === 'family'
				? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
				: 'bg-white/5 text-white/30 border-white/10 hover:border-white/25 hover:text-white/50'
		}"
	title="Klik untuk ganti: {label} → {zoomType === 'none' ? 'Sendiri' : zoomType === 'single' ? 'Keluarga' : 'Tidak'}"
>
	{#if zoomType === 'single'}
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		</svg>
	{:else if zoomType === 'family'}
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</svg>
	{:else}
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</svg>
	{/if}
	<span class="hidden sm:inline">{displayText}</span>
</button>
