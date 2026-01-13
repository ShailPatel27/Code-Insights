import * as vscode from 'vscode';
import { loadInsights } from "../data/insightsLoader";
import { resolveFunction } from "../detection/functionResolver";

export function provideInsightHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ExtensionContext
): vscode.Hover | null {

    const resolved = resolveFunction(document.getText(), position.line);
    if (!resolved) { return null; };

    const data = loadInsights(context);
    if (!data) { return null; };

    const key = resolved.key;
    const entry = data[key];
    if (!entry) {return null;};

    if (!key || !entry) { return null; };

    const md = new vscode.MarkdownString(undefined, true);

    md.isTrusted = true;

    // md.appendMarkdown(`### $(lightbulb) Code Insights\n`);
    // md.appendMarkdown(`**${word.toUpperCase()}**  \n`);
    const displayName = key.split('.').pop() ?? key;
    md.appendMarkdown(`**${displayName.toUpperCase()}**  \n`);

    md.appendMarkdown(`\`${key}\`\n\n`);

    md.appendMarkdown(`$(lightbulb) **What it does**  \n`);
    md.appendMarkdown(`${entry.description}\n\n`);

    if (entry.behavioralNotes?.length) {
        md.appendMarkdown(`$(warning) **Behavioral Notes**  \n`);
        for (const note of entry.behavioralNotes) {
            md.appendMarkdown(`• ${note}  \n`);
        }
    }

    const learn = encodeURIComponent(JSON.stringify([key, 'learn']));
    const test = encodeURIComponent(JSON.stringify([key, 'test']));
    const ai = encodeURIComponent(JSON.stringify([key, 'ai']));

    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(`### [\` Learn More \`](command:code-insights.open?${learn})  `);
    md.appendMarkdown(`[\` Test \`](command:code-insights.open?${test})  `);
    md.appendMarkdown(`[\` Ask AI \`](command:code-insights.open?${ai})`);



    return new vscode.Hover(md);
}

export function registerHoverProvider(context: vscode.ExtensionContext) {
    const hoverProvider = vscode.languages.registerHoverProvider('python', {
        provideHover(document, position) {
            return provideInsightHover(document, position, context);
        }
    });

    context.subscriptions.push(hoverProvider);
}
