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
			padding: 4px 8px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
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
			display: grid;
			grid-template-columns: 190px 1fr;
			gap: 14px;
			min-height: 420px;
		}

		.chat-list {
			border-right: 1px solid var(--vscode-panel-border);
			padding-right: 10px;
		}

		.chat-actions {
			display: flex;
			gap: 6px;
			margin-bottom: 10px;
		}

		.chat-item {
			width: 100%;
			text-align: left;
			margin-bottom: 6px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.chat-item.active {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.faq-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
			gap: 8px;
			margin-bottom: 12px;
		}

		.faq-button {
			text-align: left;
			line-height: 1.35;
			padding: 8px;
		}

		.chat-header {
			display: flex;
			gap: 8px;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 10px;
		}

		.chat-title {
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.message {
			margin-bottom: 14px;
			padding: 10px;
			border-radius: 6px;
			border: 1px solid var(--vscode-panel-border);
		}

		.message.user {
			background: var(--vscode-input-background);
		}

		.message.assistant {
			background: var(--vscode-textBlockQuote-background);
		}

		.message-role {
			font-size: 11px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 6px;
		}

		.markdown-code {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			padding: 10px;
			overflow-x: auto;
		}

		.composer {
			margin-top: 12px;
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
					chatId: activeChat?.id
				});
			}

			function askFaq(question) {
				aiLoading = true;
				aiError = '';
				render();
				vscode.postMessage({
					type: 'askFaq',
					question
				});
			}

			function newChat(temporary) {
				vscode.postMessage({ type: 'newChat', temporary });
			}

			function selectChat(chatId) {
				vscode.postMessage({ type: 'selectChat', chatId });
			}

			function deleteChat(chatId) {
				vscode.postMessage({ type: 'deleteChat', chatId });
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

			function buildAi(entry) {
				const visibleChats = chats.filter(chat => chat.functionKey === currentFunctionKey);
				const messages = activeChat?.messages ?? [];

				return \`
					<h2>\${escapeHtml(entry.qualifiedName)}</h2>

					<div class="ai-shell">
						<div class="chat-list">
							<div class="chat-actions">
								<button onclick="newChat(false)">New</button>
								<button onclick="newChat(true)">Temporary</button>
							</div>
								\${visibleChats.map(chat => \`
								<button class="chat-item \${activeChat?.id === chat.id ? 'active' : ''}" onclick="selectChat('\${escapeJsString(chat.id)}')">\${escapeHtml(chat.title)}\${chat.id.startsWith('temp-') ? ' (temp)' : ''}</button>
							\`).join('')}
						</div>

						<div>
							<div class="faq-grid">
								\${faqQuestions.map(question => \`
									<button class="faq-button" onclick="askFaq('\${escapeJsString(question)}')">\${escapeHtml(question)}</button>
								\`).join('')}
							</div>

							<div class="chat-header">
								<div class="chat-title">\${escapeHtml(activeChat?.title ?? 'New chat')}</div>
								<div>
									\${activeChat ? \`
										<button onclick="renameChat('\${escapeJsString(activeChat.id)}')">Rename</button>
										<button onclick="deleteChat('\${escapeJsString(activeChat.id)}')">Delete</button>
									\` : ''}
								</div>
							</div>

							<div class="messages">
								\${messages.length ? messages.map(message => \`
									<div class="message \${message.role}">
										<div class="message-role">\${message.role === 'user' ? 'You' : 'AI'}</div>
										<div>\${renderMarkdown(message.content)}</div>
									</div>
								\`).join('') : '<p class="notice"><em>Start a chat or click a suggested question.</em></p>'}
							</div>

							<div class="composer">
								<textarea id="ai-question" placeholder="Ask about this function or anything else..." onkeydown="handleComposerKeydown(event)"></textarea>
								<button onclick="sendQuestion()">\${aiLoading ? 'Sending...' : 'Send'}</button>
								<p class="notice">Enter sends. Shift+Enter adds a new line.</p>
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

					return escapeHtml(part)
						.split(/\\n{2,}/)
						.map(paragraph => '<p>' + paragraph.replace(/\\n/g, '<br />') + '</p>')
						.join('');
				}).join('');
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
					const answer = await askInsightAi(context, activeEntry ?? entry, currentChat.messages);
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
					const answer = await askInsightAi(context, activeEntry ?? entry, currentChat.messages);
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
				const chat = chatStore?.createChat(activeFunctionKey ?? functionKey, Boolean(msg.temporary));
				panel?.webview.postMessage({
					type: 'aiState',
					chats: chatStore?.listChats() ?? [],
					activeChat: chat
				});
			}

			if (msg?.type === 'selectChat') {
				postAiState(activeFunctionKey ?? functionKey, String(msg.chatId ?? ''));
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
