let toasts = $state<Array<{
	id: number;
	message: string;
	type: 'success' | 'error' | 'warning' | 'info';
	duration: number;
}>>([]);

let nextId = 0;

export function addToast(
	message: string,
	type: 'success' | 'error' | 'warning' | 'info' = 'info',
	duration = 4000
) {
	const id = nextId++;
	toasts.push({ id, message, type, duration });

	// Keep max 3 visible
	if (toasts.length > 3) {
		toasts.shift();
	}

	if (duration > 0) {
		setTimeout(() => removeToast(id), duration);
	}
}

export function removeToast(id: number) {
	toasts = toasts.filter(t => t.id !== id);
}

export function getToasts() {
	return toasts;
}
