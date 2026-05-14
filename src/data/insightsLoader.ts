import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function loadInsights(context: vscode.ExtensionContext): any | null {
	try {
		const dataDirs = [
			path.join(context.extensionPath, 'dist', 'data', 'insights.numpy.json'),
			path.join(context.extensionPath, 'src', 'data', 'insights.numpy.json')
		].map(file => path.dirname(file));

		const dataDir = dataDirs.find(candidate => fs.existsSync(candidate));
		if (!dataDir) { return null; }

		const files = fs
			.readdirSync(dataDir)
			.filter(file => file.endsWith('.json'));

		return files.reduce((entries, file) => {
			const fullPath = path.join(dataDir, file);
			return {
				...entries,
				...JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
			};
		}, {});
	} catch {
		return null;
	}
}
