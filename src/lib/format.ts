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
		transport_rate: number;
		zoom_type: 'none' | 'single' | 'family';
		zoom_amount: number;
	},
	proofUrl?: string
): string {
	if (details && (details.saturdays_attended > 0 || details.zoom_type !== 'none')) {
		const transportTotal = details.saturdays_attended * details.transport_rate;
		const lines = [`Halo ${name}, dana Tuli EFATA bulan ini:`];

		if (details.saturdays_attended > 0) {
			lines.push(`- Transport ${details.saturdays_attended} Sabat x ${formatRupiah(details.transport_rate)} = ${formatRupiah(transportTotal)}`);
		}
		if (details.zoom_type !== 'none') {
			const zoomLabel = details.zoom_type === 'single' ? 'sendiri' : 'keluarga';
			lines.push(`- Zoom (${zoomLabel}) = ${formatRupiah(details.zoom_amount)}`);
		}

		lines.push(`- *Total: ${formatRupiah(amount)}*`);
		lines.push(`sudah ditransfer ke rekening Anda. Mohon dicek. Terima kasih. GBU`);

		if (proofUrl) {
			lines.push('');
			lines.push(`Bukti transfer: ${proofUrl}`);
		}

		return lines.join('\n');
	}
	let msg = `Halo ${name}, dana Tuli EFATA sebesar ${formatRupiah(amount)} sudah ditransfer ke rekening Anda. Mohon dicek. Terima kasih. GBU`;
	if (proofUrl) {
		msg += `\n\nBukti transfer: ${proofUrl}`;
	}
	return msg;
}

export function generateWhatsAppUrl(
	phone: string,
	name: string,
	amount: number,
	details?: {
		saturdays_attended: number;
		transport_rate: number;
		zoom_type: 'none' | 'single' | 'family';
		zoom_amount: number;
	},
	proofUrl?: string
): string {
	const cleanPhone = cleanPhoneForWhatsApp(phone);
	const message = generateWhatsAppMessage(name, amount, details, proofUrl);
	return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
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
