// Focus a search input with "/" or Cmd/Ctrl+K from anywhere on the page;
// Escape inside it clears the text (first press) and then leaves the field.

/** "⌘K" on Apple devices, "Ctrl K" elsewhere — for the hint shown in the field. */
export function searchShortcutLabel(): string {
	if (typeof navigator === 'undefined') return '/';
	return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	);
}

export function searchShortcut(input: HTMLInputElement, onClear?: () => void) {
	function onWindowKeydown(e: KeyboardEvent) {
		const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k';
		const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
		if (!cmdK && !slash) return;
		// Leave the shortcut alone while a dialog is open
		if (document.querySelector('[role="dialog"]')) return;
		e.preventDefault();
		input.focus();
		input.select();
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (input.value) {
			e.preventDefault();
			onClear?.();
		} else {
			input.blur();
		}
	}

	window.addEventListener('keydown', onWindowKeydown);
	input.addEventListener('keydown', onInputKeydown);
	return {
		update(next?: () => void) {
			onClear = next;
		},
		destroy() {
			window.removeEventListener('keydown', onWindowKeydown);
			input.removeEventListener('keydown', onInputKeydown);
		}
	};
}
