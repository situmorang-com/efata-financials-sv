<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Component } from 'svelte';

	let { items }: {
		items: Array<{ label: string; href?: string; icon?: Component }>;
	} = $props();
</script>

<nav class="flex items-center gap-1.5 text-sm mb-4">
	{#each items as item, i}
		{#if i > 0}
			<ChevronRight class="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
		{/if}
		{#if item.href && i < items.length - 1}
			<a href={item.href} class="flex items-center gap-1.5 text-white/50 hover:text-white/80 transition-colors">
				{#if item.icon}
					<item.icon class="w-3.5 h-3.5" />
				{/if}
				{item.label}
			</a>
		{:else}
			<span class="flex items-center gap-1.5 text-white/80 font-medium">
				{#if item.icon}
					<item.icon class="w-3.5 h-3.5" />
				{/if}
				{item.label}
			</span>
		{/if}
	{/each}
</nav>
