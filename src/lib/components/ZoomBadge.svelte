<script lang="ts">
	import { formatRupiah } from '$lib/format.js';
	import type { ZoomType } from '$lib/types.js';

	let {
		zoomType,
		singleRate,
		familyRate,
		customAmount = 0,
		onchange,
		disabled = false
	}: {
		zoomType: ZoomType;
		singleRate: number;
		familyRate: number;
		customAmount?: number;
		onchange: (newType: ZoomType) => void;
		disabled?: boolean;
	} = $props();

	const cycleOrder: ZoomType[] = ['none', 'single', 'family', 'custom'];

	function getLabel(type: ZoomType): string {
		return type === 'single' ? 'Sendiri' : type === 'family' ? 'Keluarga' : type === 'custom' ? 'Manual' : 'Tidak';
	}

	function getNextType(type: ZoomType): ZoomType {
		const currentIndex = cycleOrder.indexOf(type);
		const nextIndex = (currentIndex + 1) % cycleOrder.length;
		return cycleOrder[nextIndex];
	}

	function cycle() {
		if (disabled) return;
		onchange(getNextType(zoomType));
	}

	let displayText = $derived(
		zoomType === 'single'
			? formatRupiah(singleRate)
			: zoomType === 'family'
				? formatRupiah(familyRate)
				: zoomType === 'custom'
					? formatRupiah(customAmount)
				: '—'
	);

	let label = $derived(getLabel(zoomType));
	let nextLabel = $derived(getLabel(getNextType(zoomType)));
</script>

<button
	type="button"
	disabled={disabled}
	onclick={cycle}
	class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all border
		{zoomType === 'single'
			? 'bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/30'
			: zoomType === 'family'
				? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
				: zoomType === 'custom'
					? 'bg-sky-500/20 text-sky-300 border-sky-500/30 hover:bg-sky-500/30'
				: 'bg-white/5 text-white/30 border-white/10 hover:border-white/25 hover:text-white/50'
		}
		{disabled ? 'opacity-55 cursor-not-allowed hover:bg-white/5 hover:border-white/10 hover:text-white/30' : ''}"
	title="Klik untuk ganti: {label} → {nextLabel}"
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
	{:else if zoomType === 'custom'}
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
		</svg>
	{:else}
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</svg>
	{/if}
	<span class="hidden sm:inline">{displayText}</span>
</button>
