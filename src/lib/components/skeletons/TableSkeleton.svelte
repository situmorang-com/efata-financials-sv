<script lang="ts">
	import Skeleton from '../Skeleton.svelte';

	let { rows = 5, columns = 5 }: { rows?: number; columns?: number } = $props();

	const colWidths = ['3rem', '8rem', '6rem', '5rem', '4rem', '3rem', '3rem'];
</script>

<div class="glass-card rounded-2xl overflow-hidden">
	<div class="px-4 py-3 border-b border-white/10">
		<div class="flex gap-6">
			{#each Array(columns) as _, ci}
				<Skeleton width={colWidths[ci % colWidths.length]} height="0.6rem" rounded="sm" />
			{/each}
		</div>
	</div>
	{#each Array(rows) as _}
		<div class="px-4 py-3 border-b border-white/[0.06]">
			<div class="flex gap-6 items-center">
				{#each Array(columns) as _, ci}
					<Skeleton width={colWidths[ci % colWidths.length]} height="0.8rem" rounded="md" />
				{/each}
			</div>
		</div>
	{/each}
</div>
