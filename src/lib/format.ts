export function formatRupiah(amount: number | null | undefined): string {
	const safe = Number.isFinite(Number(amount)) ? Number(amount) : 0;
	return 'Rp ' + safe.toLocaleString('id-ID');
}

export function cleanPhoneForWhatsApp(phone: string): string {
	if (!phone) return '';
	let cleaned = phone.replace(/[\s\-\(\)]/g, '');
	if (cleaned.startsWith('08')) {
		cleaned = '62' + cleaned.slice(1);
	} else if (cleaned.startsWith('+')) {
		cleaned = cleaned.slice(1);
	}
	return cleaned;
}

export function generateWhatsAppMessage(
	name: string,
	amount: number,
	details?: {
		saturdays_attended: number;
		wednesdays_attended?: number;
		transport_rate: number;
		zoom_type: 'none' | 'single' | 'family' | 'custom';
		zoom_amount: number;
	},
	proofUrl?: string,
	transferInfo?: {
		is_family_transfer?: boolean;
		transfer_to_name?: string;
		actual_bank_name?: string;
		actual_account_number?: string;
		family_member_names?: string[];
		family_total_transfer?: number;
		batch_label?: string;
		family_member_details?: Array<{
			name: string;
			saturdays_attended?: number;
			zoom_sessions?: number;
			zoom_label?: string;
		}>;
	}
): string {
	const isFamilyTransfer = !!transferInfo?.is_family_transfer;
	const payeeName = transferInfo?.transfer_to_name?.trim() || name;
	const accountBank = transferInfo?.actual_bank_name?.trim() || '';
	const accountNumber = transferInfo?.actual_account_number?.trim() || '';
	const accountLabel =
		accountBank || accountNumber
			? `${accountBank}${accountBank && accountNumber ? ' ' : ''}${accountNumber}`.trim()
			: '';
	const familyMembers = Array.from(
		new Set(
			(transferInfo?.family_member_names || [])
				.map((member) => String(member || '').trim())
				.filter(Boolean)
		)
	);
	const otherFamilyMembers = familyMembers.filter(
		(member) => member.toLowerCase() !== name.toLowerCase()
	);
	const familyTotalTransfer = Math.max(
		0,
		Math.round(Number(transferInfo?.family_total_transfer) || 0)
	);
	const batchLabel = transferInfo?.batch_label?.trim() || 'bulan ini';
	const familyMemberDetails = (transferInfo?.family_member_details || []).filter(
		(member) => member?.name?.trim()
	);

	if (isFamilyTransfer) {
		const lines = [
			`Halo ${payeeName},`,
			'',
			`✅ Transfer bantuan Tuli EFATA ${batchLabel} sudah dilakukan.`
		];
		lines.push('');
		lines.push('☑️ Transfer keluarga (1 rekening):');
		lines.push(`➡️ Melalui: ${payeeName}`);
		if (accountLabel) {
			lines.push(`➡️ Rekening tujuan: ${accountLabel}`);
		}
		if (otherFamilyMembers.length > 0) {
			lines.push(`➡️ Anggota lain: ${otherFamilyMembers.join(', ')}`);
		} else if (familyMembers.length > 1) {
			lines.push(`➡️ Anggota keluarga: ${familyMembers.join(', ')}`);
		}
		lines.push(
			`✅ Total transfer ke rekening ini: ${formatRupiah(
				familyTotalTransfer > 0 ? familyTotalTransfer : amount
			)}`
		);
		if (familyMemberDetails.length > 0) {
			lines.push('');
			lines.push('📋 Kehadiran:');
			for (const member of familyMemberDetails) {
				lines.push(`- ${member.name}`);
				if (Number.isFinite(Number(member.saturdays_attended))) {
					lines.push(`↳ ${Math.max(0, Math.round(Number(member.saturdays_attended) || 0))} sabat`);
				}
				if (
					(member.zoom_sessions && member.zoom_sessions > 0) ||
					member.zoom_label
				) {
					const sessions = Math.max(0, Math.round(Number(member.zoom_sessions) || 0));
					if (sessions > 0) {
						lines.push(`↳ ${sessions} rabu malam (${member.zoom_label || 'zoom'})`);
					} else if (member.zoom_label) {
						lines.push(`↳ ${member.zoom_label}`);
					}
				}
			}
		}
		lines.push('');
		lines.push('Mohon dicek ya.');
		lines.push('Terima kasih. Tuhan memberkati.');

		if (proofUrl) {
			lines.push('');
			lines.push(`✅ Bukti transfer: ${proofUrl}`);
		}

		return lines.join('\n');
	}

	if (details && (details.saturdays_attended > 0 || details.zoom_type !== 'none')) {
		const transportTotal = details.saturdays_attended * details.transport_rate;
		const lines = [
			`Halo ${name},`,
			'',
			`✅ Transfer bantuan Tuli EFATA ${batchLabel} sudah dilakukan.`,
			'',
			'☑️ Transfer perorangan:'
		];

		if (accountLabel) {
			lines.push(`➡️ Rekening tujuan: ${accountLabel}`);
		} else {
			lines.push('➡️ Rekening tujuan: rekening Anda');
		}
		lines.push(`✅ Total transfer ke rekening ini: ${formatRupiah(amount)}`);

		lines.push('');
		lines.push('📋 Kehadiran:');
		lines.push(`- ${name}`);
		if (details.saturdays_attended > 0) {
			lines.push(`↳ ${details.saturdays_attended} sabat`);
		}
		if (details.zoom_type !== 'none') {
			const zoomLabel =
				details.zoom_type === 'single'
					? 'zoom'
					: details.zoom_type === 'family'
						? 'zoom'
						: 'zoom';
			const zoomSessions = Math.max(
				0,
				Number(details.wednesdays_attended ?? details.saturdays_attended) || 0
			);
			if (zoomSessions > 0) {
				lines.push(`↳ ${zoomSessions} rabu malam (${zoomLabel})`);
			}
		}

		lines.push('');
		lines.push('Mohon dicek ya.');
		lines.push('Terima kasih. Tuhan memberkati.');

		if (proofUrl) {
			lines.push('');
			lines.push(`✅ Bukti transfer: ${proofUrl}`);
		}

		return lines.join('\n');
	}
	const accountSentence = accountLabel
		? `➡️ Rekening tujuan: ${accountLabel}`
		: '➡️ Rekening tujuan: rekening Anda';
	let msg = `Halo ${name},\n\n✅ Dana Tuli EFATA sebesar *${formatRupiah(amount)}* sudah ditransfer.\n${accountSentence}`;
	msg += '\nMohon dicek ya.\nTerima kasih. Tuhan memberkati.';
	if (proofUrl) {
		msg += `\n\n✅ Bukti transfer: ${proofUrl}`;
	}
	return msg;
}

export function generateWhatsAppUrl(
	phone: string,
	name: string,
	amount: number,
	details?: {
		saturdays_attended: number;
		wednesdays_attended?: number;
		transport_rate: number;
		zoom_type: 'none' | 'single' | 'family' | 'custom';
		zoom_amount: number;
	},
	proofUrl?: string,
	transferInfo?: {
		is_family_transfer?: boolean;
		transfer_to_name?: string;
		actual_bank_name?: string;
		actual_account_number?: string;
		family_member_names?: string[];
		family_total_transfer?: number;
		batch_label?: string;
		family_member_details?: Array<{
			name: string;
			saturdays_attended?: number;
			zoom_sessions?: number;
			zoom_label?: string;
		}>;
	}
): string {
	const cleanPhone = cleanPhoneForWhatsApp(phone);
	const message = generateWhatsAppMessage(name, amount, details, proofUrl, transferInfo);
	return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
}

export function formatDate(dateString: string): string {
	const date = new Date(dateString);
	return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateString: string): string {
	const date = new Date(dateString);
	return date.toLocaleString('id-ID', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
