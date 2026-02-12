<script lang="ts">
	import { page } from '$app/stores';
	import BatchChecklist from '$lib/components/BatchChecklist.svelte';

	let batchId = $derived(Number($page.params.id));
</script>

<BatchChecklist {batchId} />
