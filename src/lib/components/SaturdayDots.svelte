<script lang="ts">
	let {
		total,
		attended,
		onchange
	}: {
		total: number;
		attended: number;
		onchange: (newAttended: number) => void;
	} = $props();

	function toggleDot(index: number) {
		// Click on a dot: if clicking the same as current count, reduce by 1
		// Otherwise, set to that index + 1 (fill up to that dot)
		if (index + 1 === attended) {
			onchange(attended - 1);
		} else {
			onchange(index + 1);
		}
	}

	function fillAll() {
		onchange(attended === total ? 0 : total);
	}
</script>

<div class="flex items-center gap-1.5">
	<div class="flex items-center gap-0.5">
		{#each Array(total) as _, i}
			<button
				type="button"
				onclick={() => toggleDot(i)}
				class="w-5 h-5 rounded-full border-2 transition-all duration-150 flex items-center justify-center text-[10px] font-bold
					{i < attended
						? 'bg-emerald-500/50 border-emerald-400 text-emerald-100 shadow-[0_0_6px_rgba(52,211,153,0.3)]'
						: 'bg-white/5 border-white/20 text-transparent hover:border-white/40 hover:bg-white/10'
					}"
				title="Sabat ke-{i + 1}"
			>
				{#if i < attended}
					<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
						<path d="M20 6L9 17l-5-5" />
					</svg>
				{/if}
			</button>
		{/each}
	</div>
	<button
		type="button"
		onclick={fillAll}
		class="text-white/40 text-xs font-medium tabular-nums hover:text-white/70 transition-colors min-w-[2rem] text-center"
		title={attended === total ? 'Kosongkan semua' : 'Isi semua'}
	>
		{attended}/{total}
	</button>
</div>
