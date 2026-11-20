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

/**
 * The zoom line under a person's attendance. Zoom pay is a flat monthly amount,
 * so it is shown whenever the person gets it, with the Wednesday evenings
 * attended when those were recorded: "↳ zoom Rp 50.000 (4 rabu malam)".
 */
function zoomLine(amount: number, sessions: number): string | null {
	const pay = Math.max(0, Math.round(Number(amount) || 0));
	const count = Math.max(0, Math.round(Number(sessions) || 0));
	if (pay <= 0 && count <= 0) return null;
	const parts = ['zoom'];
	if (pay > 0) parts.push(formatRupiah(pay));
	if (count > 0) parts.push(`(${count} rabu malam)`);
	return `↳ ${parts.join(' ')}`;
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
		/** Name on the account when it isn't the recipient's own (an outside holder). */
		account_holder_name?: string;
		/** What the account holder is to the recipient, e.g. "Anak". */
		account_holder_relation?: string;
		family_member_names?: string[];
		family_total_transfer?: number;
		batch_label?: string;
		family_member_details?: Array<{
			name: string;
			saturdays_attended?: number;
			zoom_sessions?: number;
			zoom_label?: string;
			/** Zoom pay for this member this month (a flat amount, not per session). */
			zoom_amount?: number;
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
	// Who the money actually went to, when it isn't the recipient's own account:
	// an outside holder recorded on the recipient, else the recipient it is sent
	// through ("Transfer ke"). With the relationship, e.g. "Joanita Paulina (Anak)".
	const holderName =
		transferInfo?.account_holder_name?.trim() ||
		(payeeName.toLowerCase() !== name.trim().toLowerCase() ? payeeName : '');
	const holderRelation = transferInfo?.account_holder_relation?.trim() || '';
	const viaLabel = holderName ? `${holderName}${holderRelation ? ` (${holderRelation})` : ''}` : '';
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
		lines.push(`➡️ Melalui: ${viaLabel || payeeName}`);
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
				const zoom = zoomLine(member.zoom_amount ?? 0, member.zoom_sessions ?? 0);
				if (zoom) {
					lines.push(zoom);
				} else if (member.zoom_label) {
					lines.push(`↳ ${member.zoom_label}`);
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
		if (viaLabel) {
			lines.push(`➡️ Melalui: ${viaLabel}`);
		}
		lines.push(`✅ Total transfer ke rekening ini: ${formatRupiah(amount)}`);

		lines.push('');
		lines.push('📋 Kehadiran:');
		lines.push(`- ${name}`);
		if (details.saturdays_attended > 0) {
			lines.push(`↳ ${details.saturdays_attended} sabat`);
		}
		if (details.zoom_type !== 'none') {
			const zoom = zoomLine(details.zoom_amount, details.wednesdays_attended ?? 0);
			if (zoom) lines.push(zoom);
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
	if (viaLabel) {
		msg += `\n➡️ Melalui: ${viaLabel}`;
	}
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
		/** Name on the account when it isn't the recipient's own (an outside holder). */
		account_holder_name?: string;
		/** What the account holder is to the recipient, e.g. "Anak". */
		account_holder_relation?: string;
		family_member_names?: string[];
		family_total_transfer?: number;
		batch_label?: string;
		family_member_details?: Array<{
			name: string;
			saturdays_attended?: number;
			zoom_sessions?: number;
			zoom_label?: string;
			/** Zoom pay for this member this month (a flat amount, not per session). */
			zoom_amount?: number;
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

/**
 * WhatsApp message to the cash distributor once the batch's cash was sent to
 * them: what arrived, and who to hand it to (one line per hand-over, a family's
 * members under it), with the receipt.
 */
export function generateCashPayoutMessage(payout: {
	distributorName: string;
	batchLabel: string;
	bankName: string;
	accountNumber: string;
	amount: number;
	groups: Array<{ receiverName: string; amount: number; members: Array<{ name: string; amount: number }> }>;
	proofUrl?: string;
}): string {
	const account = `${payout.bankName} ${payout.accountNumber}`.trim();
	const lines = [
		`Halo ${payout.distributorName},`,
		'',
		`✅ Transfer dana tunai bantuan Tuli EFATA ${payout.batchLabel || 'bulan ini'} sudah dilakukan.`
	];
	if (account) lines.push(`➡️ Rekening tujuan: ${account}`);
	lines.push(`✅ Total transfer: ${formatRupiah(payout.amount)}`);
	if (payout.groups.length > 0) {
		lines.push('', '📋 Mohon dibagikan ke:');
		for (const group of payout.groups) {
			lines.push(`- ${group.receiverName}: ${formatRupiah(group.amount)}`);
			if (group.members.length > 1) {
				for (const member of group.members) {
					lines.push(`↳ ${member.name}: ${formatRupiah(member.amount)}`);
				}
			}
		}
	}
	lines.push('', 'Mohon dicek ya.', 'Terima kasih. Tuhan memberkati.');
	if (payout.proofUrl) lines.push('', `✅ Bukti transfer: ${payout.proofUrl}`);
	return lines.join('\n');
}

export function generateCashPayoutWhatsAppUrl(
	phone: string,
	payout: Parameters<typeof generateCashPayoutMessage>[0]
): string {
	const text = encodeURIComponent(generateCashPayoutMessage(payout));
	return `https://api.whatsapp.com/send?phone=${cleanPhoneForWhatsApp(phone)}&text=${text}`;
}
