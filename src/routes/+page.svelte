<script lang="ts">
	import type { Batch } from '$lib/types.js';
	import { formatRupiah, formatDate } from '$lib/format.js';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StatCardSkeleton from '$lib/components/skeletons/StatCardSkeleton.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import UsersIcon from '@lucide/svelte/icons/users';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import Layers from '@lucide/svelte/icons/layers';

	let batches = $state<Batch[]>([]);
	let loading = $state(true);

	let activeBatch = $derived(batches.find(b => b.status === 'active'));

	async function loadBatches() {
		try {
			const res = await fetch('/api/batches');
			batches = await res.json();
		} catch (e) {
			console.error('Failed to load:', e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadBatches();
	});
</script>

<div class="p-4 sm:p-6 max-w-6xl mx-auto">
	<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start mb-8 pt-6 stagger">
		<div class="lg:col-span-3 fade-up">
			<h1 class="text-3xl sm:text-4xl font-bold text-white glow-text brand-font">EFATA Transfer Checklist</h1>
			<p class="text-white/70 mt-2 max-w-xl">
				Alur kerja yang jelas: buat batch, tandai transfer, lalu kirim notifikasi WhatsApp.
			</p>
			<div class="flex flex-wrap gap-3 mt-5">
				<a href="/batches" class="glass-button rounded-full px-5 py-2 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 flex items-center gap-1.5">
					<Plus class="w-4 h-4" />
					Buat Batch Baru
				</a>
				<a href="/recipients" class="glass-button rounded-full px-5 py-2 text-white/80 text-sm flex items-center gap-1.5">
					<UsersIcon class="w-4 h-4" />
					Cek Daftar Penerima
				</a>
			</div>
		</div>
		<div class="lg:col-span-2"></div>
	</div>

	{#if loading}
		<div class="mb-6">
			<StatCardSkeleton />
		</div>
	{:else if activeBatch}
		<!-- Active batch summary -->
		{@const total = activeBatch.total_items || 0}
		{@const transferred = activeBatch.transferred_count || 0}
		{@const notified = activeBatch.notified_count || 0}
		<div class="glass-card rounded-2xl p-6 mb-6 fade-up">
			<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
				<div>
					<p class="text-white/50 text-xs uppercase tracking-wider">Batch Aktif</p>
					<h2 class="text-xl font-bold text-white mt-1 brand-font">{activeBatch.name}</h2>
					<p class="text-white/50 text-sm mt-0.5">{formatDate(activeBatch.created_at)} &middot; {formatRupiah(activeBatch.default_amount)} per orang</p>
				</div>
				<a
					href="/batches/{activeBatch.id}"
					class="glass-button rounded-full px-5 py-2.5 text-white text-sm font-semibold bg-emerald-500/25 hover:bg-emerald-500/40 flex items-center gap-1.5"
				>
					Buka Checklist
					<ArrowRight class="w-4 h-4" />
				</a>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div class="glass rounded-xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<UsersIcon class="w-3.5 h-3.5 text-white/50" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Penerima</p>
					</div>
					<p class="text-2xl font-bold text-white mt-1">{total}</p>
				</div>
				<div class="glass rounded-xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<ArrowRightLeft class="w-3.5 h-3.5 text-emerald-400/70" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Sudah Transfer</p>
					</div>
					<p class="text-2xl font-bold text-emerald-300 mt-1">{transferred}</p>
				</div>
				<div class="glass rounded-xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<MessageCircle class="w-3.5 h-3.5 text-sky-400/70" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Notif WA Terkirim</p>
					</div>
					<p class="text-2xl font-bold text-sky-300 mt-1">{notified}</p>
				</div>
			</div>
		</div>
	{:else}
		<!-- No active batch -->
		<EmptyState
			icon={PackagePlus}
			title="Belum ada batch aktif"
			description="Buat batch untuk mulai proses transfer dan notifikasi."
			actionLabel="Buat Batch Baru"
			actionHref="/batches"
		/>
		<div class="mb-6"></div>
	{/if}

	<!-- Quick links -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
		<a href="/batches" class="glass-card rounded-2xl p-5 hover:bg-white/5 transition-all block lift-on-hover group">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300 flex-shrink-0">
					<Layers class="w-5 h-5" />
				</div>
				<div>
					<h3 class="text-white font-semibold">Batch Transfer</h3>
					<p class="text-white/60 text-sm mt-0.5">Kelola batch dan lihat progres transfer.</p>
				</div>
			</div>
			<p class="text-white/40 text-xs mt-3">{batches.length} batch total</p>
		</a>
		<a href="/recipients" class="glass-card rounded-2xl p-5 hover:bg-white/5 transition-all block lift-on-hover group">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-300 flex-shrink-0">
					<UsersIcon class="w-5 h-5" />
				</div>
				<div>
					<h3 class="text-white font-semibold">Daftar Penerima</h3>
					<p class="text-white/60 text-sm mt-0.5">Perbarui data rekening dan WhatsApp.</p>
				</div>
			</div>
			<p class="text-white/40 text-xs mt-3">Lihat dan edit data penerima</p>
		</a>
	</div>
</div>
