<script lang="ts">
	import { onMount } from "svelte";

	interface Props {
		onclose: () => void;
	}
	let { onclose }: Props = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	type TreeNode = { name: string; path: string; type: "file" | "dir"; children?: TreeNode[] };

	let tree = $state<TreeNode[]>([]);
	let selectedPath = $state<string | null>(null);
	let fileContent = $state("");
	let originalContent = $state("");
	let loading = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let treeLoading = $state(true);
	let error = $state<string | null>(null);
	let newItemPath = $state("");
	let newItemType = $state<"file" | "dir">("file");
	let showNewItem = $state(false);
	let expandedDirs = $state<Set<string>>(new Set());
	let statusMsg = $state<string | null>(null);

	const BRIDGE = "/workspace";

	// ── API helpers ────────────────────────────────────────────────────────────
	async function loadTree() {
		treeLoading = true;
		error = null;
		try {
			const r = await fetch(`${BRIDGE}/tree`);
			const d = await r.json();
			if (d.success) tree = d.tree;
			else error = d.error;
		} catch (e) {
			error = "Cannot reach workspace API. Is mcp-bridge running?";
		} finally {
			treeLoading = false;
		}
	}

	async function openFile(path: string) {
		if (selectedPath === path) return;
		loading = true;
		error = null;
		try {
			const r = await fetch(`${BRIDGE}/file?path=${encodeURIComponent(path)}`);
			const d = await r.json();
			if (d.success) {
				selectedPath = path;
				fileContent = d.content;
				originalContent = d.content;
			} else {
				error = d.error;
			}
		} catch (e) {
			error = String(e);
		} finally {
			loading = false;
		}
	}

	async function saveFile() {
		if (!selectedPath) return;
		saving = true;
		error = null;
		try {
			const r = await fetch(`${BRIDGE}/file`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: selectedPath, content: fileContent }),
			});
			const d = await r.json();
			if (d.success) {
				originalContent = fileContent;
				flash("Saved ✓");
			} else {
				error = d.error;
			}
		} catch (e) {
			error = String(e);
		} finally {
			saving = false;
		}
	}

	async function deleteItem(path: string, type: "file" | "dir") {
		const label = type === "dir" ? `folder "${path}" and all its contents` : `"${path}"`;
		if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
		error = null;
		try {
			const r = await fetch(`${BRIDGE}/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
			const d = await r.json();
			if (d.success) {
				if (selectedPath === path || selectedPath?.startsWith(path + "/")) {
					selectedPath = null;
					fileContent = "";
					originalContent = "";
				}
				await loadTree();
				flash("Deleted ✓");
			} else {
				error = d.error;
			}
		} catch (e) {
			error = String(e);
		}
	}

	async function deleteFile() {
		if (!selectedPath) return;
		await deleteItem(selectedPath, "file");
	}

	function exportFile() {
		if (!selectedPath || !fileContent) return;
		const filename = selectedPath.split("/").pop() ?? "file.txt";
		const blob = new Blob([fileContent], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
		flash("Exported ✓");
	}

	async function createItem() {
		if (!newItemPath.trim()) return;
		const path = newItemPath.trim();
		try {
			if (newItemType === "dir") {
				const r = await fetch(`${BRIDGE}/mkdir`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path }),
				});
				const d = await r.json();
				if (!d.success) { error = d.error; return; }
			} else {
				const r = await fetch(`${BRIDGE}/file`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path, content: "" }),
				});
				const d = await r.json();
				if (!d.success) { error = d.error; return; }
			}
			newItemPath = "";
			showNewItem = false;
			await loadTree();
			if (newItemType === "file") openFile(path);
		} catch (e) {
			error = String(e);
		}
	}

	function flash(msg: string) {
		statusMsg = msg;
		setTimeout(() => (statusMsg = null), 2000);
	}

	function toggleDir(path: string) {
		const next = new Set(expandedDirs);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		expandedDirs = next;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			saveFile();
		}
		if (e.key === "Escape") onclose();
	}

	let isDirty = $derived(fileContent !== originalContent);

	// language hint for syntax colouring (basic)
	let lang = $derived(
		selectedPath?.endsWith(".ts") || selectedPath?.endsWith(".tsx") ? "typescript"
		: selectedPath?.endsWith(".js") || selectedPath?.endsWith(".mjs") ? "javascript"
		: selectedPath?.endsWith(".json") ? "json"
		: selectedPath?.endsWith(".md") ? "markdown"
		: selectedPath?.endsWith(".py") ? "python"
		: selectedPath?.endsWith(".css") ? "css"
		: selectedPath?.endsWith(".html") ? "html"
		: "plaintext"
	);

	onMount(() => {
		loadTree();
		window.addEventListener("keydown", handleKeydown);
		return () => window.removeEventListener("keydown", handleKeydown);
	});
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-50 flex items-stretch bg-black/60 backdrop-blur-sm"
	role="dialog"
	aria-modal="true"
	aria-label="Workspace Explorer"
>
	<!-- Panel -->
	<div class="relative flex w-full max-w-7xl mx-auto my-4 rounded-xl overflow-hidden shadow-2xl border border-gray-700 bg-gray-900 text-gray-100">

		<!-- ── Sidebar: file tree ─────────────────────────────────────────── -->
		<aside class="flex w-64 flex-shrink-0 flex-col border-r border-gray-700 bg-gray-950">
			<!-- Header -->
			<div class="flex items-center justify-between px-3 py-2.5 border-b border-gray-700">
				<span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Workspace</span>
				<div class="flex gap-1">
					<button
						onclick={() => { showNewItem = !showNewItem; }}
						title="New file or folder"
						class="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
					>
						<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</button>
					<button
						onclick={loadTree}
						title="Refresh"
						class="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
					>
						<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
				</div>
			</div>

			<!-- New item form -->
			{#if showNewItem}
				<div class="flex flex-col gap-1.5 border-b border-gray-700 p-2">
					<div class="flex gap-1">
						<button
							onclick={() => (newItemType = "file")}
							class="flex-1 rounded py-0.5 text-xs {newItemType === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}"
						>File</button>
						<button
							onclick={() => (newItemType = "dir")}
							class="flex-1 rounded py-0.5 text-xs {newItemType === 'dir' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}"
						>Folder</button>
					</div>
					<input
						bind:value={newItemPath}
						placeholder={newItemType === "file" ? "src/index.js" : "src/utils"}
						class="rounded bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
						onkeydown={(e) => e.key === "Enter" && createItem()}
					/>
					<div class="flex gap-1">
						<button onclick={createItem} class="flex-1 rounded bg-blue-600 py-0.5 text-xs text-white hover:bg-blue-500">Create</button>
						<button onclick={() => (showNewItem = false)} class="flex-1 rounded bg-gray-700 py-0.5 text-xs text-gray-300 hover:bg-gray-600">Cancel</button>
					</div>
				</div>
			{/if}

			<!-- Tree -->
			<div class="flex-1 overflow-y-auto py-1 text-sm">
				{#if treeLoading}
					<p class="px-3 py-4 text-xs text-gray-500">Loading…</p>
				{:else if tree.length === 0}
					<p class="px-3 py-4 text-xs text-gray-500">Workspace is empty.<br/>Ask the AI to create files.</p>
				{:else}
					{#snippet renderNode(nodes: TreeNode[], depth: number)}
						{#each nodes as node}
							{#if node.type === "dir"}
								<div class="group flex w-full items-center hover:bg-gray-800">
									<button
										onclick={() => toggleDir(node.path)}
										class="flex flex-1 items-center gap-1 py-0.5 text-left text-gray-300 min-w-0"
										style="padding-left: {8 + depth * 12}px"
									>
										<svg class="size-3.5 flex-shrink-0 text-gray-500 transition-transform {expandedDirs.has(node.path) ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
											<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
										</svg>
										<svg class="size-3.5 flex-shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
											<path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
										</svg>
										<span class="truncate text-xs">{node.name}</span>
									</button>
									<button
										onclick={() => deleteItem(node.path, 'dir')}
										title="Delete folder"
										class="mr-1 hidden rounded p-0.5 text-gray-600 hover:bg-red-500/20 hover:text-red-400 group-hover:block flex-shrink-0"
									>
										<svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
									</button>
								</div>
								{#if expandedDirs.has(node.path) && node.children}
									{@render renderNode(node.children, depth + 1)}
								{/if}
							{:else}
								<div class="group flex w-full items-center {selectedPath === node.path ? 'bg-gray-700' : 'hover:bg-gray-800'}">
									<button
										onclick={() => openFile(node.path)}
										class="flex flex-1 items-center gap-1 py-0.5 text-left text-xs min-w-0 {selectedPath === node.path ? 'text-white' : 'text-gray-400'}"
										style="padding-left: {8 + depth * 12}px"
									>
										<svg class="size-3.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
										<span class="truncate">{node.name}</span>
									</button>
									<button
										onclick={() => deleteItem(node.path, 'file')}
										title="Delete file"
										class="mr-1 hidden rounded p-0.5 text-gray-600 hover:bg-red-500/20 hover:text-red-400 group-hover:block flex-shrink-0"
									>
										<svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
									</button>
								</div>
							{/if}
						{/each}
					{/snippet}
					{@render renderNode(tree, 0)}
				{/if}
			</div>
		</aside>

		<!-- ── Editor pane ────────────────────────────────────────────────── -->
		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Toolbar -->
			<div class="flex items-center justify-between border-b border-gray-700 bg-gray-900 px-4 py-2">
				<div class="flex items-center gap-2 min-w-0">
					{#if selectedPath}
						<span class="truncate text-xs text-gray-400 font-mono">{selectedPath}</span>
						{#if isDirty}
							<span class="rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-400">unsaved</span>
						{/if}
					{:else}
						<span class="text-xs text-gray-500">Select a file to edit</span>
					{/if}
				</div>
				<div class="flex items-center gap-1.5 flex-shrink-0">
					{#if statusMsg}
						<span class="text-xs text-green-400">{statusMsg}</span>
					{/if}
					{#if error}
						<span class="max-w-xs truncate text-xs text-red-400">{error}</span>
					{/if}
					{#if selectedPath}
						<!-- Export -->
						<button
							onclick={exportFile}
							title="Download file"
							class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white"
						>
							<svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
							Export
						</button>
						<!-- Delete -->
						<button
							onclick={deleteFile}
							disabled={deleting}
							title="Delete file"
							class="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
						>
							<svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
							{deleting ? "Deleting…" : "Delete"}
						</button>
						<!-- Save -->
						<button
							onclick={saveFile}
							disabled={saving || !isDirty}
							class="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
						>
							<svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
							</svg>
							{saving ? "Saving…" : "Save"}
						</button>
					{/if}
					<button
						onclick={onclose}
						class="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
						aria-label="Close"
					>
						<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Editor -->
			<div class="relative flex-1 overflow-hidden">
				{#if loading}
					<div class="flex h-full items-center justify-center text-sm text-gray-500">Loading…</div>
				{:else if selectedPath}
					<textarea
						bind:value={fileContent}
						spellcheck="false"
						class="h-full w-full resize-none bg-gray-950 p-4 font-mono text-sm text-gray-100 outline-none leading-relaxed"
						style="tab-size: 2;"
					></textarea>
				{:else}
					<div class="flex h-full flex-col items-center justify-center gap-3 text-gray-600">
						<svg class="size-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
						</svg>
						<p class="text-sm">Pick a file from the tree, or ask the AI to create one</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
