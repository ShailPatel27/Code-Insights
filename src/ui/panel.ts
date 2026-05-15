import * as vscode from 'vscode';
import { askInsightAi } from "../ai/aiClient";
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
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			border-bottom: 1px solid var(--vscode-panel-border);
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
			min-height: calc(100vh - 42px);
			background: var(--vscode-editor-background);
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
			min-height: calc(100vh - 42px);
		}

		.ai-topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 14px 18px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
		}

		.ai-title {
			min-width: 0;
		}

		.ai-title h2 {
			font-size: 16px;
			line-height: 1.2;
			margin: 0 0 4px;
			font-weight: 600;
		}

		.ai-subtitle {
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
		}

		.ai-top-actions {
			display: flex;
			gap: 8px;
			flex-shrink: 0;
			align-items: center;
			flex-wrap: wrap;
			justify-content: flex-end;
		}

		.response-style {
			background: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
			border: 1px solid var(--vscode-dropdown-border);
			border-radius: 7px;
			padding: 7px 9px;
			font-size: 12px;
		}

		.ai-body {
			overflow-y: auto;
			padding: 22px 18px 14px;
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
			font-size: 13px;
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

		.message-content p {
			margin: 0 0 10px;
		}

		.message-content ul {
			margin: 6px 0 12px 18px;
			padding: 0;
		}

		.message-content li {
			margin-bottom: 5px;
		}

		.message-content code {
			font-family: var(--vscode-editor-font-family);
			background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.16));
			border-radius: 4px;
			padding: 1px 4px;
		}

		.markdown-code {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 12px;
			overflow-x: auto;
			margin: 12px 0;
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
		}

		.markdown-code code {
			background: transparent;
			padding: 0;
		}

		.composer {
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
			min-width: 58px;
			align-self: flex-end;
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
			const faqQuestions = [
				'Why is this function useful?',
				'Does this mutate my data or return a new value?',
				'What is a common mistake with this function?',
				'Show me a simple example.'
			];

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
					return;
				}

				c.innerHTML = buildLearn(currentEntry);
			}

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

				aiError = '';
				aiLoading = true;
				if (input) {
					input.value = '';
				}
				render();
				vscode.postMessage({
					type: 'askAi',
					question,
					chatId: activeChat?.id,
					responseStyle
				});
			}

			function askFaq(question) {
				aiLoading = true;
				aiError = '';
				render();
				vscode.postMessage({
					type: 'askFaq',
					question,
					responseStyle
				});
			}

			function newChat(temporary) {
				vscode.postMessage({ type: 'newChat', temporary });
			}

			function selectChat(chatId) {
				vscode.postMessage({ type: 'selectChat', chatId });
			}

			function deleteChat(chatId) {
				const chat = chats.find(item => item.id === chatId);
				const title = chat?.title ?? 'this chat';
				if (confirm('Delete "' + title + '"? This cannot be undone.')) {
					vscode.postMessage({ type: 'deleteChat', chatId });
				}
			}

			function renameChat(chatId) {
				const title = prompt('Rename chat', activeChat?.title ?? 'New chat');
				if (title !== null) {
					vscode.postMessage({ type: 'renameChat', chatId, title });
				}
			}

			function handleComposerKeydown(event) {
				if (event.key === 'Enter' && !event.shiftKey) {
					event.preventDefault();
					sendQuestion();
				}
			}

			function setResponseStyle(value) {
				responseStyle = value;
				localStorage.setItem('codeInsightsResponseStyle', value);
			}

			function buildAi(entry) {
				const visibleChats = chats.filter(chat => chat.functionKey === currentFunctionKey);
				const messages = activeChat?.messages ?? [];
				const hasStartedChat = messages.length > 0;
				const faqMarkup = \`
					<div class="faq-grid">
						\${faqQuestions.map(question => \`
							<button class="faq-button" onclick="askFaq('\${escapeJsString(question)}')">\${escapeHtml(question)}</button>
						\`).join('')}
					</div>
				\`;

				return \`
					<div class="ai-shell">
						<div class="ai-main">
							<div class="ai-topbar">
								<div class="ai-title">
									<h2>Ask AI</h2>
									<div class="ai-subtitle">Current function: \${escapeHtml(entry.qualifiedName)}</div>
								</div>
								<div class="ai-top-actions">
									<details class="chat-menu">
										<summary>Chats</summary>
										<div class="chat-drawer-body">
											<div class="chat-actions">
												<button class="primary-button" onclick="newChat(false)">New chat</button>
												<button onclick="newChat(true)">Temporary</button>
											</div>
											<div class="chat-list-title">Saved chats</div>
											<div class="chat-items">
												\${visibleChats.length ? visibleChats.map(chat => \`
													<button class="chat-item \${activeChat?.id === chat.id ? 'active' : ''}" onclick="selectChat('\${escapeJsString(chat.id)}')">\${escapeHtml(chat.title)}\${chat.id.startsWith('temp-') ? ' (temp)' : ''}</button>
												\`).join('') : '<span class="notice">No saved chats yet.</span>'}
											</div>
										</div>
									</details>
									<select class="response-style" onchange="setResponseStyle(this.value)">
										<option value="simple" \${responseStyle === 'simple' ? 'selected' : ''}>Simple</option>
										<option value="short" \${responseStyle === 'short' ? 'selected' : ''}>Short</option>
										<option value="detailed" \${responseStyle === 'detailed' ? 'selected' : ''}>Detailed</option>
										<option value="baby" \${responseStyle === 'baby' ? 'selected' : ''}>Baby</option>
									</select>
									\${hasStartedChat ? \`
										<details class="faq-collapsed">
											<summary>Suggested questions</summary>
											\${faqMarkup}
										</details>
									\` : ''}
									\${activeChat ? \`
										<button title="Rename chat" onclick="renameChat('\${escapeJsString(activeChat.id)}')">Rename</button>
										<button title="Delete chat" onclick="deleteChat('\${escapeJsString(activeChat.id)}')">Delete</button>
									\` : ''}
								</div>
							</div>

							<div class="ai-body">
								\${hasStartedChat ? '' : \`
									<div class="ai-empty">
										<h3>How can I help with \${escapeHtml(entry.qualifiedName)}?</h3>
										<p>Ask about return values, mutation, side effects, examples, or anything else you are unsure about.</p>
										\${faqMarkup}
									</div>
								\`}

								<div class="messages">
									\${messages.map(message => \`
										<div class="message \${message.role}">
											<div class="message-role">\${message.role === 'user' ? 'You' : 'Code Insights'}</div>
											<div class="message-content">\${renderMarkdown(message.content)}</div>
										</div>
									\`).join('')}
								</div>
							</div>

							<div class="composer">
								<div class="composer-row">
									<textarea id="ai-question" placeholder="Ask about this function or anything else..." onkeydown="handleComposerKeydown(event)"></textarea>
									<button class="primary-button" onclick="sendQuestion()">\${aiLoading ? 'Sending...' : 'Send'}</button>
								</div>
							</div>
						</div>
					</div>

					\${aiError ? \`
						<div class="section">
							<h3>Configuration or API Error</h3>
							<div class="output-item">\${escapeHtml(aiError)}</div>
						</div>
					\` : ''}
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
						return '<pre class="markdown-code"><code>' + escapeHtml(part.trim()) + '</code></pre>';
					}

					return renderMarkdownText(part);
				}).join('');
			}

			function renderMarkdownText(text) {
				const blocks = String(text ?? '').split(/\\n{2,}/);
				return blocks.map(block => {
					const lines = block.split('\\n');
					if (lines.every(line => /^\\s*[*-]\\s+/.test(line))) {
						return '<ul>' + lines.map(line =>
							'<li>' + formatInline(line.replace(/^\\s*[*-]\\s+/, '')) + '</li>'
						).join('') + '</ul>';
					}

					return '<p>' + formatInline(block).replace(/\\n/g, '<br />') + '</p>';
				}).join('');
			}

			function formatInline(text) {
				const tick = String.fromCharCode(96);
				return escapeHtml(text)
					.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
					.replace(new RegExp(tick + '([^' + tick + ']+)' + tick, 'g'), '<code>$1</code>');
			}

			window.addEventListener('message', e => {
				const msg = e.data;

				if (msg.type === 'update') {
					currentEntry = msg.entry;
					currentMode = msg.mode;
					currentFunctionKey = msg.functionKey;
					aiError = '';
					aiLoading = false;
					chats = msg.chats ?? chats;
					activeChat = msg.activeChat ?? activeChat;
					render();
				}

				if (msg.type === 'activate') {
					currentMode = msg.mode;
					render();
				}

				if (msg.type === 'aiResult') {
					aiError = '';
					aiLoading = false;
					chats = msg.chats ?? chats;
					activeChat = msg.activeChat ?? activeChat;
					render();
				}

				if (msg.type === 'aiError') {
					aiError = msg.message;
					aiLoading = false;
					render();
				}

				if (msg.type === 'aiState') {
					chats = msg.chats ?? [];
					activeChat = msg.activeChat ?? null;
					aiError = '';
					aiLoading = false;
					render();
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
					chatStore?.addMessage(chat.id, createMessage('user', String(msg.question ?? '')));
					const currentChat = chatStore?.getChat(chat.id) ?? chat;
					const answer = await askInsightAi(context, activeEntry ?? entry, currentChat.messages, String(msg.responseStyle ?? 'simple'));
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
					const answer = await askInsightAi(context, activeEntry ?? entry, currentChat.messages, String(msg.responseStyle ?? 'simple'));
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
				const selectedChat = chatStore?.getChat(chatId);
				if (selectedChat && !selectedChat.id.startsWith('temp-')) {
					chatStore?.clearTemporaryChats();
				}
				postAiState(activeFunctionKey ?? functionKey, chatId);
			}

			if (msg?.type === 'deleteChat') {
				chatStore?.deleteChat(String(msg.chatId ?? ''));
				postAiState(activeFunctionKey ?? functionKey);
			}

			if (msg?.type === 'renameChat') {
				const chat = chatStore?.renameChat(String(msg.chatId ?? ''), String(msg.title ?? ''));
				panel?.webview.postMessage({
					type: 'aiState',
					chats: chatStore?.listChats() ?? [],
					activeChat: chat
				});
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

function missingChatStore(): never {
	throw new Error('Chat store is not available.');
}
