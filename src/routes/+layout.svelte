<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { signOut } from '@auth/sveltekit/client';
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Layers from '@lucide/svelte/icons/layers';
	import Users from '@lucide/svelte/icons/users';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import LogOut from '@lucide/svelte/icons/log-out';
	import User from '@lucide/svelte/icons/user';

	let { children, data } = $props();
	let pathname = $derived($page.url.pathname);
	let mobileMenuOpen = $state(false);
	let themePreference = $state<'dark' | 'light'>('dark');
	let themeReady = $state(false);
	let appliedTheme = $derived(themePreference);
	let isLight = $derived(appliedTheme === 'light');
	let session = $derived(data.session);
	let isAuthPage = $derived(pathname.startsWith('/auth/'));

	const navItems = [
		{ href: '/finance', label: 'Finance', icon: Landmark },
		{ href: '/batches', label: 'Batches', icon: Layers },
		{ href: '/recipients', label: 'Recipients', icon: Users }
	];

	function isActive(href: string) {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
	}

	function setThemePreference(next: 'dark' | 'light') {
		themePreference = next;
	}

	async function handleSignOut() {
		await signOut({ callbackUrl: '/auth/signin' });
	}

	// Close mobile menu on navigation
	$effect(() => {
		pathname;
		mobileMenuOpen = false;
	});

	$effect(() => {
		if (!browser) return;
		const saved = localStorage.getItem('theme-preference');
		if (saved === 'dark' || saved === 'light') {
			themePreference = saved;
		}
		themeReady = true;
	});

	$effect(() => {
		if (!browser || !themeReady) return;
		localStorage.setItem('theme-preference', themePreference);
		const root = document.documentElement;
		root.dataset.theme = appliedTheme;
	});
</script>

<svelte:head>
	<title>EFATA Transfer Checklist</title>
</svelte:head>

<div class="min-h-screen relative overflow-hidden {isLight ? 'text-slate-900' : 'text-slate-100'} theme-surface">
	<div class="absolute inset-0 {isLight ? 'bg-gradient-to-br from-slate-100 via-slate-200 to-sky-100' : 'bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950'}"></div>
	<div class="absolute inset-0 {isLight ? 'opacity-55 bg-[radial-gradient(circle_at_18%_8%,rgba(16,185,129,0.16),transparent_45%),radial-gradient(circle_at_80%_18%,rgba(14,165,233,0.18),transparent_40%),radial-gradient(circle_at_50%_92%,rgba(250,204,21,0.10),transparent_55%)]' : 'opacity-60 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.25),transparent_45%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.25),transparent_40%),radial-gradient(circle_at_50%_90%,rgba(250,204,21,0.15),transparent_55%)]'}"></div>
	<div class="absolute inset-0 {isLight ? 'opacity-25 bg-[linear-gradient(0deg,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)]' : 'opacity-20 bg-[linear-gradient(0deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]'} bg-[size:28px_28px]"></div>

	<nav class="relative z-20">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="h-16 flex items-center justify-between">
				<a href="/finance" class="flex items-center gap-3 text-white font-semibold tracking-wide">
					<span class="w-8 h-8 rounded-xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-emerald-200 text-xs">EF</span>
					<span class="glow-text">EFATA Transfer</span>
				</a>
				<!-- Desktop nav -->
				<div class="hidden sm:flex items-center gap-1">
					<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1">
						<button
							type="button"
							onclick={() => setThemePreference('light')}
							class="nav-pill flex items-center gap-1.5 {themePreference === 'light' ? 'nav-pill-active' : ''}"
							title="Light theme"
						>
							<Sun class="w-3.5 h-3.5" />
							Light
						</button>
						<button
							type="button"
							onclick={() => setThemePreference('dark')}
							class="nav-pill flex items-center gap-1.5 {themePreference === 'dark' ? 'nav-pill-active' : ''}"
							title="Dark theme"
						>
							<Moon class="w-3.5 h-3.5" />
							Dark
						</button>
					</div>
					{#if !isAuthPage}
					<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1">
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
					{#if session?.user}
					<div class="flex items-center gap-1 glass-dark rounded-full px-2 py-1">
						<div class="nav-pill flex items-center gap-1.5 cursor-default">
							<User class="w-3.5 h-3.5" />
							<span class="text-xs max-w-32 truncate">{session.user.email}</span>
						</div>
						<button
							type="button"
							onclick={handleSignOut}
							class="nav-pill flex items-center gap-1.5 text-red-400 hover:text-red-300"
							title="Sign out"
						>
							<LogOut class="w-3.5 h-3.5" />
						</button>
					</div>
					{/if}
					{/if}
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
					<a href="/finance" class="flex items-center gap-3 text-white font-semibold tracking-wide">
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
					<div class="glass rounded-xl p-2 mb-1">
						<p class="text-[10px] uppercase tracking-widest text-white/40 px-2 pb-2">Theme</p>
						<div class="grid grid-cols-2 gap-1">
							<button
								type="button"
								onclick={() => setThemePreference('light')}
								class="nav-pill text-xs {themePreference === 'light' ? 'nav-pill-active' : ''}"
							>
								Light
							</button>
							<button
								type="button"
								onclick={() => setThemePreference('dark')}
								class="nav-pill text-xs {themePreference === 'dark' ? 'nav-pill-active' : ''}"
							>
								Dark
							</button>
						</div>
					</div>
					{#if !isAuthPage}
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
					{#if session?.user}
					<div class="mt-4 pt-4 border-t border-white/10">
						<div class="glass rounded-xl p-3 mb-2">
							<div class="flex items-center gap-2 text-white/90">
								<User class="w-4 h-4" />
								<span class="text-xs truncate">{session.user.email}</span>
							</div>
						</div>
						<button
							type="button"
							onclick={handleSignOut}
							class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all w-full text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/25"
						>
							<LogOut class="w-4.5 h-4.5" />
							Sign Out
						</button>
					</div>
					{/if}
					{/if}
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
