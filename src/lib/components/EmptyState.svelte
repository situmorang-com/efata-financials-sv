<script lang="ts">
	import type { Component } from 'svelte';

	let {
		icon: Icon,
		title,
		description = '',
		actionLabel = '',
		actionHref = ''
	}: {
		icon: Component;
		title: string;
		description?: string;
		actionLabel?: string;
		actionHref?: string;
	} = $props();
</script>

<div class="glass-card rounded-2xl p-10 text-center fade-up">
	<div class="flex justify-center mb-4">
		<div class="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/40">
			<Icon class="w-7 h-7" />
		</div>
	</div>
	<h3 class="text-white font-semibold text-lg">{title}</h3>
	{#if description}
		<p class="text-white/50 text-sm mt-1.5 max-w-sm mx-auto">{description}</p>
	{/if}
	{#if actionLabel && actionHref}
		<a
			href={actionHref}
			class="inline-flex items-center gap-2 mt-5 glass-button rounded-full px-5 py-2.5 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40"
		>
			{actionLabel}
		</a>
	{/if}
</div>
