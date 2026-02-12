<script lang="ts">
	import type { Recipient } from '$lib/types.js';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Video from '@lucide/svelte/icons/video';
	import VideoOff from '@lucide/svelte/icons/video-off';
	import Users2 from '@lucide/svelte/icons/users-2';
	import UserX from '@lucide/svelte/icons/user-x';

	let {
		recipient = undefined,
		recipients = [],
		onSubmit,
		onCancel
	}: {
		recipient?: Recipient;
		recipients: Recipient[];
		onSubmit: (data: Partial<Recipient>) => void;
		onCancel: () => void;
	} = $props();

	let formData = $state({
		name: recipient?.name || '',
		bank_name: recipient?.bank_name || '',
		account_number: recipient?.account_number || '',
		whatsapp: recipient?.whatsapp || '',
		keterangan: recipient?.keterangan || '',
		transfer_to_id: recipient?.transfer_to_id || 0,
		zoom_eligible: recipient?.zoom_eligible ?? 1,
		family_group_id: recipient?.family_group_id ?? null as number | null
	});

	// Get unique family groups from recipients
	let familyGroups = $derived(() => {
		const groups = new Map<number, string[]>();
		for (const r of recipients) {
			if (r.family_group_id && r.id !== recipient?.id) {
				if (!groups.has(r.family_group_id)) {
					groups.set(r.family_group_id, []);
				}
				groups.get(r.family_group_id)!.push(r.name);
			}
		}
		return groups;
	});

	// Family members in the selected group (excluding current recipient)
	let selectedFamilyMembers = $derived(() => {
		if (!formData.family_group_id) return [];
		return recipients.filter(r => r.family_group_id === formData.family_group_id && r.id !== recipient?.id).map(r => r.name);
	});

	let errors = $state<Record<string, string>>({});
	let touched = $state<Record<string, boolean>>({});

	function validate(): boolean {
		errors = {};
		if (!formData.name.trim()) errors.name = 'Nama wajib diisi';
		if (formData.whatsapp && !/^(0|62|\+62)\d{8,}$/.test(formData.whatsapp.replace(/[\s\-]/g, '')))
			errors.whatsapp = 'Format nomor tidak valid (08xx atau 628xx)';
		if (formData.account_number && formData.account_number.trim().length < 5)
			errors.account_number = 'Nomor rekening minimal 5 digit';
		return Object.keys(errors).length === 0;
	}

	function handleSubmit() {
		touched = { name: true, whatsapp: true, account_number: true };
		if (!validate()) return;
		onSubmit({
			name: formData.name.trim(),
			bank_name: formData.bank_name.trim() || undefined,
			account_number: formData.account_number.trim() || undefined,
			whatsapp: formData.whatsapp.trim() || undefined,
			keterangan: formData.keterangan.trim() || undefined,
			transfer_to_id: formData.transfer_to_id || undefined,
			zoom_eligible: formData.zoom_eligible,
			family_group_id: formData.family_group_id
		});
	}

	function fieldClass(field: string): string {
		const base = 'w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 transition-colors';
		if (touched[field] && errors[field]) return `${base} focus:ring-red-500/40 border-red-500/30`;
		return `${base} focus:ring-emerald-500/30`;
	}
</script>

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<div>
			<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Nama *</label>
			<input
				type="text"
				bind:value={formData.name}
				class={fieldClass('name')}
				placeholder="Nama lengkap"
				onblur={() => { touched.name = true; validate(); }}
				required
			/>
			{#if touched.name && errors.name}
				<p class="flex items-center gap-1 text-red-400 text-xs mt-1">
					<CircleAlert class="w-3 h-3" />
					{errors.name}
				</p>
			{/if}
		</div>
		<div>
			<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Bank</label>
			<select
				bind:value={formData.bank_name}
				class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-transparent"
			>
				<option value="">-- Pilih Bank --</option>
				<option value="BCA">BCA</option>
				<option value="BRI">BRI</option>
				<option value="Mandiri">Mandiri</option>
				<option value="Dana">Dana</option>
				<option value="OVO">OVO</option>
				<option value="GoPay">GoPay</option>
			</select>
		</div>
		<div>
			<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">No. Rekening / No. HP</label>
			<input
				type="text"
				bind:value={formData.account_number}
				class={fieldClass('account_number')}
				placeholder="Nomor rekening atau HP"
				onblur={() => { touched.account_number = true; validate(); }}
			/>
			{#if touched.account_number && errors.account_number}
				<p class="flex items-center gap-1 text-red-400 text-xs mt-1">
					<CircleAlert class="w-3 h-3" />
					{errors.account_number}
				</p>
			{/if}
		</div>
		<div>
			<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">WhatsApp</label>
			<input
				type="text"
				bind:value={formData.whatsapp}
				class={fieldClass('whatsapp')}
				placeholder="08xx atau 628xx"
				onblur={() => { touched.whatsapp = true; validate(); }}
			/>
			{#if touched.whatsapp && errors.whatsapp}
				<p class="flex items-center gap-1 text-red-400 text-xs mt-1">
					<CircleAlert class="w-3 h-3" />
					{errors.whatsapp}
				</p>
			{/if}
		</div>
		<div>
			<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Keterangan</label>
			<input
				type="text"
				bind:value={formData.keterangan}
				class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
				placeholder="Catatan"
			/>
		</div>
		<div>
			<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Transfer ke</label>
			<select
				bind:value={formData.transfer_to_id}
				class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-transparent"
			>
				<option value={0}>-- Rekening Sendiri --</option>
				{#each recipients.filter(r => r.id !== recipient?.id && r.bank_name) as r}
					<option value={r.id}>{r.name} ({r.bank_name} {r.account_number})</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Zoom & Family Settings -->
	<div class="border-t border-white/5 pt-4">
		<p class="text-white/50 text-xs uppercase tracking-wider mb-3">Pengaturan Zoom & Keluarga</p>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<!-- Zoom Eligible Toggle -->
			<div>
				<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Zoom Eligible</label>
				<button
					type="button"
					onclick={() => { formData.zoom_eligible = formData.zoom_eligible ? 0 : 1; }}
					class="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all {formData.zoom_eligible ? 'glass-input border border-violet-500/30 bg-violet-500/10' : 'glass-input border border-white/10 opacity-60'}"
				>
					{#if formData.zoom_eligible}
						<Video class="w-4 h-4 text-violet-400" />
						<span class="text-violet-200 text-sm font-medium">Dapat Uang Zoom</span>
					{:else}
						<VideoOff class="w-4 h-4 text-white/40" />
						<span class="text-white/40 text-sm">Tidak Dapat Zoom</span>
					{/if}
				</button>
			</div>

			<!-- Family Group -->
			<div>
				<label class="block text-white/70 text-xs uppercase tracking-wider mb-1.5">Keluarga</label>
				<select
					bind:value={formData.family_group_id}
					class="w-full glass-input rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 bg-transparent"
				>
					<option value={null}>-- Sendiri (bukan keluarga) --</option>
					{#each [...familyGroups().entries()] as [groupId, members]}
						<option value={groupId}>Keluarga: {members.join(' & ')}</option>
					{/each}
					<option value={-1}>+ Buat Grup Keluarga Baru</option>
				</select>
				{#if selectedFamilyMembers().length > 0}
					<p class="text-amber-300/70 text-xs mt-1.5 flex items-center gap-1">
						<Users2 class="w-3 h-3" />
						Satu keluarga dengan: {selectedFamilyMembers().join(', ')}
					</p>
				{/if}
				{#if formData.family_group_id === -1}
					<p class="text-amber-300/70 text-xs mt-1.5">
						Grup baru akan dibuat. Tambahkan anggota lain ke grup ini setelah menyimpan.
					</p>
				{/if}
			</div>
		</div>

		{#if formData.zoom_eligible && formData.family_group_id}
			<div class="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
				<p class="text-amber-200/80 text-xs">
					<span class="font-medium">Zoom Keluarga:</span> Rate per orang Rp 30.000 (bukan Rp 50.000 untuk sendiri)
				</p>
			</div>
		{:else if formData.zoom_eligible && !formData.family_group_id}
			<div class="mt-3 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
				<p class="text-violet-200/80 text-xs">
					<span class="font-medium">Zoom Sendiri:</span> Rate Rp 50.000
				</p>
			</div>
		{/if}
	</div>

	<div class="flex gap-3 justify-end pt-2">
		<button type="button" onclick={onCancel} class="glass-button rounded-xl px-4 py-2.5 text-white/80 text-sm">
			Batal
		</button>
		<button type="submit" class="glass-button rounded-xl px-5 py-2.5 text-white text-sm font-semibold bg-indigo-500/30 hover:bg-indigo-500/50">
			{recipient ? 'Update' : 'Tambah'}
		</button>
	</div>
</form>
