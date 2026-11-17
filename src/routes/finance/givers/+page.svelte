<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Copy from '@lucide/svelte/icons/copy';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Eye from '@lucide/svelte/icons/eye';
	import X from '@lucide/svelte/icons/x';
	import type { GiverSummary, GiverStatementStatus } from '$lib/types.js';

	let { data, form } = $props();
	let busyKey = $state<string | null>(null);
	let created = $state<{ giver_name: string; link: string; pin: string } | null>(null);

	$effect(() => {
		if (form && 'created' in form && form.created) created = form.created;
		if (form && 'error' in form && form.error) addToast(String(form.error), 'error');
	});

	function statusLabel(status: GiverStatementStatus | undefined): { text: string; cls: string } {
		switch (status) {
			case 'sent': return { text: 'Link dibuat', cls: 'bg-sky-500/15 text-sky-200 border-sky-400/25' };
			case 'opened': return { text: 'Sudah dibuka', cls: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/25' };
			case 'submitted': return { text: 'Menunggu diterapkan', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/30' };
			case 'applied': return { text: 'Selesai', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25' };
			default: return { text: 'Belum ada link', cls: 'bg-white/5 text-white/55 border-white/10' };
		}
	}

	function dateLabel(value: string): string {
		return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function message(c: { giver_name: string; link: string; pin: string }): string {
		return [
			`Shalom ${c.giver_name},`,
			'',
			'Berikut halaman konfirmasi persembahan Anda yang tercatat di rekening GMAHK EFATA.',
			'Mohon periksa setiap transfer dan pembagiannya: perpuluhan, persembahan (terpadu), atau persembahan khusus (100% untuk jemaat). Jika ada yang kurang tepat, silakan ubah langsung di halaman tersebut lalu tekan "Kirim konfirmasi".',
			'',
			`Link: ${c.link}`,
			`PIN: ${c.pin}`,
			'',
			'Terima kasih. Tuhan memberkati.'
		].join('\n');
	}

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			addToast(`${what} disalin`, 'success');
		} catch {
			addToast('Gagal menyalin — salin manual', 'error');
		}
	}

	function confirmRecreate(g: GiverSummary, e: SubmitEvent) {
		if (!g.statement || g.statement.status === 'applied') return;
		const msg = g.statement.status === 'submitted'
			? `${g.giver_name} sudah mengirim konfirmasi yang belum diterapkan. Membuat link baru akan membuang jawaban itu. Lanjutkan?`
			: `Link lama untuk ${g.giver_name} tidak akan berlaku lagi. Buat link baru?`;
		if (!confirm(msg)) e.preventDefault();
	}
</script>

<div class="p-4 sm:p-6 max-w-6xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Finance', href: '/finance', icon: Landmark },
		{ label: 'Konfirmasi Pemberi' }
	]} />

	<div class="mb-5 fade-up">
		<h1 class="text-2xl font-bold text-white glow-text brand-font">Konfirmasi Pemberi</h1>
		<p class="text-white/60 text-sm mt-1 max-w-3xl">
			Kirim setiap pemberi halaman pribadi berisi transfer mereka di rekening koran. Mereka mengonfirmasi berapa yang
			perpuluhan, persembahan terpadu, dan persembahan khusus. Buku tidak berubah sampai Anda menerapkan konfirmasinya.
		</p>
	</div>

	{#if data.givers.length === 0}
		<EmptyState icon={Landmark} title="Belum ada transfer pemberi" description="Impor rekening koran terlebih dahulu." />
	{:else}
		<div class="space-y-3">
			{#each data.givers as g (g.giver_key)}
				{@const st = statusLabel(g.statement?.status)}
				<div class="glass-card rounded-2xl p-4 fade-up flex flex-col md:flex-row md:items-center gap-3">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 flex-wrap">
							<h2 class="text-white font-semibold">{g.giver_name}</h2>
							<span class="px-2 py-0.5 rounded-full text-[11px] border {st.cls}">{st.text}</span>
							{#if g.statement?.status === 'submitted' && g.statement.changed_lines > 0}
								<span class="px-2 py-0.5 rounded-full text-[11px] border bg-rose-500/15 text-rose-200 border-rose-400/25">
									{g.statement.changed_lines} perubahan
								</span>
							{/if}
							{#if g.unclassified > 0}
								<span class="px-2 py-0.5 rounded-full text-[11px] border bg-amber-500/10 text-amber-200/90 border-amber-400/20">
									{g.unclassified} belum diklasifikasi
								</span>
							{/if}
						</div>
						<p class="text-white/55 text-sm mt-1">
							{g.line_count} transfer · {formatRupiah(g.total)} · {dateLabel(g.first_date)} – {dateLabel(g.last_date)}
						</p>
					</div>
					<div class="flex items-center gap-2 flex-wrap">
						{#if g.statement}
							<a href="/finance/givers/{g.statement.id}" class="glass-button rounded-xl px-3 py-2 text-white text-sm inline-flex items-center gap-1.5">
								<Eye class="w-4 h-4" /> Lihat
							</a>
						{/if}
						<form
							method="POST"
							action="?/create"
							onsubmit={(e) => confirmRecreate(g, e)}
							use:enhance={() => {
								busyKey = g.giver_key;
								return async ({ update }) => {
									await update({ reset: false });
									busyKey = null;
								};
							}}
						>
							<input type="hidden" name="giver_key" value={g.giver_key} />
							<button
								type="submit"
								disabled={busyKey === g.giver_key}
								class="rounded-xl px-3 py-2 text-sm inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-100 disabled:opacity-50"
							>
								<Link2 class="w-4 h-4" />
								{g.statement && g.statement.status !== 'applied' ? 'Buat ulang link' : 'Buat link'}
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if created}
	<div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="presentation" onclick={() => (created = null)}>
		<div class="glass-card rounded-3xl p-5 w-full max-w-lg shadow-2xl" role="dialog" aria-modal="true" aria-label="Link konfirmasi" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') created = null; }}>
			<div class="flex items-start justify-between gap-3 mb-4">
				<div>
					<h3 class="text-white font-semibold brand-font text-lg">Link untuk {created.giver_name}</h3>
					<p class="text-amber-200/90 text-xs mt-1">PIN hanya ditampilkan sekarang. Jika hilang, buat ulang link.</p>
				</div>
				<button type="button" onclick={() => (created = null)} class="glass-button rounded-lg p-1.5 text-white/70 hover:text-white" aria-label="Tutup">
					<X class="w-4 h-4" />
				</button>
			</div>
			<div class="space-y-2">
				<div class="glass rounded-xl p-3 flex items-center gap-2">
					<div class="min-w-0 flex-1">
						<p class="text-[11px] uppercase tracking-wider text-white/45">Link</p>
						<p class="text-white text-sm break-all">{created.link}</p>
					</div>
					<button type="button" onclick={() => copy(created!.link, 'Link')} class="glass-button rounded-lg p-2 text-white/80" aria-label="Salin link"><Copy class="w-4 h-4" /></button>
				</div>
				<div class="glass rounded-xl p-3 flex items-center gap-2">
					<div class="flex-1">
						<p class="text-[11px] uppercase tracking-wider text-white/45">PIN</p>
						<p class="text-white text-2xl font-mono tracking-[0.3em]">{created.pin}</p>
					</div>
					<button type="button" onclick={() => copy(created!.pin, 'PIN')} class="glass-button rounded-lg p-2 text-white/80" aria-label="Salin PIN"><Copy class="w-4 h-4" /></button>
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
				<a
					href="https://wa.me/?text={encodeURIComponent(message(created))}"
					target="_blank"
					rel="noopener noreferrer"
					class="rounded-xl px-3 py-2.5 text-sm inline-flex items-center justify-center gap-1.5 bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/30 text-emerald-50"
				>
					<MessageCircle class="w-4 h-4" /> Kirim via WhatsApp
				</a>
				<button type="button" onclick={() => copy(message(created!), 'Pesan')} class="glass-button rounded-xl px-3 py-2.5 text-white text-sm inline-flex items-center justify-center gap-1.5">
					<Copy class="w-4 h-4" /> Salin pesan
				</button>
			</div>
		</div>
	</div>
{/if}
