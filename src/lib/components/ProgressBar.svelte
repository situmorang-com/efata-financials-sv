<script lang="ts">
	let { current, total, label, color = 'green', meta = '' }: {
		current: number;
		total: number;
		label: string;
		color?: 'green' | 'blue' | 'yellow';
		meta?: string;
	} = $props();

	let percentage = $derived(total > 0 ? Math.round((current / total) * 100) : 0);
	let isComplete = $derived(total > 0 && current >= total);

	let barColor = $derived(
		color === 'green' ? 'bg-green-400/80' :
		color === 'blue' ? 'bg-blue-400/80' :
		'bg-yellow-400/80'
	);

	let glowColor = $derived(
		color === 'green' ? 'shadow-[0_0_12px_rgba(34,197,94,0.4)]' :
		color === 'blue' ? 'shadow-[0_0_12px_rgba(56,189,248,0.4)]' :
		'shadow-[0_0_12px_rgba(250,204,21,0.4)]'
	);
</script>

<div class="space-y-1.5">
	<div class="flex justify-between text-sm">
		<span class="text-white/70">{label}</span>
		<span class="text-white font-medium">
			{current}/{total}
			<span class="text-white/50 ml-0.5">({percentage}%)</span>
		</span>
	</div>
	{#if meta}
		<div class="text-xs text-white/40 -mt-0.5">{meta}</div>
	{/if}
	<div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
		<div
			class="h-full rounded-full transition-all duration-500 {barColor} {isComplete ? glowColor : ''}"
			style="width: {percentage}%"
		></div>
	</div>
</div>
