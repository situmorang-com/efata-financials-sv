<script lang="ts">
	import Skeleton from '../Skeleton.svelte';
</script>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
	{#each Array(3) as _}
		<div class="glass-card rounded-2xl p-4">
			<Skeleton width="6rem" height="0.65rem" rounded="md" />
			<div class="mt-3">
				<Skeleton width="4rem" height="1.75rem" rounded="lg" />
			</div>
			<div class="mt-2">
				<Skeleton width="8rem" height="0.6rem" rounded="md" />
			</div>
		</div>
	{/each}
</div>
