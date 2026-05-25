import * as vscode from 'vscode';
import { askInsightAi, suggestChatTitle } from "../ai/aiClient";
import { ChatStore, createMessage, type SavedChat } from "../ai/chatStore";
import { loadInsights } from "../data/insightsLoader";


let panel: vscode.WebviewPanel | undefined;
let activeEntry: Parameters<typeof askInsightAi>[1] | undefined;
let activeFunctionKey: string | undefined;
let chatStore: ChatStore | undefined;
let latestPanelState: PanelState | undefined;

type PanelState = {
	entry: Parameters<typeof askInsightAi>[1];
	functionKey: string;
	mode: 'learn' | 'test' | 'ai';
	chats: SavedChat[];
	activeChat?: SavedChat;
};

export function registerPanel(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		'code-insights.open',
		(functionKeyOrArgs: string | [string, 'learn' | 'test' | 'ai'], mode: 'learn' | 'test' | 'ai' = 'learn') => {
			const [functionKey, targetMode] = Array.isArray(functionKeyOrArgs)
				? functionKeyOrArgs
				: [functionKeyOrArgs, mode];

			openPanel(functionKey, targetMode ?? 'learn', context);
		}
	);

	context.subscriptions.push(disposable);
}

export function buildPanelHtml(): string {
	return `
		<!DOCTYPE html>
		<html>
		<head>
		<meta charset="UTF-8" />
		<style>
		body {
			margin: 0;
			font-family: var(--vscode-font-family);
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
		}

		.tabs {
			position: sticky;
			top: 0;
			z-index: 20;
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
		}

		.tab {
			padding: 10px;
			text-align: center;
			cursor: pointer;
			color: var(--vscode-descriptionForeground);
			border-bottom: 2px solid transparent;
		}

		.tab.active {
			color: var(--vscode-editor-foreground);
			border-bottom: 2px solid var(--vscode-textLink-foreground);
		}

		.content {
			padding: 16px;
		}

		.content.ai-content {
			padding: 0;
			margin-top: -1px;
			height: calc(100vh - 41px);
			overflow: hidden;
		}

		pre {
			background: var(--vscode-textBlockQuote-background);
			padding: 10px;
			border-radius: 6px;
			overflow-x: auto;
			line-height: 1.5;
		}

		.attribute {
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			padding: 12px;
			margin-bottom: 12px;
		}

		.attribute-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.param {
			font-family: var(--vscode-editor-font-family);
			background: rgba(127,127,127,0.15);
			padding: 2px 6px;
			border-radius: 4px;
		}

		button {
			font-size: 12px;
			padding: 8px 11px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 7px;
			cursor: pointer;
			line-height: 1.2;
			transition: background 120ms ease, border-color 120ms ease;
		}

		button:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.primary-button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.primary-button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.icon-button {
			min-width: 30px;
			padding: 6px 8px;
		}

		.section {
			margin-bottom: 18px;
		}

		.notice {
			color: var(--vscode-descriptionForeground);
		}

		.step,
		.output-item {
			border-left: 2px solid var(--vscode-textLink-foreground);
			padding-left: 10px;
			margin-bottom: 10px;
		}

		.line-ref {
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
		}

		textarea {
			box-sizing: border-box;
			width: 100%;
			min-height: 92px;
			resize: vertical;
			margin: 8px 0;
			padding: 8px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			font-family: var(--vscode-font-family);
		}

		.ai-answer {
			white-space: pre-wrap;
			background: var(--vscode-textBlockQuote-background);
			padding: 12px;
			border-radius: 6px;
			line-height: 1.5;
		}

		.ai-shell {
			display: block;
			height: calc(100vh - 41px);
			background: var(--vscode-editor-background);
		}

		.ai-subtabs {
			position: relative;
			z-index: 19;
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0;
			padding: 0 18px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
		}

		.ai-subtab {
			min-width: 0;
			width: 100%;
			padding: 11px 12px;
			border: none;
			border-bottom: 2px solid transparent;
			border-radius: 0;
			background: transparent;
			color: var(--vscode-descriptionForeground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.ai-subtab.active {
			color: var(--vscode-foreground);
			border-bottom-color: var(--vscode-textLink-foreground);
		}

		.chat-menu {
			position: relative;
		}

		.chat-menu summary {
			cursor: pointer;
			list-style: none;
			padding: 7px 11px;
			font-weight: 600;
			border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
			border-radius: 8px;
			background: var(--vscode-button-secondaryBackground, var(--vscode-editorWidget-background));
			color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
		}

		.chat-menu summary::-webkit-details-marker {
			display: none;
		}

		.chat-drawer-body {
			position: absolute;
			top: calc(100% + 8px);
			right: 0;
			z-index: 10;
			width: min(360px, calc(100vw - 36px));
			max-height: min(430px, calc(100vh - 150px));
			overflow: auto;
			padding: 14px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 10px;
			background: var(--vscode-sideBar-background);
			box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
		}

		.chat-list-title {
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--vscode-descriptionForeground);
			margin: 12px 0 8px;
		}

		.chat-actions {
			display: grid;
			grid-template-columns: max-content max-content;
			gap: 8px;
			margin-bottom: 14px;
		}

		.chat-items {
			display: grid;
			grid-template-columns: 1fr;
			gap: 8px;
		}

		.chat-item {
			width: 100%;
			text-align: left;
			padding: 9px 10px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			background: transparent;
			color: var(--vscode-sideBar-foreground);
			border-color: transparent;
		}

		.chat-item.active {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
			border-color: transparent;
		}

		.ai-main {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr) auto;
			height: calc(100vh - 41px);
		}

		.ai-subtitle {
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
			max-width: 820px;
			margin: 0 auto 16px;
			text-align: center;
		}

		.context-line {
			position: relative;
			z-index: 18;
			display: flex;
			justify-content: center;
			align-items: center;
			padding: 8px 18px;
			background: var(--vscode-editor-background);
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.scope-button.active {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.scope-button {
			min-width: 34px;
		}

		.history-view {
			max-width: 860px;
			margin: 0 auto;
			display: grid;
			gap: 8px;
		}

		.history-row {
			display: grid;
			grid-template-columns: minmax(0, 1fr) max-content max-content;
			gap: 8px;
			align-items: center;
			padding: 9px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			background: var(--vscode-editorWidget-background);
		}

		.history-row:hover {
			border-color: var(--vscode-focusBorder);
		}

		.history-row.active {
			border-color: var(--vscode-textLink-foreground);
		}

		.history-title {
			text-align: left;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			background: transparent;
			border-color: transparent;
		}

		.icon-button {
			min-width: 30px;
			width: 30px;
			height: 30px;
			padding: 0;
			display: inline-grid;
			place-items: center;
			font-size: 14px;
		}

		.icon-button svg {
			width: 15px;
			height: 15px;
			stroke: currentColor;
			fill: none;
			stroke-width: 2;
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		.copy-button {
			color: var(--vscode-textLink-foreground);
			border-color: rgba(80, 160, 255, 0.35);
		}

		.rename-button {
			color: var(--vscode-charts-yellow);
			border-color: rgba(235, 190, 80, 0.35);
		}

		.delete-button {
			color: var(--vscode-errorForeground);
			border-color: rgba(255, 100, 100, 0.45);
		}

		.regen-button {
			color: var(--vscode-charts-green);
			border-color: rgba(90, 200, 120, 0.35);
		}

		.ai-body {
			overflow-y: auto;
			padding: 22px 18px 96px;
		}

		.ai-empty {
			max-width: 760px;
			margin: 18px auto 0;
		}

		.ai-empty h3 {
			font-size: 20px;
			margin: 0 0 6px;
			font-weight: 600;
		}

		.ai-empty p {
			margin: 0 0 18px;
			color: var(--vscode-descriptionForeground);
		}

		.faq-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}

		.faq-button {
			text-align: left;
			line-height: 1.35;
			padding: 13px;
			border-color: var(--vscode-panel-border);
			background: var(--vscode-editorWidget-background);
			min-height: 62px;
			font-size: 13px;
		}

		.faq-collapsed {
			margin-bottom: 14px;
		}

		.faq-collapsed summary {
			cursor: pointer;
			color: var(--vscode-textLink-foreground);
			margin-bottom: 10px;
		}

		.chat-header {
			display: flex;
			gap: 8px;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 16px;
		}

		.chat-title {
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.message {
			max-width: 820px;
			margin: 0 auto 16px;
			padding: 0;
			border: none;
			background: transparent;
		}

		.message.user {
			display: flex;
			justify-content: flex-end;
		}

		.message.assistant {
			display: block;
		}

		.message-role {
			font-size: 11px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 7px;
			letter-spacing: 0.02em;
		}

		.message.user .message-role {
			display: none;
		}

		.message-content {
			line-height: 1.55;
			font-size: 14px;
		}

		.message.user .message-content {
			max-width: min(72%, 640px);
			padding: 10px 12px;
			border-radius: 14px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.message.assistant .message-content {
			padding: 4px 0;
		}

		.message-actions {
			max-width: 820px;
			margin: -8px auto 16px;
			display: flex;
			justify-content: flex-end;
			gap: 6px;
			opacity: 0.9;
		}

		.regenerate-actions {
			justify-content: center;
			margin-top: 8px;
		}

		.jump-bottom {
			position: sticky;
			bottom: 92px;
			z-index: 15;
			margin: 0 auto 10px;
			border-radius: 999px;
			background: var(--vscode-editorWidget-background);
			box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
		}

		.jump-bottom[hidden] {
			display: none;
		}

		.loading-row {
			max-width: 820px;
			margin: 4px auto 16px;
			color: var(--vscode-descriptionForeground);
		}

		.loading-dot {
			display: inline-block;
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background: currentColor;
			animation: pulse 900ms ease-in-out infinite alternate;
		}

		@keyframes pulse {
			from { opacity: 0.25; transform: scale(0.8); }
			to { opacity: 0.9; transform: scale(1.1); }
		}

		.message-content p {
			margin: 0 0 10px;
			font-size: 14px;
		}

		.message-content ul {
			margin: 6px 0 12px 18px;
			padding: 0;
		}

		.message-content li {
			margin-bottom: 5px;
			font-size: 14px;
		}

		.message-content code {
			font-family: var(--vscode-editor-font-family);
			background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.16));
			border-radius: 4px;
			padding: 1px 4px;
			font-size: 13px;
		}

		.message-content h3 {
			margin: 16px 0 8px;
			font-size: 16px;
		}

		.message-content hr {
			border: none;
			border-top: 1px solid var(--vscode-panel-border);
			margin: 14px 0;
		}

		.message-content table {
			width: 100%;
			border-collapse: collapse;
			margin: 12px 0;
			font-size: 12px;
		}

		.table-wrap {
			margin: 12px 0;
		}

		.message-content th,
		.message-content td {
			border: 1px solid var(--vscode-panel-border);
			padding: 7px 8px;
			text-align: left;
			vertical-align: top;
		}

		.message-content th {
			background: var(--vscode-editorWidget-background);
		}

		.markdown-code {
			position: relative;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 12px;
			overflow-x: auto;
			margin: 12px 0;
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
		}

		.code-language {
			display: inline-block;
			margin: -2px 0 10px;
			padding: 2px 7px;
			border-radius: 999px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			font-family: var(--vscode-font-family);
			font-size: 11px;
			user-select: none;
			-webkit-user-select: none;
		}

		.markdown-code code {
			display: block;
			background: transparent;
			padding: 0;
		}

		.copy-code {
			float: right;
			margin: -4px -4px 8px 8px;
		}

		.composer {
			position: sticky;
			bottom: 0;
			z-index: 16;
			padding: 12px 18px 16px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
		}

		.composer-row {
			display: flex;
			align-items: center;
			gap: 8px;
			max-width: 820px;
			margin: 0 auto;
			padding: 8px;
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			border-radius: 12px;
			background: var(--vscode-input-background);
		}

		.plus-menu {
			position: relative;
			align-self: flex-end;
		}

		.plus-menu summary {
			list-style: none;
			cursor: pointer;
			width: 30px;
			height: 30px;
			display: grid;
			place-items: center;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 50%;
			background: var(--vscode-button-secondaryBackground);
		}

		.plus-menu summary::-webkit-details-marker {
			display: none;
		}

		.style-popover {
			position: absolute;
			bottom: calc(100% + 8px);
			left: 0;
			z-index: 12;
			display: grid;
			gap: 6px;
			min-width: 130px;
			padding: 8px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 10px;
			background: var(--vscode-editorWidget-background);
			box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
		}

		.style-chip {
			align-self: flex-end;
			padding: 5px 9px;
			border-radius: 999px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			font-size: 12px;
			border: none;
		}

		.slash-suggestions {
			position: absolute;
			left: 54px;
			bottom: calc(100% + 8px);
			z-index: 14;
			display: grid;
			gap: 6px;
			min-width: 150px;
			padding: 8px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 10px;
			background: var(--vscode-editorWidget-background);
			box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
		}

		.slash-suggestions[hidden] {
			display: none;
		}

		.composer-row textarea {
			margin: 0;
			min-height: 38px;
			max-height: 140px;
			border: none;
			background: transparent;
			padding: 8px;
			outline: none;
			resize: none;
		}

		.composer-row button {
			border-radius: 9px;
			align-self: flex-end;
		}

		.send-button:disabled {
			opacity: 0.45;
			cursor: default;
		}

		.composer-hint {
			display: none;
		}

		@media (max-width: 720px) {
			.ai-shell {
				grid-template-columns: 1fr;
			}

			.faq-grid {
				grid-template-columns: 1fr;
			}
		}
		</style>
		</head>

		<body>
			<div class="tabs">
				<div class="tab active" data-tab="learn" onclick="nav('learn')">Learn More</div>
				<div class="tab" data-tab="test" onclick="nav('test')">Test</div>
				<div class="tab" data-tab="ai" onclick="nav('ai')">Ask AI</div>
			</div>

			<div id="content" class="content"></div>

		<script>
			const vscode = acquireVsCodeApi();

			let currentEntry = null;
			let currentMode = 'learn';
			let currentFunctionKey = '';
			let aiError = '';
			let aiLoading = false;
			let chats = [];
			let activeChat = null;
			let responseStyle = localStorage.getItem('codeInsightsResponseStyle') ?? 'simple';
			let aiSubtab = 'current';
			let chatScope = localStorage.getItem('codeInsightsChatScope') ?? 'function';
			let showFunctionContext = localStorage.getItem('codeInsightsShowFunctionContext') !== 'false';
			let pendingUserMessage = '';
			let stoppedRequest = false;
			const responseStyles = ['simple', 'short', 'detailed', 'baby'];
			const functionFaqQuestions = [
				'Why is this function useful?',
				'Does this mutate my data or return a new value?',
				'What is a common mistake with this function?',
				'Show me a simple example.'
			];
			const generalFaqQuestions = [
				'Explain this concept more simply.',
				'Give me a Python example.',
				'What should I watch out for?',
				'Compare the options in a table.'
			];
			const iconCopy = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
			const iconRename = '<svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
			const iconTrash = '<svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 16h10l1-16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
			const iconRefresh = '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-15.5 6.3"></path><path d="M3 12a9 9 0 0 1 15.5-6.3"></path><path d="M18 3v5h-5"></path><path d="M6 21v-5h5"></path></svg>';
			const iconSend = '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4Z"></path></svg>';
			const iconStop = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
			const iconContext = '<svg viewBox="0 0 24 24"><path d="M4 6h16"></path><path d="M4 12h10"></path><path d="M4 18h16"></path><path d="M17 10l3 2-3 2"></path></svg>';
			const iconDown = '<svg viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>';

			function nav(mode) {
				vscode.postMessage({ type: 'switch', mode });
			}

			function render() {
				if (!currentEntry) return;

				document.querySelectorAll('.tab').forEach(t =>
					t.classList.toggle('active', t.dataset.tab === currentMode)
				);

				const c = document.getElementById('content');
				c.classList.toggle('ai-content', currentMode === 'ai');

				if (currentMode === 'test') {
					c.innerHTML = buildTest(currentEntry);
					return;
				}

				if (currentMode === 'ai') {
					c.innerHTML = buildAi(currentEntry);
					bindChatScrollState();
					return;
				}

				c.innerHTML = buildLearn(currentEntry);
			}

			document.addEventListener('click', event => {
				document.querySelectorAll('details[open].plus-menu').forEach(details => {
					if (!details.contains(event.target)) {
						details.removeAttribute('open');
					}
				});
			});

			function escapeHtml(value) {
				return String(value ?? '')
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;')
					.replace(/'/g, '&#39;');
			}

			function buildCodeBlock(lines) {
				return '<pre><code>' + escapeHtml((lines ?? []).join('\\n')) + '</code></pre>';
			}

			function buildLearn(entry) {
				return \`
					<h2>\${escapeHtml(entry.qualifiedName)}</h2>

					<strong>Function Signature</strong>
					<pre>\${escapeHtml(entry.signature)}</pre>

					<h3>Description</h3>
					<p>\${escapeHtml(entry.description)}</p>

					<h3>Main Attributes</h3>
					\${entry.attributes.map(a => \`
						<div class="attribute">
							<div class="attribute-header">
								<code class="param">\${escapeHtml(a.name)}</code>
								\${a.testable ? '<button onclick="nav(\\'test\\')">Test</button>' : ''}
							</div>
							<p>\${escapeHtml(a.description)}</p>
						</div>
					\`).join('')}

					<h3>Usage</h3>
					\${entry.usage.map(u => \`
						<strong>\${escapeHtml(u.title)}</strong>
						<pre>\${escapeHtml(u.code)}</pre>
					\`).join('')}

					<h3>Behavioral Notes</h3>
					<ul>
						\${entry.behavioralNotes.map(n => '<li>' + escapeHtml(n) + '</li>').join('')}
					</ul>
				\`;
			}

			function buildTest(entry) {
				const test = entry.test;
				if (!test) {
					return \`
						<h2>\${escapeHtml(entry.qualifiedName)}</h2>
						<p class="notice"><em>No guided test is available for this function yet.</em></p>
					\`;
				}

				return \`
					<h2>\${escapeHtml(entry.qualifiedName)}</h2>

					<div class="section">
						<strong>Guided Example</strong>
						\${buildCodeBlock(test.editorCode)}
					</div>

					<div class="section">
						<h3>What To Notice</h3>
						\${(test.explanations ?? []).map(e => \`
							<div class="step">
								<div class="line-ref">Line \${escapeHtml(e.line)}</div>
								<div>\${escapeHtml(e.text)}</div>
							</div>
						\`).join('')}
					</div>

					<div class="section">
						<h3>Expected Behavior</h3>
						\${(test.output ?? []).map(item => \`
							<div class="output-item">\${escapeHtml(item)}</div>
						\`).join('')}
					</div>

					<p class="notice"><em>This is a static learning example. Code Insights does not execute code.</em></p>
				\`;
			}

			function sendQuestion(questionOverride) {
				const input = document.getElementById('ai-question');
				const question = String(questionOverride ?? input.value).trim();
				if (!question || aiLoading) {
					return;
				}

				const slashStyle = parseSlashStyle(question);
				if (slashStyle && question === '/' + slashStyle) {
					setResponseStyle(slashStyle);
					if (input) {
						input.value = '';
					}
					render();
					return;
				}

				aiError = '';
				aiLoading = true;
				stoppedRequest = false;
				pendingUserMessage = question;
				if (input) {
					input.value = '';
				}
				render();
				vscode.postMessage({
					type: 'askAi',
					question,
					chatId: activeChat?.id,
					responseStyle,
					chatScope
				});
			}

			function askFaq(question) {
				aiLoading = true;
				aiError = '';
				stoppedRequest = false;
				pendingUserMessage = question;
				aiSubtab = 'current';
				render();
				vscode.postMessage({
					type: 'askFaq',
					question,
					responseStyle,
					chatScope
				});
			}

			function newChat(temporary) {
				pendingUserMessage = '';
				aiError = '';
				aiSubtab = 'current';
				vscode.postMessage({ type: 'newChat', temporary });
			}

			function selectChat(chatId) {
				vscode.postMessage({ type: 'selectChat', chatId });
			}

			function deleteChat(chatId) {
				vscode.postMessage({ type: 'deleteChat', chatId });
			}

			function renameChat(chatId) {
				vscode.postMessage({ type: 'renameChat', chatId });
			}

			function handleComposerKeydown(event) {
				if (event.key === 'Enter' && !event.shiftKey) {
					event.preventDefault();
					const input = event.target;
					const slashStyle = parseSlashStyle(input.value);
					if (slashStyle) {
						setResponseStyle(slashStyle);
						input.value = '';
						return;
					}
					sendQuestion();
				}
			}

			function setResponseStyle(value) {
				if (!responseStyles.includes(value)) {
					return;
				}
				responseStyle = value;
				localStorage.setItem('codeInsightsResponseStyle', value);
				render();
			}

			function setAiSubtab(value) {
				aiSubtab = value;
				render();
			}

			function toggleChatScope() {
				chatScope = chatScope === 'function' ? 'general' : 'function';
				localStorage.setItem('codeInsightsChatScope', chatScope);
				render();
			}

			function toggleFunctionContextLine() {
				showFunctionContext = !showFunctionContext;
				localStorage.setItem('codeInsightsShowFunctionContext', String(showFunctionContext));
				render();
			}

			function regenerate() {
				if (!activeChat || aiLoading) {
					return;
				}

				aiError = '';
				aiLoading = true;
				stoppedRequest = false;
				pendingUserMessage = '';
				render();
				vscode.postMessage({
					type: 'regenerateAi',
					chatId: activeChat.id,
					responseStyle,
					chatScope
				});
			}

			function copyText(text) {
				vscode.postMessage({ type: 'copyText', text: decodeCopyText(text) });
			}

			function decodeCopyText(text) {
				try {
					return decodeURIComponent(String(text ?? ''));
				} catch {
					return String(text ?? '');
				}
			}

			function encodedText(value) {
				return escapeJsString(encodeURIComponent(String(value ?? '')));
			}

			function scrollChatBottom() {
				const body = document.querySelector('.ai-body');
				if (body) {
					body.scrollTop = body.scrollHeight;
				}
			}

			function updateJumpBottom() {
				const body = document.querySelector('.ai-body');
				const button = document.getElementById('jump-bottom');
				if (!body || !button) {
					return;
				}

				const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
				button.hidden = distanceFromBottom < 80;
			}

			function bindChatScrollState() {
				const body = document.querySelector('.ai-body');
				if (!body) {
					return;
				}

				body.removeEventListener('scroll', updateJumpBottom);
				body.addEventListener('scroll', updateJumpBottom);
				requestAnimationFrame(updateJumpBottom);
			}

			function stopResponse() {
				stoppedRequest = true;
				aiLoading = false;
				pendingUserMessage = '';
				render();
			}

			function handleComposerInput(event) {
				const input = event.target;
				const slashStyle = parseSlashStyle(input.value.trim());
				if (slashStyle && /\\s$/.test(input.value)) {
					setResponseStyle(slashStyle);
					input.value = '';
				}
				updateSlashSuggestions(input.value);
				const sendButton = document.getElementById('send-button');
				if (sendButton && !aiLoading) {
					sendButton.disabled = input.value.trim().length === 0;
				}
			}

			function parseSlashStyle(value) {
				const normalized = String(value ?? '').trim().toLowerCase();
				if (!normalized.startsWith('/')) {
					return '';
				}

				const style = normalized.slice(1);
				return responseStyles.includes(style) ? style : '';
			}

			function matchingSlashStyles(value) {
				const normalized = String(value ?? '').trim().toLowerCase();
				if (!normalized.startsWith('/')) {
					return [];
				}

				const query = normalized.slice(1);
				return responseStyles.filter(style => style.startsWith(query));
			}

			function updateSlashSuggestions(value) {
				const menu = document.getElementById('slash-suggestions');
				if (!menu) {
					return;
				}

				const matches = matchingSlashStyles(value);
				menu.hidden = matches.length === 0;
				menu.innerHTML = matches.map(style =>
					'<button onclick="applySlashStyle(\\'' + style + '\\')">' + escapeHtml(style) + '</button>'
				).join('');
			}

			function applySlashStyle(style) {
				setResponseStyle(style);
				const input = document.getElementById('ai-question');
				if (input) {
					input.value = '';
					input.focus();
				}
				updateSlashSuggestions('');
			}

			function buildAi(entry) {
				const visibleChats = chats.filter(chat => chat.functionKey === currentFunctionKey && !chat.id.startsWith('temp-'));
				const messages = activeChat?.messages ?? [];
				const displayMessages = pendingUserMessage
					? [...messages, { role: 'user', content: pendingUserMessage, createdAt: '' }]
					: messages;
				const hasStartedChat = displayMessages.length > 0;
				const activeTitle = activeChat?.id?.startsWith('temp-') ? 'Temporary chat' : activeChat?.title ?? 'New chat';
				const faqQuestions = chatScope === 'function' ? functionFaqQuestions : generalFaqQuestions;
				const faqMarkup = \`
					<div class="faq-grid">
						\${faqQuestions.map(question => \`
							<button class="faq-button" onclick="askFaq('\${escapeJsString(question)}')">\${escapeHtml(question)}</button>
						\`).join('')}
					</div>
				\`;
				const historyMarkup = \`
					<div class="history-view">
						<div class="chat-actions">
							<button class="primary-button" onclick="newChat(false); setAiSubtab('current')">New chat</button>
							<button onclick="newChat(true); setAiSubtab('current')">Temporary chat</button>
						</div>
						\${visibleChats.length ? visibleChats.map(chat => \`
							<div class="history-row \${activeChat?.id === chat.id ? 'active' : ''}">
								<button class="history-title" title="\${escapeHtml(chat.title)}" onclick="selectChat('\${escapeJsString(chat.id)}'); setAiSubtab('current')">
									\${escapeHtml(chat.title)}
								</button>
								<button class="icon-button rename-button" title="Rename chat" onclick="event.stopPropagation(); renameChat('\${escapeJsString(chat.id)}')">\${iconRename}</button>
								<button class="icon-button delete-button" title="Delete chat" onclick="event.stopPropagation(); deleteChat('\${escapeJsString(chat.id)}')">\${iconTrash}</button>
							</div>
						\`).join('') : '<span class="notice">No chats yet.</span>'}
					</div>
				\`;
				const currentChatMarkup = \`
					\${hasStartedChat ? '' : \`
						<div class="ai-empty">
							<h3>How can I help with \${escapeHtml(entry.qualifiedName)}?</h3>
							<p>\${chatScope === 'function' ? 'Ask about return values, mutation, side effects, examples, or mistakes.' : 'Ask anything. Function context is paused until you toggle it back on.'}</p>
							\${faqMarkup}
						</div>
					\`}

					<div class="messages">
						\${displayMessages.map(message => \`
							<div class="message \${message.role}">
								<div class="message-role">\${message.role === 'user' ? 'You' : 'Code Insights'}</div>
								<div class="message-content">\${renderMarkdown(message.content)}</div>
							</div>
							\${message.role === 'assistant' ? \`
								<div class="message-actions">
									<button class="icon-button copy-button" title="Copy response" onclick="copyText('\${encodedText(message.content)}')">\${iconCopy}</button>
								</div>
							\` : ''}
						\`).join('')}
					</div>

					\${aiLoading ? '<div class="loading-row"><span class="loading-dot"></span></div>' : ''}
					\${aiError ? '<div class="output-item">' + escapeHtml(aiError) + '</div>' : ''}
					\${hasStartedChat && !aiLoading ? \`
						<div class="message-actions regenerate-actions">
							<button class="icon-button regen-button" title="Regenerate response" onclick="regenerate()">\${iconRefresh}</button>
						</div>
					\` : ''}
					\${hasStartedChat ? \`
						<button id="jump-bottom" class="icon-button jump-bottom" title="Jump to bottom" onclick="scrollChatBottom()" hidden>\${iconDown}</button>
					\` : ''}
				\`;

				return \`
					<div class="ai-shell">
						<div class="ai-main">
							<div class="ai-subtabs">
								<button class="ai-subtab \${aiSubtab === 'chats' ? 'active' : ''}" onclick="setAiSubtab('chats')">Chats</button>
								<button class="ai-subtab \${aiSubtab === 'current' ? 'active' : ''}" title="\${escapeHtml(activeTitle)}" onclick="setAiSubtab('current')">\${escapeHtml(activeTitle)}</button>
							</div>
							\${showFunctionContext ? \`
								<div class="context-line">
									<button class="ai-subtitle" title="Hide function name" onclick="toggleFunctionContextLine()">\${escapeHtml(entry.qualifiedName)}</button>
								</div>
							\` : ''}

							<div class="ai-body">
								\${aiSubtab === 'chats' ? historyMarkup : currentChatMarkup}
							</div>

							<div class="composer">
								<div class="composer-row">
									<details class="plus-menu">
										<summary title="Response style">+</summary>
										<div class="style-popover">
											\${responseStyles.map(style => \`
												<button class="\${responseStyle === style ? 'primary-button' : ''}" onclick="setResponseStyle('\${style}')">\${style}</button>
											\`).join('')}
										</div>
									</details>
									<span class="style-chip" title="Response style">\${escapeHtml(responseStyle)}</span>
									<button class="scope-button icon-button \${chatScope === 'function' ? 'active' : ''}" title="Use selected function as context. Toggle off for general chat." onclick="toggleChatScope()">\${iconContext}</button>
									<textarea id="ai-question" placeholder="\${chatScope === 'function' ? 'Ask about this function...' : 'Ask anything...'}" oninput="handleComposerInput(event)" onkeydown="handleComposerKeydown(event)"></textarea>
									<div id="slash-suggestions" class="slash-suggestions" hidden></div>
									<button id="send-button" class="primary-button icon-button send-button" title="\${aiLoading ? 'Stop' : 'Send'}" \${!aiLoading ? 'disabled' : ''} onclick="\${aiLoading ? 'stopResponse()' : 'sendQuestion()'}">\${aiLoading ? iconStop : iconSend}</button>
								</div>
							</div>
						</div>
					</div>
				\`;
			}

			function escapeJsString(value) {
				return String(value ?? '')
					.split('\\\\').join('\\\\\\\\')
					.split("'").join("\\\\'")
					.split('\\n').join('\\\\n')
					.split('\\r').join('');
			}

			function renderMarkdown(markdown) {
				const fence = String.fromCharCode(96, 96, 96);
				const parts = String(markdown ?? '').split(new RegExp(fence + '([\\\\s\\\\S]*?)' + fence, 'g'));
				return parts.map((part, index) => {
					if (index % 2 === 1) {
						const fenceBlock = parseCodeFence(part);
						const label = fenceBlock.language
							? '<span class="code-language" aria-hidden="true">' + escapeHtml(fenceBlock.language) + '</span>'
							: '';
						return '<pre class="markdown-code"><button class="copy-code icon-button copy-button" title="Copy code" onclick="copyText(\\'' + encodedText(fenceBlock.code) + '\\')">' + iconCopy + '</button>' + label + '<code>' + escapeHtml(fenceBlock.code) + '</code></pre>';
					}

					return renderMarkdownText(part);
				}).join('');
			}

			function parseCodeFence(content) {
				const text = String(content ?? '').replace(/^\\n+|\\n+$/g, '');
				const lines = text.split('\\n');
				const firstLine = (lines[0] ?? '').trim();
				const hasLanguage = /^[A-Za-z][\\w.+-]*$/.test(firstLine) && lines.length > 1;

				return {
					language: hasLanguage ? firstLine : '',
					code: (hasLanguage ? lines.slice(1) : lines).join('\\n').trim()
				};
			}

			function renderMarkdownText(text) {
				const blocks = String(text ?? '').split(/\\n{2,}/);
				return blocks.map(block => {
					const lines = block.split('\\n');
					if (/^\\s*-{3,}\\s*$/.test(block)) {
						return '<hr />';
					}

					if (isMarkdownTable(lines)) {
						return renderMarkdownTable(lines);
					}

					if (lines.every(line => /^\\s*[*-]\\s+/.test(line))) {
						return '<ul>' + lines.map(line =>
							'<li>' + formatInline(line.replace(/^\\s*[*-]\\s+/, '')) + '</li>'
						).join('') + '</ul>';
					}

					if (lines.some(line => /^\\s*[*-]\\s+/.test(line))) {
						return renderMixedMarkdownLines(lines);
					}

					if (lines.length === 1 && /^#{1,3}\\s+/.test(lines[0])) {
						return '<h3>' + formatInline(lines[0].replace(/^#{1,3}\\s+/, '')) + '</h3>';
					}

					return '<p>' + formatInline(block).replace(/\\n/g, '<br />') + '</p>';
				}).join('');
			}

			function renderMixedMarkdownLines(lines) {
				const html = [];
				let paragraph = [];
				let bullets = [];

				function flushParagraph() {
					if (paragraph.length) {
						html.push('<p>' + formatInline(paragraph.join('\\n')).replace(/\\n/g, '<br />') + '</p>');
						paragraph = [];
					}
				}

				function flushBullets() {
					if (bullets.length) {
						html.push('<ul>' + bullets.map(item => '<li>' + formatInline(item) + '</li>').join('') + '</ul>');
						bullets = [];
					}
				}

				lines.forEach(line => {
					if (/^\\s*[*-]\\s+/.test(line)) {
						flushParagraph();
						bullets.push(line.replace(/^\\s*[*-]\\s+/, ''));
						return;
					}

					flushBullets();
					paragraph.push(line);
				});

				flushParagraph();
				flushBullets();
				return html.join('');
			}

			function formatInline(text) {
				const tick = String.fromCharCode(96);
				return escapeHtml(text)
					.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
					.replace(/(^|[^*])\\*([^*]+)\\*/g, '$1<em>$2</em>')
					.replace(new RegExp(tick + '([^' + tick + ']+)' + tick, 'g'), '<code>$1</code>');
			}

			function isMarkdownTable(lines) {
				return lines.length >= 2 &&
					lines[0].includes('|') &&
					/^\\s*\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$/.test(lines[1]);
			}

			function renderMarkdownTable(lines) {
				const rows = lines
					.filter(line => line.includes('|'))
					.map(line => line.trim().replace(/^\\|/, '').replace(/\\|$/, '').split('|').map(cell => cell.trim()));
				const header = rows[0] ?? [];
				const body = rows.slice(2);

				return '<table><thead><tr>' +
					header.map(cell => '<th>' + formatInline(cell) + '</th>').join('') +
					'</tr></thead><tbody>' +
					body.map(row => '<tr>' + row.map(cell => '<td>' + formatInline(cell) + '</td>').join('') + '</tr>').join('') +
					'</tbody></table>';
			}

			window.addEventListener('message', e => {
				const msg = e.data;

				if (msg.type === 'update') {
					currentEntry = msg.entry;
					currentMode = msg.mode;
					currentFunctionKey = msg.functionKey;
					aiError = '';
					aiLoading = false;
					pendingUserMessage = '';
					chats = msg.chats ?? chats;
					activeChat = msg.activeChat ?? activeChat;
					render();
					bindChatScrollState();
				}

				if (msg.type === 'activate') {
					currentMode = msg.mode;
					render();
					bindChatScrollState();
				}

				if (msg.type === 'aiResult') {
					if (stoppedRequest) {
						return;
					}
					aiError = '';
					aiLoading = false;
					pendingUserMessage = '';
					chats = msg.chats ?? chats;
					activeChat = msg.activeChat ?? activeChat;
					render();
					bindChatScrollState();
				}

				if (msg.type === 'aiError') {
					aiError = msg.message;
					aiLoading = false;
					pendingUserMessage = '';
					render();
					bindChatScrollState();
				}

				if (msg.type === 'aiState') {
					chats = msg.chats ?? [];
					activeChat = msg.activeChat ?? null;
					aiError = '';
					aiLoading = false;
					pendingUserMessage = '';
					render();
					bindChatScrollState();
				}
			});

			vscode.postMessage({ type: 'ready' });
		</script>
		</body>
		</html>
	`;
}

export function openPanel(
	functionKey: string,
	mode: 'learn' | 'test' | 'ai',
	context: vscode.ExtensionContext
) {
	const data = loadInsights(context);
	if (!data || !data[functionKey]) {
		vscode.window.showErrorMessage(`No data found for ${functionKey}`);
		return;
	}

	const entry = data[functionKey];
	activeEntry = entry;
	activeFunctionKey = functionKey;
	chatStore ??= new ChatStore(context);

	if (!panel) {
		panel = vscode.window.createWebviewPanel(
			'codeInsights',
			'Code Insights',
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);

		panel.onDidDispose(() => {
			chatStore?.clearTemporaryChats();
			panel = undefined;
		});

		panel.webview.html = buildPanelHtml();

		panel.webview.onDidReceiveMessage(async msg => {
			if (msg?.type === 'ready' && latestPanelState) {
				panel?.webview.postMessage({
					type: 'update',
					...latestPanelState
				});
			}

			if (msg?.type === 'switch') {
				panel?.webview.postMessage({ type: 'activate', mode: msg.mode });
				if (msg.mode === 'ai') {
					postAiState(activeFunctionKey ?? functionKey);
				}
			}

			if (msg?.type === 'askAi') {
				try {
					const chat = ensureChat(String(msg.chatId ?? ''), activeFunctionKey ?? functionKey, false);
					const question = String(msg.question ?? '');
					chatStore?.addMessage(chat.id, createMessage('user', question));
					const currentChat = chatStore?.getChat(chat.id) ?? chat;
					const titlePromise = maybeGenerateChatTitle(context, chat.id, question);
					const answer = await askInsightAi(context, activeEntry ?? entry, currentChat.messages, String(msg.responseStyle ?? 'simple'), String(msg.chatScope ?? 'function'));
					await titlePromise;
					const updatedChat = chatStore?.addMessage(chat.id, createMessage('assistant', answer)) ?? currentChat;
					panel?.webview.postMessage({
						type: 'aiResult',
						chats: chatStore?.listChats() ?? [],
						activeChat: updatedChat
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : 'AI request failed.';
					panel?.webview.postMessage({ type: 'aiError', message });
				}
			}

			if (msg?.type === 'askFaq') {
				try {
					const question = String(msg.question ?? '');
					const chat = chatStore?.createChat(activeFunctionKey ?? functionKey, false, question);
					if (!chat) { throw new Error('Chat store is not available.'); }
					chatStore?.addMessage(chat.id, createMessage('user', question));
					const currentChat = chatStore?.getChat(chat.id) ?? chat;
					const titlePromise = maybeGenerateChatTitle(context, chat.id, question);
					const answer = await askInsightAi(context, activeEntry ?? entry, currentChat.messages, String(msg.responseStyle ?? 'simple'), String(msg.chatScope ?? 'function'));
					await titlePromise;
					const updatedChat = chatStore?.addMessage(chat.id, createMessage('assistant', answer)) ?? currentChat;
					panel?.webview.postMessage({
						type: 'aiResult',
						chats: chatStore?.listChats() ?? [],
						activeChat: updatedChat
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : 'AI request failed.';
					panel?.webview.postMessage({ type: 'aiError', message });
				}
			}

			if (msg?.type === 'regenerateAi') {
				try {
					const chatId = String(msg.chatId ?? '');
					const chat = chatStore?.removeLastAssistantMessage(chatId);
					if (!chat || !chat.messages.some(message => message.role === 'user')) {
						throw new Error('There is no user message to regenerate from.');
					}
					const answer = await askInsightAi(context, activeEntry ?? entry, chat.messages, String(msg.responseStyle ?? 'simple'), String(msg.chatScope ?? 'function'));
					const updatedChat = chatStore?.addMessage(chat.id, createMessage('assistant', answer)) ?? chat;
					panel?.webview.postMessage({
						type: 'aiResult',
						chats: chatStore?.listChats() ?? [],
						activeChat: updatedChat
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : 'AI request failed.';
					panel?.webview.postMessage({ type: 'aiError', message });
				}
			}

			if (msg?.type === 'newChat') {
				chatStore?.clearTemporaryChats();
				const chat = chatStore?.createChat(activeFunctionKey ?? functionKey, Boolean(msg.temporary));
				panel?.webview.postMessage({
					type: 'aiState',
					chats: chatStore?.listChats() ?? [],
					activeChat: chat
				});
			}

			if (msg?.type === 'selectChat') {
				const chatId = String(msg.chatId ?? '');
				postAiState(activeFunctionKey ?? functionKey, chatId);
			}

			if (msg?.type === 'deleteChat') {
				const chatId = String(msg.chatId ?? '');
				const chat = chatStore?.getChat(chatId);
				const title = chat?.title ?? 'this chat';
				const confirmed = await vscode.window.showWarningMessage(
					`Delete "${title}"? This cannot be undone.`,
					{ modal: true },
					'Delete'
				);
				if (confirmed !== 'Delete') {
					return;
				}

				chatStore?.deleteChat(chatId);
				const remainingChat = chatStore?.listChats().find(chat =>
					chat.functionKey === (activeFunctionKey ?? functionKey) && !chat.id.startsWith('temp-')
				);
				panel?.webview.postMessage({
					type: 'aiState',
					chats: chatStore?.listChats() ?? [],
					activeChat: remainingChat
				});
			}

			if (msg?.type === 'renameChat') {
				const chatId = String(msg.chatId ?? '');
				const chat = chatStore?.getChat(chatId);
				const title = await vscode.window.showInputBox({
					title: 'Rename chat',
					value: chat?.title ?? 'New chat',
					ignoreFocusOut: true
				});
				if (title === undefined) {
					return;
				}

				chatStore?.renameChat(chatId, title);
				panel?.webview.postMessage({
					type: 'aiState',
					chats: chatStore?.listChats() ?? [],
					activeChat: pickActiveChat(activeFunctionKey ?? functionKey, chatId)
				});
			}

			if (msg?.type === 'copyText') {
				await vscode.env.clipboard.writeText(String(msg.text ?? ''));
				void vscode.window.setStatusBarMessage('Code Insights: copied', 1500);
			}
		});
	}

	panel.reveal(vscode.ViewColumn.Beside);
	latestPanelState = {
		entry,
		functionKey,
		mode,
		chats: chatStore.listChats(),
		activeChat: pickActiveChat(functionKey)
	};
	panel.webview.postMessage({
		type: 'update',
		...latestPanelState
	});
}

function ensureChat(chatId: string, functionKey: string, temporary: boolean): SavedChat {
	const existing = chatId ? chatStore?.getChat(chatId) : undefined;
	return existing ?? chatStore?.createChat(functionKey, temporary) ?? missingChatStore();
}

function pickActiveChat(functionKey: string, chatId?: string): SavedChat | undefined {
	if (chatId) {
		return chatStore?.getChat(chatId);
	}

	return chatStore?.listChats().find(chat => chat.functionKey === functionKey);
}

function postAiState(functionKey: string, chatId?: string): void {
	panel?.webview.postMessage({
		type: 'aiState',
		chats: chatStore?.listChats() ?? [],
		activeChat: pickActiveChat(functionKey, chatId)
	});
}

async function maybeGenerateChatTitle(
	context: vscode.ExtensionContext,
	chatId: string,
	firstMessage: string
): Promise<void> {
	const chat = chatStore?.getChat(chatId);
	if (
		!chat ||
		chat.id.startsWith('temp-') ||
		chat.messages.filter(message => message.role === 'user').length !== 1 ||
		chat.messages.some(message => message.role === 'assistant')
	) {
		return;
	}

	try {
		const title = await suggestChatTitle(context, firstMessage);
		chatStore?.renameChat(chatId, title);
	} catch {
		// Keep the local fallback title if the title request fails.
	}
}

function missingChatStore(): never {
	throw new Error('Chat store is not available.');
}
