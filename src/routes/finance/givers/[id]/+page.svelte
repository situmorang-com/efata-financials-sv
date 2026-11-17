<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatRupiah } from '$lib/format.js';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Landmark from '@lucide/svelte/icons/landmark';
	import CheckCheck from '@lucide/svelte/icons/check-check';

	let { data, form } = $props();
	let applying = $state(false);

	$effect(() => {
		if (form && 'applied' in form && form.applied) {
			addToast(`Diterapkan: ${form.applied.changed} transfer diubah di buku`, 'success');
		}
		if (form && 'error' in form && form.error) addToast(String(form.error), 'error');
	});

	let changed = $derived(data.lines.filter((l) => l.changed));
	let notMine = $derived(data.lines.filter((l) => l.not_mine));
	let totals = $derived(
		data.lines.reduce(
			(t, l) => ({
				tithe: t.tithe + (l.not_mine ? 0 : l.tithe),
				offering: t.offering + (l.not_mine ? 0 : l.offering),
				special: t.special + (l.not_mine ? 0 : l.special)
			}),
			{ tithe: 0, offering: 0, special: 0 }
		)
	);

	const STATUS: Record<string, string> = {
		sent: 'Link dibuat, belum dibuka',
		opened: 'Sudah dibuka, belum dikirim',
		submitted: 'Dikirim — menunggu diterapkan',
		applied: 'Sudah diterapkan ke buku',
		superseded: 'Diganti link baru'
	};

	function dateLabel(value: string | null): string {
		if (!value) return '-';
		return new Date(value.length > 10 ? value : `${value}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

<div class="p-4 sm:p-6 max-w-6xl mx-auto">
	<Breadcrumbs items={[
		{ label: 'Home', href: '/finance', icon: LayoutDashboard },
		{ label: 'Konfirmasi Pemberi', href: '/finance/givers', icon: Landmark },
		{ label: data.statement.giver_name }
	]} />

	<div class="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-4 fade-up">
		<div>
			<h1 class="text-2xl font-bold text-white glow-text brand-font">{data.statement.giver_name}</h1>
			<p class="text-white/60 text-sm mt-1">
				{STATUS[data.statement.status]} · dibuat {dateLabel(data.statement.created_at)}
				{#if data.statement.opened_at} · dibuka {dateLabel(data.statement.opened_at)}{/if}
				{#if data.statement.submitted_at} · dikirim {dateLabel(data.statement.submitted_at)}{/if}
			</p>
		</div>
		{#if data.statement.status === 'submitted'}
			<form method="POST" action="?/apply" use:enhance={() => {
				applying = true;
				return async ({ update }) => { await update(); applying = false; };
			}}>
				<button
					type="submit"
					disabled={applying}
					class="rounded-xl px-4 py-2.5 text-sm inline-flex items-center gap-1.5 bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/30 text-emerald-50 disabled:opacity-50"
				>
					<CheckCheck class="w-4 h-4" />
					Terapkan ke buku ({changed.length} perubahan)
				</button>
			</form>
		{/if}
	</div>

	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
		<div class="glass-card rounded-2xl p-4"><p class="text-white/50 text-xs uppercase tracking-wider">Perpuluhan</p><p class="text-white text-lg font-semibold mt-1">{formatRupiah(totals.tithe)}</p></div>
		<div class="glass-card rounded-2xl p-4"><p class="text-white/50 text-xs uppercase tracking-wider">Persembahan</p><p class="text-white text-lg font-semibold mt-1">{formatRupiah(totals.offering)}</p></div>
		<div class="glass-card rounded-2xl p-4"><p class="text-white/50 text-xs uppercase tracking-wider">Pers. Khusus</p><p class="text-white text-lg font-semibold mt-1">{formatRupiah(totals.special)}</p></div>
		<div class="glass-card rounded-2xl p-4"><p class="text-white/50 text-xs uppercase tracking-wider">Berubah / bukan miliknya</p><p class="text-white text-lg font-semibold mt-1">{changed.length} / {notMine.length}</p></div>
	</div>

	{#if data.statement.giver_note}
		<div class="glass-card rounded-2xl p-4 mb-4 border border-sky-400/20">
			<p class="text-white/50 text-xs uppercase tracking-wider mb-1">Catatan pemberi</p>
			<p class="text-white/90 text-sm whitespace-pre-line">{data.statement.giver_note}</p>
		</div>
	{/if}

	<div class="glass-card rounded-2xl overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="text-left text-white/45 text-[11px] uppercase tracking-wider border-b border-white/10">
					<th class="px-3 py-2.5">Tanggal</th>
					<th class="px-3 py-2.5 text-right">Transfer</th>
					<th class="px-3 py-2.5 text-right">Perpuluhan</th>
					<th class="px-3 py-2.5 text-right">Persembahan</th>
					<th class="px-3 py-2.5 text-right">Khusus</th>
					<th class="px-3 py-2.5">Keterangan</th>
				</tr>
			</thead>
			<tbody>
				{#each data.lines as l (l.id)}
					<tr class="border-b border-white/5 align-top {l.not_mine ? 'opacity-60' : l.changed ? 'bg-amber-500/5' : ''}">
						<td class="px-3 py-2.5 text-white/80 whitespace-nowrap">{dateLabel(l.txn_date)}</td>
						<td class="px-3 py-2.5 text-right text-white whitespace-nowrap">{formatRupiah(l.amount)}</td>
						{#each [['tithe', l.tithe, l.books.tithe], ['offering', l.offering, l.books.offering], ['special', l.special, l.books.special]] as [key, giver, books] (key)}
							<td class="px-3 py-2.5 text-right whitespace-nowrap">
								<span class={giver !== books && !l.not_mine ? 'text-amber-200 font-semibold' : 'text-white/80'}>{formatRupiah(Number(giver))}</span>
								{#if giver !== books && !l.not_mine}
									<span class="block text-[11px] text-white/40 line-through">{formatRupiah(Number(books))}</span>
								{/if}
							</td>
						{/each}
						<td class="px-3 py-2.5 text-white/60 min-w-64">
							{#if l.not_mine}<span class="text-rose-200 font-medium">Bukan transfer saya. </span>{/if}
							{#if l.note}<span class="text-sky-200">“{l.note}” </span>{/if}
							<span class="text-white/40 text-xs block">{l.remark}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="text-white/40 text-xs mt-2">Angka coret = yang tercatat di buku sekarang. Hanya baris berwarna yang berubah saat diterapkan.</p>
</div>
