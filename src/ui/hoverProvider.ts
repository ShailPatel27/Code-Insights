import * as vscode from 'vscode';
import { loadInsights } from "../data/insightsLoader";



export function provideInsightHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ExtensionContext
): vscode.Hover | null {

    const range = document.getWordRangeAtPosition(position);
    if (!range) { return null; };

    const word = document.getText(range);
    const data = loadInsights(context);
    if (!data) { return null; };

    let key: string | null = null;
    let entry: any = null;

    for (const k of Object.keys(data)) {
        if (k.endsWith(`.${word}`) || k === word) {
            key = k;
            entry = data[k];
            break;
        }
    }

    if (!key || !entry) { return null; };

    const md = new vscode.MarkdownString(undefined, true);

    md.isTrusted = true;

    // md.appendMarkdown(`### $(lightbulb) Code Insights\n`);
    md.appendMarkdown(`**${word.toUpperCase()}**  \n`);
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
