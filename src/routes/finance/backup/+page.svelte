<script lang="ts">
	import { enhance } from '$app/forms';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { data, form } = $props();
	let busy = $state(false);

	const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
	const when = (iso: string) =>
		new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<div class="p-4 sm:p-6 max-w-3xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Finance', href: '/finance', icon: Landmark },
		{ label: 'Backup & Restore' }
	]} />

	<h1 class="text-2xl font-bold text-white glow-text brand-font mb-1">Backup &amp; Restore</h1>
	<p class="text-white/60 text-sm mb-5">Unduh salinan database, atau ganti database dengan file yang sudah disiapkan.</p>

	<div class="glass-card rounded-2xl p-5 mb-4">
		<h2 class="text-white font-semibold">Unduh database</h2>
		<p class="text-white/55 text-sm mt-1">Salinan lengkap dan konsisten dari data saat ini (aman saat aplikasi berjalan).</p>
		<a href="/finance/backup/download" data-sveltekit-reload class="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-50">
			<Download class="w-4 h-4" /> Unduh .db
		</a>
	</div>

	<div class="glass-card rounded-2xl p-5 mb-4 border border-rose-400/20">
		<h2 class="text-white font-semibold flex items-center gap-2"><TriangleAlert class="w-4 h-4 text-rose-300" /> Ganti database</h2>
		<p class="text-white/55 text-sm mt-1">
			Semua data saat ini diganti dengan isi file yang diunggah. Salinan pengaman dibuat otomatis sebelum mengganti.
		</p>
		{#if form && 'restored' in form && form.restored}
			<p class="mt-3 text-emerald-200 text-sm">Database berhasil diganti. Salinan pengaman: <code>{form.safety}</code></p>
		{/if}
		{#if form && 'error' in form && form.error}
			<p class="mt-3 text-rose-200 text-sm">{form.error}</p>
		{/if}
		<form method="POST" action="?/restore" enctype="multipart/form-data" class="mt-3 space-y-3" use:enhance={() => {
			busy = true;
			return async ({ update }) => { await update(); busy = false; };
		}}>
			<input type="file" name="database" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" required class="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" />
			<div>
				<label for="confirm" class="block text-white/60 text-xs mb-1">Ketik <strong class="text-white">{data.confirmWord}</strong> untuk mengonfirmasi</label>
				<input id="confirm" name="confirm" autocomplete="off" class="w-full glass-input rounded-xl px-3 py-2 text-white text-sm" />
			</div>
			<button type="submit" disabled={busy} class="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-50 disabled:opacity-50">
				<Upload class="w-4 h-4" /> {busy ? 'Mengganti…' : 'Ganti database'}
			</button>
		</form>
	</div>

	{#if data.safetyCopies.length}
		<div class="glass-card rounded-2xl p-5">
			<h2 class="text-white font-semibold mb-2">Salinan pengaman di server</h2>
			<ul class="space-y-1 text-sm">
				{#each data.safetyCopies as c (c.name)}
					<li class="flex justify-between items-center gap-3 text-white/70">
						<code class="truncate">{c.name}</code>
						<span class="text-white/45 shrink-0 flex items-center gap-2">
							{size(c.size)} · {when(c.created_at)}
							<a href="/finance/backup/download?copy={encodeURIComponent(c.name)}" data-sveltekit-reload class="text-sky-200 hover:underline">unduh</a>
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
