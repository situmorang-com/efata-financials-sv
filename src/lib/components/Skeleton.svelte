<script lang="ts">
	let {
		class: className = '',
		width = '',
		height = '1rem',
		rounded = 'lg'
	}: {
		class?: string;
		width?: string;
		height?: string;
		rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
	} = $props();
</script>

<div
	class="bg-white/[0.06] rounded-{rounded} overflow-hidden relative {className}"
	style="width: {width || '100%'}; height: {height};"
>
	<div class="absolute inset-0 shimmer"></div>
</div>
