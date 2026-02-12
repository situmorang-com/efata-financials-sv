<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Camera from '@lucide/svelte/icons/camera';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Image from '@lucide/svelte/icons/image';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	let {
		itemId,
		batchId,
		transferStatus,
		hasProof,
		recipientName,
		onStatusChange
	}: {
		itemId: number;
		batchId: number;
		transferStatus: 'pending' | 'done';
		hasProof: boolean;
		recipientName: string;
		onStatusChange: (newStatus: 'pending' | 'done', hasProof: boolean) => void;
	} = $props();

	let mode = $state<'idle' | 'picking' | 'uploading' | 'viewing'>('idle');
	let proofImage = $state<string | null>(null);
	let showModal = $state(false);
	let modalEl: HTMLDivElement;
	let fileInput: HTMLInputElement;
	let uploadProgress = $state('');

	// Portal: move modal to document.body so it escapes overflow/transform ancestors
	$effect(() => {
		if (modalEl) {
			document.body.appendChild(modalEl);
			return () => {
				if (modalEl.parentNode === document.body) {
					document.body.removeChild(modalEl);
				}
			};
		}
	});

	// Resize to 70% on client, server does AVIF q30 + caps at 1200x1600.
	async function prepareImage(file: File): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const img = new window.Image();
			const url = URL.createObjectURL(file);
			img.onload = async () => {
				URL.revokeObjectURL(url);
				const w = Math.round(img.width * 0.7);
				const h = Math.round(img.height * 0.7);
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(img, 0, 0, w, h);
				const blob = await new Promise<Blob | null>((res) => {
					canvas.toBlob(res, 'image/jpeg', 0.85);
				});
				resolve(blob && blob.size > 0 ? blob : file);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image'));
			};
			img.src = url;
		});
	}

	async function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		mode = 'uploading';
		uploadProgress = 'Mengompresi...';

		try {
			const blob = await prepareImage(file);
			const sizeKB = Math.round(blob.size / 1024);
			uploadProgress = `Mengunggah (${sizeKB}KB)...`;

			// Send as binary — no base64 overhead
			const res = await fetch(`/api/batches/${batchId}/items/${itemId}/proof`, {
				method: 'POST',
				headers: { 'Content-Type': blob.type },
				body: blob
			});

			if (!res.ok) throw new Error('Upload failed');

			mode = 'idle';
			onStatusChange('done', true);
		} catch (err) {
			console.error('Failed to upload proof:', err);
			mode = 'picking';
			uploadProgress = '';
		}

		// Reset file input
		input.value = '';
	}

	async function markDoneWithoutProof() {
		mode = 'uploading';
		uploadProgress = 'Menyimpan...';
		try {
			await fetch(`/api/batches/${batchId}/items/${itemId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					transfer_status: 'done',
					transfer_at: new Date().toISOString()
				})
			});
			mode = 'idle';
			onStatusChange('done', false);
		} catch (err) {
			console.error('Failed to mark done:', err);
			mode = 'picking';
			uploadProgress = '';
		}
	}

	async function undoTransfer() {
		try {
			// Delete proof file if exists
			if (hasProof) {
				await fetch(`/api/batches/${batchId}/items/${itemId}/proof`, { method: 'DELETE' });
			}
			// Reset transfer & notify status
			await fetch(`/api/batches/${batchId}/items/${itemId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					transfer_status: 'pending',
					transfer_at: null,
					notify_status: 'pending',
					notified_at: null
				})
			});
			proofImage = null;
			mode = 'idle';
			onStatusChange('pending', false);
		} catch (err) {
			console.error('Failed to undo transfer:', err);
		}
	}

	async function viewProof() {
		if (proofImage) {
			mode = mode === 'viewing' ? 'idle' : 'viewing';
			return;
		}
		// Use the image URL directly — no need to fetch base64
		proofImage = `/api/batches/${batchId}/items/${itemId}/proof?format=image`;
		mode = 'viewing';
	}

	function openPicker() {
		mode = 'picking';
	}

	function closePicker() {
		mode = 'idle';
	}
</script>

<div class="inline-flex flex-col items-start gap-1.5">
	{#if transferStatus === 'pending' && mode === 'idle'}
		<!-- Pending: Show transfer button -->
		<button
			type="button"
			onclick={openPicker}
			class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all
				bg-white/5 text-white/50 border border-white/15 hover:border-white/30"
		>
			<Upload class="w-3.5 h-3.5" />
			Transfer
		</button>

	{:else if mode === 'picking'}
		<!-- Picking: Show upload options -->
		<div class="flex flex-col gap-1.5 w-full min-w-[180px]">
			<div class="flex items-center gap-1.5">
				<label
					class="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all cursor-pointer
						bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25"
				>
					<Camera class="w-3.5 h-3.5" />
					Upload Bukti
					<input
						bind:this={fileInput}
						type="file"
						accept="image/*"
						capture="environment"
						onchange={handleFileSelected}
						class="hidden"
					/>
				</label>
				<button
					type="button"
					onclick={closePicker}
					class="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>
			<button
				type="button"
				onclick={markDoneWithoutProof}
				class="text-white/40 text-[11px] hover:text-white/60 transition-colors text-left"
			>
				Tandai selesai tanpa bukti →
			</button>
		</div>

	{:else if mode === 'uploading'}
		<!-- Uploading: Show progress -->
		<div class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-white/50 bg-white/5 border border-white/10">
			<Loader2 class="w-3.5 h-3.5 animate-spin" />
			{uploadProgress}
		</div>

	{:else if transferStatus === 'done' && (mode === 'idle' || mode === 'viewing')}
		<!-- Done: Show status badge -->
		<div class="flex items-center gap-1.5">
			{#if hasProof}
				<button
					type="button"
					onclick={viewProof}
					class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all
						bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
					title="Lihat bukti transfer"
				>
					<Check class="w-3.5 h-3.5" />
					<Image class="w-3 h-3" />
				</button>
			{:else}
				<button
					type="button"
					onclick={openPicker}
					class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all
						bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
					title="Transfer selesai (tanpa bukti) — klik untuk upload bukti"
				>
					<Check class="w-3.5 h-3.5" />
				</button>
			{/if}
			<button
				type="button"
				onclick={undoTransfer}
				class="p-1 rounded text-white/20 hover:text-red-300 hover:bg-red-500/10 transition-all"
				title="Batalkan transfer"
			>
				<Undo2 class="w-3 h-3" />
			</button>
		</div>

		<!-- Proof image inline preview -->
		{#if mode === 'viewing' && proofImage}
			<div class="mt-1 rounded-lg overflow-hidden border border-white/10 bg-black/30 max-w-[280px]">
				<button type="button" onclick={() => { showModal = true; }} class="cursor-zoom-in w-full">
					<img
						src={proofImage}
						alt="Bukti transfer {recipientName}"
						class="w-full h-auto"
					/>
				</button>
				<div class="flex items-center justify-between px-2 py-1 bg-black/20">
					<span class="text-white/40 text-[10px]">Bukti Transfer</span>
					<button
						type="button"
						onclick={() => { mode = 'idle'; }}
						class="text-white/30 hover:text-white/60 text-[10px]"
					>
						Tutup
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Hidden div used as portal target — $effect moves it to document.body -->
<div bind:this={modalEl} class="contents">
	{#if showModal && proofImage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed top-0 left-0 w-screen h-screen z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			onclick={() => { showModal = false; }}
			onkeydown={(e) => { if (e.key === 'Escape') showModal = false; }}
			tabindex="-1"
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative max-w-[90vw] max-h-[90vh] overflow-auto rounded-lg"
				onclick={(e) => e.stopPropagation()}
			>
				<img
					src={proofImage}
					alt="Bukti transfer {recipientName}"
					class="max-w-none h-auto"
				/>
				<button
					type="button"
					onclick={() => { showModal = false; }}
					class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-all"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/if}
</div>
