import * as vscode from 'vscode';
import { loadInsights } from "../data/insightsLoader";


let panel: vscode.WebviewPanel | undefined;

export function registerPanel(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		'code-insights.open',
		(functionKey: string, mode: 'learn' | 'test' | 'ai' = 'learn') => {
			openPanel(functionKey, mode, context);
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
			c.innerHTML = '<h2>' + currentEntry.qualifiedName + '</h2><p><em>Testing is coming soon.</em></p>';
			return;
		}

		if (currentMode === 'ai') {
			c.innerHTML = '<h2>' + currentEntry.qualifiedName + '</h2><p><em>AI assistance is coming soon.</em></p>';
			return;
		}

		c.innerHTML = buildLearn(currentEntry);
	}

	function buildLearn(entry) {
		return \`
			<h2>\${entry.qualifiedName}</h2>

			<strong>Function Signature</strong>
			<pre>\${entry.signature}</pre>

			<h3>Description</h3>
			<p>\${entry.description}</p>

			<h3>Main Attributes</h3>
			\${entry.attributes.map(a => \`
				<div class="attribute">
					<div class="attribute-header">
						<code class="param">\${a.name}</code>
						\${a.testable ? '<button onclick="nav(\\'test\\')">Test</button>' : ''}
					</div>
					<p>\${a.description}</p>
				</div>
			\`).join('')}

			<h3>Usage</h3>
			\${entry.usage.map(u => \`
				<strong>\${u.title}</strong>
				<pre>\${u.code}</pre>
			\`).join('')}

			<h3>Behavioral Notes</h3>
			<ul>
				\${entry.behavioralNotes.map(n => '<li>' + n + '</li>').join('')}
			</ul>
		\`;
	}

	window.addEventListener('message', e => {
		const msg = e.data;

		if (msg.type === 'update') {
			currentEntry = msg.entry;
			currentMode = msg.mode;
			render();
		}

		if (msg.type === 'activate') {
			currentMode = msg.mode;
			render();
		}
	});
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

		panel.webview.onDidReceiveMessage(msg => {
			if (msg?.type === 'switch') {
				panel?.webview.postMessage({ type: 'activate', mode: msg.mode });
			}
		});
	}

	panel.reveal(vscode.ViewColumn.Beside);
	panel.webview.postMessage({ type: 'update', entry, mode });
}
