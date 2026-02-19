<script lang="ts">
	import { signIn } from '@auth/sveltekit/client';
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/button/button.svelte';
	import Card from '$lib/components/ui/card/card.svelte';
	import CardContent from '$lib/components/ui/card/card-content.svelte';
	import CardDescription from '$lib/components/ui/card/card-description.svelte';
	import CardHeader from '$lib/components/ui/card/card-header.svelte';
	import CardTitle from '$lib/components/ui/card/card-title.svelte';

	const callbackUrl = $page.url.searchParams.get('callbackUrl') || '/';
	const error = $page.url.searchParams.get('error');

	let isLoading = $state(false);

	async function handleGoogleSignIn() {
		isLoading = true;
		await signIn('google', { callbackUrl });
	}
</script>

<svelte:head>
	<title>Sign In - Efata Financials</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<Card class="w-full max-w-md">
		<CardHeader class="space-y-1 text-center">
			<CardTitle class="text-2xl font-bold">Welcome to Efata Financials</CardTitle>
			<CardDescription>Sign in with your authorized Google account</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if error}
				<div
					class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
				>
					<p class="text-sm font-medium">Access Denied</p>
					<p class="text-sm mt-1">
						{#if error === 'Callback'}
							Your email is not authorized to access this application.
						{:else if error === 'Configuration'}
							Authentication is not properly configured.
						{:else}
							An error occurred during sign in. Please try again.
						{/if}
					</p>
				</div>
			{/if}

			<Button
				onclick={handleGoogleSignIn}
				disabled={isLoading}
				class="w-full h-12 text-base"
				variant="outline"
			>
				{#if isLoading}
					<svg
						class="animate-spin -ml-1 mr-3 h-5 w-5"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					Signing in...
				{:else}
					<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
						<path
							fill="currentColor"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="currentColor"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="currentColor"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="currentColor"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					Continue with Google
				{/if}
			</Button>

			<p class="text-xs text-center text-gray-600 dark:text-gray-400 mt-4">
				Only authorized email addresses can access this application.
			</p>
		</CardContent>
	</Card>
</div>
