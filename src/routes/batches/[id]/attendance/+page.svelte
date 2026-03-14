<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { AttendanceRecord, AttendanceType, Batch, ZoomType } from '$lib/types.js';
	import { formatRupiah } from '$lib/format.js';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StatCardSkeleton from '$lib/components/skeletons/StatCardSkeleton.svelte';
	import TableSkeleton from '$lib/components/skeletons/TableSkeleton.svelte';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Layers from '@lucide/svelte/icons/layers';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import UsersIcon from '@lucide/svelte/icons/users';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	type AttendanceItem = {
		id?: number;
		recipient_id: number;
		recipient_name?: string;
		transfer_to_name?: string;
		family_group_id?: number | null;
		zoom_type: ZoomType;
		saturdays_attended: number;
		wednesdays_attended: number;
		amount: number;
	};

	type AttendancePayload = {
		batch: Batch;
		month: string;
		dates: {
			saturday: string[];
			wednesday: string[];
		};
		items: AttendanceItem[];
		records: AttendanceRecord[];
	};

	let batchId = $derived(Number($page.params.id));
	let loading = $state(true);
	let populating = $state(false);
	let batch = $state<Batch | null>(null);
	let month = $state('');
	let attendanceType = $state<AttendanceType>('saturday');
	let selectedDate = $state('');
	let searchQuery = $state('');
	let items = $state<AttendanceItem[]>([]);
	let records = $state<AttendanceRecord[]>([]);
	let savingMap = $state<Record<string, boolean>>({});
	let datesByType = $state<{ saturday: string[]; wednesday: string[] }>({
		saturday: [],
		wednesday: []
	});

	let currentDates = $derived(datesByType[attendanceType] || []);
	let filteredItems = $derived(
		items.filter((item) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			return (
				(item.recipient_name || '').toLowerCase().includes(q) ||
				(item.transfer_to_name || '').toLowerCase().includes(q)
			);
		})
	);
	let attendanceMap = $derived(
		(() => {
			const map = new Map<string, number>();
			for (const record of records) {
				map.set(
					makeKey(record.attendance_type, record.attendance_date, record.recipient_id),
					record.attended ? 1 : 0
				);
			}
			return map;
		})()
	);
	let selectedPresentCount = $derived(
		selectedDate
			? items.filter((item) => isPresent(item.recipient_id, attendanceType, selectedDate)).length
			: 0
	);
	let avgSaturday = $derived(
		items.length > 0
			? (items.reduce((sum, item) => sum + (item.saturdays_attended || 0), 0) / items.length).toFixed(1)
			: '0.0'
	);
	let avgWednesday = $derived(
		items.length > 0
			? (items.reduce((sum, item) => sum + (item.wednesdays_attended || 0), 0) / items.length).toFixed(1)
			: '0.0'
	);

	function makeKey(type: AttendanceType, date: string, recipientId: number): string {
		return `${type}:${date}:${recipientId}`;
	}

	function isSaving(recipientId: number): boolean {
		if (!selectedDate) return false;
		return !!savingMap[makeKey(attendanceType, selectedDate, recipientId)];
	}

	function isPresent(recipientId: number, type: AttendanceType, date: string): boolean {
		if (!date) return false;
		return attendanceMap.get(makeKey(type, date, recipientId)) === 1;
	}

	function countPresentByDate(type: AttendanceType, date: string): number {
		return items.filter((item) => isPresent(item.recipient_id, type, date)).length;
	}

	function pickDefaultDate(dates: string[]): string {
		if (dates.length === 0) return '';
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		for (const dateValue of dates) {
			const parsed = new Date(`${dateValue}T12:00:00`);
			if (!Number.isNaN(parsed.getTime()) && parsed >= today) {
				return dateValue;
			}
		}
		return dates[dates.length - 1];
	}

	function formatDateLabel(dateValue: string): string {
		const parsed = new Date(`${dateValue}T12:00:00`);
		if (Number.isNaN(parsed.getTime())) return dateValue;
		return parsed.toLocaleDateString('id-ID', {
			weekday: 'short',
			day: '2-digit',
			month: 'short'
		});
	}

	function upsertLocalRecord(
		source: AttendanceRecord[],
		recipientId: number,
		type: AttendanceType,
		date: string,
		attended: number
	): AttendanceRecord[] {
		const index = source.findIndex(
			(record) =>
				record.recipient_id === recipientId &&
				record.attendance_type === type &&
				record.attendance_date === date
		);
		const now = new Date().toISOString();
		if (index === -1) {
			return [
				...source,
				{
					batch_id: batchId,
					recipient_id: recipientId,
					attendance_type: type,
					attendance_date: date,
					attended,
					created_at: now,
					updated_at: now
				}
			];
		}
		const next = [...source];
		next[index] = {
			...next[index],
			attended,
			updated_at: now
		};
		return next;
	}

	function ensureSelectedDate() {
		if (currentDates.length === 0) {
			selectedDate = '';
			return;
		}
		if (!currentDates.includes(selectedDate)) {
			selectedDate = pickDefaultDate(currentDates);
		}
	}

	async function loadAttendance() {
		loading = true;
		try {
			const monthQuery = month ? `?month=${encodeURIComponent(month)}` : '';
			const res = await fetch(`/api/batches/${batchId}/attendance${monthQuery}`);
			const payload = (await res.json()) as AttendancePayload | { error?: string };
			if (!res.ok) {
				throw new Error((payload as { error?: string }).error || 'Gagal memuat attendance');
			}

			const data = payload as AttendancePayload;
			batch = data.batch;
			month = data.month;
			datesByType = {
				saturday: data.dates?.saturday || [],
				wednesday: data.dates?.wednesday || []
			};
			items = (data.items || []).map((item) => ({
				...item,
				saturdays_attended: Math.min(4, Math.max(0, Math.round(Number(item.saturdays_attended) || 0))),
				wednesdays_attended: Math.min(4, Math.max(0, Math.round(Number(item.wednesdays_attended) || 0)))
			}));
			records = (data.records || []).map((record) => ({
				...record,
				attended: record.attended ? 1 : 0
			}));
			ensureSelectedDate();
		} catch (error) {
			console.error('Failed to load attendance:', error);
			addToast(error instanceof Error ? error.message : 'Gagal memuat attendance', 'error');
		} finally {
			loading = false;
		}
	}

	async function populateRecipients() {
		if (populating) return;
		populating = true;
		try {
			const res = await fetch(`/api/batches/${batchId}/populate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.error || 'Gagal mengisi penerima batch');
			}
			addToast('Penerima batch berhasil diisi', 'success');
			await loadAttendance();
		} catch (error) {
			console.error('Failed to populate recipients:', error);
			addToast(error instanceof Error ? error.message : 'Gagal mengisi penerima batch', 'error');
		} finally {
			populating = false;
		}
	}

	async function toggleAttendance(item: AttendanceItem) {
		if (!selectedDate) {
			addToast('Pilih tanggal dulu', 'info');
			return;
		}

		const key = makeKey(attendanceType, selectedDate, item.recipient_id);
		if (savingMap[key]) return;
		const current = isPresent(item.recipient_id, attendanceType, selectedDate) ? 1 : 0;
		const next = current ? 0 : 1;
		const previousRecords = records;
		savingMap = { ...savingMap, [key]: true };
		records = upsertLocalRecord(records, item.recipient_id, attendanceType, selectedDate, next);

		try {
			const res = await fetch(`/api/batches/${batchId}/attendance`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipient_id: item.recipient_id,
					attendance_type: attendanceType,
					attendance_date: selectedDate,
					attended: next === 1
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.error || 'Gagal menyimpan attendance');
			}

			items = items.map((candidate) =>
				candidate.recipient_id === item.recipient_id
					? {
						...candidate,
						saturdays_attended: Math.min(
							4,
							Math.max(0, Math.round(Number(payload.saturdays_attended) || 0))
						),
						wednesdays_attended: Math.min(
							4,
							Math.max(0, Math.round(Number(payload.wednesdays_attended) || 0))
						),
						amount: Math.max(0, Math.round(Number(payload.amount) || candidate.amount || 0))
					}
					: candidate
			);
		} catch (error) {
			records = previousRecords;
			console.error('Failed to update attendance:', error);
			addToast(error instanceof Error ? error.message : 'Gagal menyimpan attendance', 'error');
		} finally {
			const nextSaving = { ...savingMap };
			delete nextSaving[key];
			savingMap = nextSaving;
		}
	}

	onMount(() => {
		void loadAttendance();
	});

	$effect(() => {
		attendanceType;
		currentDates;
		ensureSelectedDate();
	});
</script>

<div class="p-4 sm:p-6 max-w-7xl mx-auto">
	{#if loading}
		<div class="mb-6">
			<StatCardSkeleton />
		</div>
		<TableSkeleton rows={6} columns={4} />
	{:else if batch}
		<Breadcrumbs items={[
			{ label: 'Dashboard', href: '/finance', icon: LayoutDashboard },
			{ label: 'Batches', href: '/batches', icon: Layers },
			{ label: batch.name, href: `/batches/${batchId}` },
			{ label: 'Attendance' }
		]} />

		<div class="mb-5 fade-up">
			<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
				<div>
					<h1 class="text-2xl font-bold text-white glow-text brand-font">Attendance Sabat & Rabu Malam</h1>
					<p class="text-white/60 text-sm mt-1">Input per hari untuk transfer bulanan dan data zoom. Hitungan maksimal 4 per jenis.</p>
				</div>
				<div class="flex gap-2 flex-wrap">
					<a
						href={`/batches/${batchId}`}
						class="glass-button rounded-full px-4 py-2 text-white/80 text-sm border border-white/20"
					>
						Kembali ke Checklist
					</a>
					{#if items.length === 0}
						<button
							onclick={populateRecipients}
							disabled={populating}
							class="glass-button rounded-full px-4 py-2 text-white text-sm font-semibold bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 {populating ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-500/35'}"
						>
							<UserPlus class="w-4 h-4" />
							{populating ? 'Mengisi...' : 'Isi Semua Penerima'}
						</button>
					{/if}
				</div>
			</div>

			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
				<div class="glass-card rounded-2xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<UsersIcon class="w-3.5 h-3.5 text-white/50" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Penerima</p>
					</div>
					<p class="text-2xl font-bold text-white mt-1">{items.length}</p>
				</div>
				<div class="glass-card rounded-2xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<CalendarDays class="w-3.5 h-3.5 text-emerald-300" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Hadir ({attendanceType === 'saturday' ? 'Sabat' : 'Rabu'})</p>
					</div>
					<p class="text-2xl font-bold text-emerald-200 mt-1">{selectedPresentCount}</p>
					<p class="text-white/45 text-xs mt-1">Tanggal: {selectedDate || '-'}</p>
				</div>
				<div class="glass-card rounded-2xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<CalendarDays class="w-3.5 h-3.5 text-emerald-300" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Rata-rata Sabat</p>
					</div>
					<p class="text-2xl font-bold text-white mt-1">{avgSaturday}<span class="text-sm text-white/45">/4</span></p>
				</div>
				<div class="glass-card rounded-2xl p-4">
					<div class="flex items-center gap-2 mb-1">
						<CalendarDays class="w-3.5 h-3.5 text-sky-300" />
						<p class="text-white/60 text-xs uppercase tracking-wider">Rata-rata Rabu</p>
					</div>
					<p class="text-2xl font-bold text-white mt-1">{avgWednesday}<span class="text-sm text-white/45">/4</span></p>
				</div>
			</div>

			<div class="glass-card rounded-2xl p-4 space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<button
						onclick={() => { attendanceType = 'saturday'; }}
						class="nav-pill {attendanceType === 'saturday' ? 'nav-pill-active' : ''} border border-transparent"
					>
						Sabat
					</button>
					<button
						onclick={() => { attendanceType = 'wednesday'; }}
						class="nav-pill {attendanceType === 'wednesday' ? 'nav-pill-active' : ''} border border-transparent"
					>
						Rabu malam
					</button>
					<span class="text-white/45 text-xs">Bulan: {month}</span>
				</div>

				<div class="overflow-x-auto glass-scrollbar pb-1">
					<div class="flex items-center gap-2 min-w-max">
						{#if currentDates.length === 0}
							<span class="text-white/45 text-xs">Tidak ada tanggal untuk bulan ini.</span>
						{:else}
							{#each currentDates as dateValue}
								<button
									onclick={() => { selectedDate = dateValue; }}
									class="rounded-xl px-3 py-2 text-xs border transition-all
										{selectedDate === dateValue
											? 'bg-emerald-500/20 border-emerald-500/35 text-emerald-100'
											: 'bg-white/5 border-white/15 text-white/70 hover:border-white/30 hover:bg-white/10'}"
								>
									<div class="font-medium">{formatDateLabel(dateValue)}</div>
									<div class="text-[10px] text-white/50 mt-0.5">Hadir {countPresentByDate(attendanceType, dateValue)}/{items.length}</div>
								</button>
							{/each}
						{/if}
					</div>
				</div>

				<div class="relative">
					<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Cari nama..."
						class="glass-input rounded-full pl-9 pr-4 py-2 text-white text-sm placeholder-white/30 w-full focus:outline-none focus:ring-2 focus:ring-white/20"
					/>
				</div>
			</div>
		</div>

		{#if items.length === 0}
			<EmptyState
				icon={UsersIcon}
				title="Batch belum berisi penerima"
				description="Isi semua penerima dulu supaya attendance bisa diinput per nama."
			/>
		{:else if !selectedDate}
			<EmptyState
				icon={CalendarDays}
				title="Tanggal belum dipilih"
				description="Pilih tanggal Sabat atau Rabu malam untuk mulai input attendance."
			/>
		{:else if filteredItems.length === 0}
			<EmptyState
				icon={SearchX}
				title="Nama tidak ditemukan"
				description="Coba ubah kata kunci pencarian."
			/>
		{:else}
			<div class="space-y-2 fade-up">
				{#each filteredItems as item, i}
					{@const present = isPresent(item.recipient_id, attendanceType, selectedDate)}
					<div class="glass-card rounded-xl p-3 flex items-center gap-3">
						<div class="text-white/35 text-xs w-6 text-right">{i + 1}</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="text-white text-sm font-medium truncate">{item.recipient_name || '-'}</p>
								{#if item.transfer_to_name}
									<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-200">
										via {item.transfer_to_name}
									</span>
								{/if}
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
								<span class="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-200">
									Sabat {item.saturdays_attended}/4
								</span>
								<span class="px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-200">
									Rabu {item.wednesdays_attended}/4
								</span>
								<span class="text-white/40">{formatRupiah(item.amount)}</span>
							</div>
						</div>
						<button
							onclick={() => toggleAttendance(item)}
							disabled={isSaving(item.recipient_id)}
							class="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold border transition-all
								{present
									? 'bg-emerald-500/25 border-emerald-500/35 text-emerald-100'
									: 'bg-white/5 border-white/20 text-white/75 hover:bg-white/10 hover:border-white/30'}
								{isSaving(item.recipient_id) ? 'opacity-60 cursor-not-allowed' : ''}"
						>
							{#if isSaving(item.recipient_id)}
								Menyimpan...
							{:else if present}
								Hadir
							{:else}
								Tidak
							{/if}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<EmptyState
			icon={Layers}
			title="Batch tidak ditemukan"
			description="Batch yang Anda cari mungkin sudah dihapus."
			actionLabel="Kembali ke Batches"
			actionHref="/batches"
		/>
	{/if}
</div>
