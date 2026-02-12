<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';
	import { getToasts, removeToast } from '$lib/stores/toast.svelte.js';

	const iconMap = {
		success: CircleCheck,
		error: CircleX,
		warning: TriangleAlert,
		info: Info
	};

	const colorMap = {
		success: 'border-emerald-500/40 text-emerald-300',
		error: 'border-red-500/40 text-red-300',
		warning: 'border-amber-500/40 text-amber-300',
		info: 'border-sky-500/40 text-sky-300'
	};

	const bgMap = {
		success: 'bg-emerald-500/10',
		error: 'bg-red-500/10',
		warning: 'bg-amber-500/10',
		info: 'bg-sky-500/10'
	};
</script>

<div class="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-[100] flex flex-col gap-2 pointer-events-none">
	{#each getToasts() as toast (toast.id)}
		{@const Icon = iconMap[toast.type]}
		<div
			class="pointer-events-auto glass-dark rounded-xl px-4 py-3 border {colorMap[toast.type]} {bgMap[toast.type]} flex items-start gap-3 toast-enter"
		>
			<div class="flex-shrink-0 mt-0.5">
				<Icon class="w-4 h-4" />
			</div>
			<p class="text-sm text-white/90 flex-1">{toast.message}</p>
			<button
				onclick={() => removeToast(toast.id)}
				class="flex-shrink-0 text-white/40 hover:text-white/70 transition-colors"
			>
				<X class="w-3.5 h-3.5" />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-enter {
		animation: toastIn 300ms ease both;
	}

	@keyframes toastIn {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
