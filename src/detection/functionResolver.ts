import * as vscode from 'vscode';
import { loadInsights } from '../extension';

export type ResolvedFunction = {
  key: string; // e.g. "np.random.shuffle"
};

export function resolveFunction(
  documentText: string,
  lineNumber: number
): ResolvedFunction | null {
  const lines = documentText.split("\n");

  const { aliasMap, directMap } = parseImports(lines);

  const line = lines[lineNumber];
  if (!line) {return null;};

  // case 1: np.random.shuffle(...)
  let m = line.match(/(\w+)\.(\w+)\.(\w+)\s*\(/);
  if (m) {
    const alias = m[1];
    const module = aliasMap.get(alias);
    if (!module) {return null;};

    return {
      key: `${alias}.${m[2]}.${m[3]}`
    };
  }

  // case 2: shuffle(...)
  m = line.match(/(\w+)\s*\(/);
  if (m) {
    const fn = m[1];
    const full = directMap.get(fn);
    if (!full) {return null;};

    // convert numpy.random.shuffle → np.random.shuffle
    return {
      key: `np.${full.replace(/^numpy\./, "")}`
    };
  }

  return null;
}

function parseImports(lines: string[]) {
  const aliasMap = new Map<string, string>();
  const directMap = new Map<string, string>();

  for (const line of lines) {
    let m;

    // import numpy as np
    m = line.match(/^import\s+(\w+)\s+as\s+(\w+)/);
    if (m) {
      aliasMap.set(m[2], m[1]);
      continue;
    }

    // import numpy
    m = line.match(/^import\s+(\w+)/);
    if (m) {
      aliasMap.set(m[1], m[1]);
      continue;
    }

    // from numpy.random import shuffle
    m = line.match(/^from\s+([\w\.]+)\s+import\s+(\w+)\s*$/);
    if (m) {
      directMap.set(m[2], `${m[1]}.${m[2]}`);
    }

    // ❌ intentionally ignore: "as ad"
  }

  return { aliasMap, directMap };
}

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