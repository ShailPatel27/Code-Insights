import * as vscode from 'vscode';
import { registerHoverProvider } from './ui/hoverProvider';
import { registerPanel } from './ui/panel';

export function activate(context: vscode.ExtensionContext) {
	registerHoverProvider(context);
	registerPanel(context);
}

export function deactivate() { }
