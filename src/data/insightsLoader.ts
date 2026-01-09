import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function loadInsights(context: vscode.ExtensionContext): any | null {
	try {
		const file = path.join(context.extensionPath, 'src', 'data', 'insights.numpy.json');
		return JSON.parse(fs.readFileSync(file, 'utf-8'));
	} catch {
		return null;
	}
}