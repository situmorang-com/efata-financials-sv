<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/button/button.svelte';
	import Card from '$lib/components/ui/card/card.svelte';
	import CardContent from '$lib/components/ui/card/card-content.svelte';
	import CardDescription from '$lib/components/ui/card/card-description.svelte';
	import CardFooter from '$lib/components/ui/card/card-footer.svelte';
	import CardHeader from '$lib/components/ui/card/card-header.svelte';
	import CardTitle from '$lib/components/ui/card/card-title.svelte';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';

	const error = $page.url.searchParams.get('error');
</script>

<svelte:head>
	<title>Authentication Error - Efata Financials</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<Card class="w-full max-w-md">
		<CardHeader class="space-y-1 text-center">
			<div class="flex justify-center mb-4">
				<div class="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
					<AlertCircle class="w-8 h-8 text-red-600 dark:text-red-400" />
				</div>
			</div>
			<CardTitle class="text-2xl font-bold">Access Denied</CardTitle>
			<CardDescription>Unable to authenticate your account</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div
				class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
			>
				<p class="text-sm text-red-800 dark:text-red-200">
					{#if error === 'AccessDenied'}
						Your email address is not authorized to access this application. Please contact an
						administrator if you believe this is an error.
					{:else if error === 'Configuration'}
						There is a configuration issue with the authentication system. Please contact support.
					{:else if error === 'Verification'}
						The verification link has expired or has already been used.
					{:else}
						An unexpected error occurred during authentication. Please try again later.
					{/if}
				</p>
			</div>

			<div class="text-sm text-gray-600 dark:text-gray-400">
				<p class="font-medium mb-2">Authorized users:</p>
				<ul class="list-disc list-inside space-y-1 ml-2">
					<li>edmundsitumorang@gmail.com</li>
					<li>situmeangirhen@gmail.com</li>
				</ul>
			</div>
		</CardContent>
		<CardFooter>
			<Button href="/auth/signin" class="w-full">Try Again</Button>
		</CardFooter>
	</Card>
</div>
