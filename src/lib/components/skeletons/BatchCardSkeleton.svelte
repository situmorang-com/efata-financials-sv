<script lang="ts">
	import Skeleton from '../Skeleton.svelte';

	let { count = 3 }: { count?: number } = $props();
</script>

<div class="grid gap-4">
	{#each Array(count) as _}
		<div class="glass-card rounded-2xl p-5">
			<div class="flex items-start justify-between gap-4">
				<div class="flex-1 space-y-2">
					<div class="flex items-center gap-2">
						<Skeleton width="10rem" height="1.1rem" rounded="lg" />
						<Skeleton width="3rem" height="1.2rem" rounded="full" />
					</div>
					<Skeleton width="14rem" height="0.7rem" rounded="md" />
					<Skeleton width="9rem" height="0.6rem" rounded="md" />
				</div>
				<div class="flex gap-4">
					<div class="text-center space-y-1">
						<Skeleton width="3rem" height="1rem" rounded="md" />
						<Skeleton width="3rem" height="0.55rem" rounded="sm" />
					</div>
					<div class="text-center space-y-1">
						<Skeleton width="3rem" height="1rem" rounded="md" />
						<Skeleton width="3rem" height="0.55rem" rounded="sm" />
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
