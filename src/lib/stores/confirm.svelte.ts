export type ConfirmOptions = {
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: 'danger' | 'warning' | 'default';
};

let dialogOpen = $state(false);
let dialogOptions = $state<ConfirmOptions>({
	title: '',
	description: '',
	confirmLabel: 'Konfirmasi',
	cancelLabel: 'Batal',
	variant: 'default'
});
let resolvePromise: ((value: boolean) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	dialogOptions = {
		confirmLabel: 'Konfirmasi',
		cancelLabel: 'Batal',
		variant: 'default',
		...options
	};
	dialogOpen = true;

	return new Promise<boolean>((resolve) => {
		resolvePromise = resolve;
	});
}

export function getConfirmState() {
	return {
		get open() { return dialogOpen; },
		set open(val: boolean) { dialogOpen = val; },
		get options() { return dialogOptions; }
	};
}

export function handleConfirm() {
	dialogOpen = false;
	resolvePromise?.(true);
	resolvePromise = null;
}

export function handleCancel() {
	dialogOpen = false;
	resolvePromise?.(false);
	resolvePromise = null;
}
