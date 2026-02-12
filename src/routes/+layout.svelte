<script lang="ts">
	import { page } from '$app/stores';
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Layers from '@lucide/svelte/icons/layers';
	import Users from '@lucide/svelte/icons/users';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';

	let { children } = $props();
	let pathname = $derived($page.url.pathname);
	let mobileMenuOpen = $state(false);

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/batches', label: 'Batches', icon: Layers },
		{ href: '/recipients', label: 'Recipients', icon: Users }
	];

	function isActive(href: string) {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
	}

	// Close mobile menu on navigation
	$effect(() => {
		pathname;
		mobileMenuOpen = false;
	});
</script>

<svelte:head>
	<title>EFATA Transfer Checklist</title>
</svelte:head>

<div class="min-h-screen relative overflow-hidden text-slate-100">
	<div class="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950"></div>
	<div class="absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.25),transparent_45%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.25),transparent_40%),radial-gradient(circle_at_50%_90%,rgba(250,204,21,0.15),transparent_55%)]"></div>
	<div class="absolute inset-0 opacity-20 bg-[linear-gradient(0deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px]"></div>

	<nav class="relative z-20">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="h-16 flex items-center justify-between">
				<a href="/" class="flex items-center gap-3 text-white font-semibold tracking-wide">
					<span class="w-8 h-8 rounded-xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-emerald-200 text-xs">EF</span>
					<span class="glow-text">EFATA Transfer</span>
				</a>
				<!-- Desktop nav -->
				<div class="hidden sm:flex items-center gap-1 glass-dark rounded-full px-2 py-1">
					{#each navItems as item}
						<a
							href={item.href}
							class="nav-pill flex items-center gap-1.5 {isActive(item.href) ? 'nav-pill-active' : ''}"
						>
							<item.icon class="w-3.5 h-3.5" />
							{item.label}
						</a>
					{/each}
				</div>
				<!-- Mobile hamburger -->
				<button
					onclick={() => { mobileMenuOpen = true; }}
					class="sm:hidden glass-dark rounded-xl p-2 text-white/70 hover:text-white transition-colors"
				>
					<Menu class="w-5 h-5" />
				</button>
			</div>
		</div>
	</nav>

	<!-- Mobile drawer overlay -->
	{#if mobileMenuOpen}
		<div class="fixed inset-0 z-40 sm:hidden">
			<!-- Backdrop -->
			<button
				class="absolute inset-0 bg-black/60 backdrop-blur-sm mobile-overlay-enter"
				onclick={() => { mobileMenuOpen = false; }}
				aria-label="Close menu"
			></button>
			<!-- Drawer -->
			<nav class="absolute left-0 top-0 bottom-0 w-72 glass-dark border-r border-white/10 mobile-drawer-enter flex flex-col">
				<div class="h-16 flex items-center justify-between px-5">
					<a href="/" class="flex items-center gap-3 text-white font-semibold tracking-wide">
						<span class="w-8 h-8 rounded-xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-emerald-200 text-xs">EF</span>
						<span class="glow-text text-sm">EFATA Transfer</span>
					</a>
					<button
						onclick={() => { mobileMenuOpen = false; }}
						class="text-white/50 hover:text-white transition-colors rounded-lg p-1"
					>
						<X class="w-5 h-5" />
					</button>
				</div>
				<div class="flex flex-col gap-1 px-3 mt-2">
					{#each navItems as item}
						<a
							href={item.href}
							class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all
								{isActive(item.href)
									? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-200'
									: 'text-white/70 hover:bg-white/5 hover:text-white border border-transparent'
								}"
						>
							<item.icon class="w-4.5 h-4.5" />
							{item.label}
						</a>
					{/each}
				</div>
			</nav>
		</div>
	{/if}

	<main class="relative z-10">
		{@render children?.()}
	</main>
</div>

<Toast />
<ConfirmDialog />

<style>
	.mobile-overlay-enter {
		animation: fadeIn 200ms ease both;
	}
	.mobile-drawer-enter {
		animation: slideInLeft 250ms ease both;
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes slideInLeft {
		from { transform: translateX(-100%); }
		to { transform: translateX(0); }
	}
</style>
