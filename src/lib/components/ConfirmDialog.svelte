<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import X from '@lucide/svelte/icons/x';
	import { getConfirmState, handleConfirm, handleCancel } from '$lib/stores/confirm.svelte.js';

	const state = getConfirmState();

	const iconMap = {
		danger: Trash2,
		warning: TriangleAlert,
		default: HelpCircle
	};

	const iconColorMap = {
		danger: 'text-red-400 bg-red-500/15 border-red-500/30',
		warning: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
		default: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
	};

	const btnColorMap = {
		danger: 'bg-red-500/25 hover:bg-red-500/40 border-red-500/40 text-red-200',
		warning: 'bg-amber-500/25 hover:bg-amber-500/40 border-amber-500/40 text-amber-200',
		default: 'bg-emerald-500/25 hover:bg-emerald-500/40 border-emerald-500/40 text-emerald-200'
	};
</script>

<DialogPrimitive.Root bind:open={state.open} onOpenChange={(open) => { if (!open) handleCancel(); }}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm confirm-overlay-enter"
		/>
		<DialogPrimitive.Content
			class="fixed left-[50%] top-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] sm:max-w-md glass-card rounded-2xl p-6 border border-white/15 confirm-content-enter"
		>
			{@const Icon = iconMap[state.options.variant || 'default']}
		<div class="flex flex-col items-center text-center gap-4">
				<div class="w-12 h-12 rounded-xl border flex items-center justify-center {iconColorMap[state.options.variant || 'default']}">
					<Icon class="w-6 h-6" />
				</div>
				<div>
					<h3 class="text-lg font-semibold text-white brand-font">{state.options.title}</h3>
					<p class="text-white/60 text-sm mt-1">{state.options.description}</p>
				</div>
				<div class="flex gap-3 w-full mt-2">
					<button
						onclick={handleCancel}
						class="flex-1 glass-button rounded-xl px-4 py-2.5 text-white/80 text-sm font-medium"
					>
						{state.options.cancelLabel}
					</button>
					<button
						onclick={handleConfirm}
						class="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all {btnColorMap[state.options.variant || 'default']}"
					>
						{state.options.confirmLabel}
					</button>
				</div>
			</div>

			<DialogPrimitive.Close
				class="absolute end-3 top-3 text-white/40 hover:text-white/70 transition-colors rounded-lg p-1"
			>
				<X class="w-4 h-4" />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
	.confirm-overlay-enter {
		animation: fadeIn 200ms ease both;
	}
	.confirm-content-enter {
		animation: dialogIn 250ms ease both;
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes dialogIn {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}
</style>
