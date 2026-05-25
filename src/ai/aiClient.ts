import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ChatMessage } from './chatStore';

type Env = Record<string, string>;

type InsightEntry = {
	qualifiedName?: string;
	signature?: string;
	description?: string;
	behavioralNotes?: string[];
	usage?: Array<{ title?: string; code?: string }>;
};

type AiProvider = 'openai' | 'gemini';

type AiConfig = {
	provider: AiProvider;
	model: string;
	apiKeys: string[];
};

type OpenAIResponse = {
	output_text?: string;
	output?: Array<{
		content?: Array<{
			text?: string;
			type?: string;
		}>;
	}>;
	error?: {
		message?: string;
	};
};

type GeminiResponse = {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
			}>;
		};
	}>;
	error?: {
		message?: string;
	};
};

export async function askInsightAi(
	context: vscode.ExtensionContext,
	entry: InsightEntry,
	messages: ChatMessage[],
	responseStyle = 'simple',
	chatScope = 'function'
): Promise<string> {
	const config = getAiConfig(context);
	const systemPrompt = buildSystemPrompt(entry, responseStyle, chatScope);

	if (config.provider === 'gemini') {
		return askGemini(config, systemPrompt, messages);
	}

	return askOpenAI(config, systemPrompt, messages);
}

export async function suggestChatTitle(context: vscode.ExtensionContext, firstMessage: string): Promise<string> {
	const config = getAiConfig(context);
	const prompt = [
		'Create a short chat title for this developer question.',
		'Return only the title. No quotes. No punctuation at the end.',
		'Use 2 to 5 words.',
		'',
		firstMessage
	].join('\n');
	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: prompt,
			createdAt: new Date().toISOString()
		}
	];
	const title = config.provider === 'gemini'
		? await askGemini(config, 'You create concise chat titles.', messages)
		: await askOpenAI(config, 'You create concise chat titles.', messages);

	return cleanTitle(title, firstMessage);
}

export function getAiConfig(context: vscode.ExtensionContext): AiConfig {
	const env = loadEnv(context);
	const configuredProvider = (env.CODE_INSIGHTS_AI_PROVIDER ?? '').toLowerCase();
	const provider = resolveProvider(configuredProvider, env);

	if (provider !== 'openai' && provider !== 'gemini') {
		throw new Error('CODE_INSIGHTS_AI_PROVIDER must be "openai" or "gemini".');
	}

	if (provider === 'gemini') {
		const apiKeys = parseApiKeys(env.GEMINI_API_KEY);
		if (!apiKeys.length) {
			throw new Error('Missing GEMINI_API_KEY in .env.');
		}

		return {
			provider,
			apiKeys,
			model: env.CODE_INSIGHTS_AI_MODEL ?? env.GEMINI_MODEL ?? 'gemini-2.5-flash'
		};
	}

	const apiKeys = parseApiKeys(env.OPENAI_API_KEY);
	if (!apiKeys.length) {
		throw new Error('Missing OPENAI_API_KEY in .env.');
	}

	return {
		provider,
		apiKeys,
		model: env.CODE_INSIGHTS_AI_MODEL ?? env.OPENAI_MODEL ?? 'gpt-4.1-mini'
	};
}

function resolveProvider(configuredProvider: string, env: Env): AiProvider {
	if (configuredProvider && configuredProvider !== 'openai' && configuredProvider !== 'gemini') {
		throw new Error('CODE_INSIGHTS_AI_PROVIDER must be "openai" or "gemini".');
	}

	if (configuredProvider === 'gemini') {
		return 'gemini';
	}

	if (configuredProvider === 'openai' && env.OPENAI_API_KEY) {
		return 'openai';
	}

	if (env.GEMINI_API_KEY) {
		return 'gemini';
	}

	return 'openai';
}

function loadEnv(context: vscode.ExtensionContext): Env {
	const envFiles = [
		...workspaceEnvFiles(),
		path.join(context.extensionPath, '.env')
	];

	return envFiles.reduce<Env>((values, file) => {
		if (!fs.existsSync(file)) {
			return values;
		}

		return {
			...values,
			...parseEnv(fs.readFileSync(file, 'utf-8'))
		};
	}, { ...process.env } as Env);
}

function workspaceEnvFiles(): string[] {
	return vscode.workspace.workspaceFolders?.map(folder =>
		path.join(folder.uri.fsPath, '.env')
	) ?? [];
}

function parseEnv(content: string): Env {
	const values: Env = {};

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		const separator = line.indexOf('=');
		if (separator === -1) {
			continue;
		}

		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		values[key] = unquote(value);
	}

	return values;
}

function unquote(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

function parseApiKeys(value: string | undefined): string[] {
	return value
		?.split(',')
		.map(key => key.trim())
		.filter(Boolean) ?? [];
}

function buildSystemPrompt(entry: InsightEntry, responseStyle: string, chatScope: string): string {
	const notes = entry.behavioralNotes?.map(note => `- ${note}`).join('\n') ?? '- No behavioral notes available.';
	const usage = entry.usage?.map(item => `${item.title ?? 'Usage'}:\n${item.code ?? ''}`).join('\n\n') ?? 'No usage example available.';
	const styleInstruction = getStyleInstruction(responseStyle);
	const scopeInstruction = chatScope === 'general'
		? 'Conversation scope: general. Answer the user normally. Use the current function only if it is clearly relevant.'
		: 'Conversation scope: current function. Prioritize the selected function context unless the user clearly asks something unrelated.';

	return [
		'You are Code Insights, a concise teaching assistant inside VS Code.',
		'Explain Python/library behavior accurately for learners.',
		'Do not claim to execute code. If behavior depends on runtime values, say so.',
		'You know the currently selected function context below.',
		'Decide from each user question whether they are asking about this function or a broader programming topic.',
		'If the question is about something else, answer normally and briefly mention when the current function context is not relevant.',
		scopeInstruction,
		styleInstruction,
		'Use Markdown formatting naturally: short paragraphs, bullets when useful, **bold** for key terms, tables when comparing things, and fenced code blocks for code.',
		'',
		`Function: ${entry.qualifiedName ?? 'unknown'}`,
		`Signature: ${entry.signature ?? 'unknown'}`,
		`Description: ${entry.description ?? 'No description available.'}`,
		'Behavioral notes:',
		notes,
		'Usage:',
		usage
	].join('\n');
}

function getStyleInstruction(responseStyle: string): string {
	if (responseStyle === 'short') {
		return 'Response style: short. Answer in 1-3 concise sentences unless code is necessary.';
	}

	if (responseStyle === 'detailed') {
		return 'Response style: detailed. Explain the concept with practical examples and mention common mistakes.';
	}

	if (responseStyle === 'baby') {
		return 'Response style: baby. Explain like the user is a child or total beginner, using simple words and gentle analogies.';
	}

	return 'Response style: simple. Keep the answer clear, practical, and not too long.';
}

function cleanTitle(title: string, fallback: string): string {
	const compact = title
		.replace(/^["']|["']$/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	if (!compact) {
		return fallback.replace(/\s+/g, ' ').trim().slice(0, 48) || 'New chat';
	}

	return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
}

async function askOpenAI(config: AiConfig, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
	let lastError: Error | undefined;

	for (const apiKey of config.apiKeys) {
		try {
			return await askOpenAIWithKey(config.model, apiKey, systemPrompt, messages);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error('OpenAI request failed.');
		}
	}

	throw lastError ?? new Error('OpenAI request failed.');
}

async function askOpenAIWithKey(
	model: string,
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[]
): Promise<string> {
	const response = await fetch('https://api.openai.com/v1/responses', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			input: [
				{ role: 'system', content: systemPrompt },
				...messages.map(message => ({
					role: message.role,
					content: message.content
				}))
			]
		})
	});

	const data = await response.json() as OpenAIResponse;
	if (!response.ok) {
		throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}.`);
	}

	const text = data.output_text ?? data.output
		?.flatMap(item => item.content ?? [])
		.map(content => content.text)
		.find(Boolean);

	if (!text) {
		throw new Error('OpenAI returned no text response.');
	}

	return text;
}

async function askGemini(config: AiConfig, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
	let lastError: Error | undefined;

	for (const apiKey of config.apiKeys) {
		try {
			return await askGeminiWithKey(config.model, apiKey, systemPrompt, messages);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error('Gemini request failed.');
		}
	}

	throw lastError ?? new Error('Gemini request failed.');
}

async function askGeminiWithKey(
	modelName: string,
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[]
): Promise<string> {
	const model = encodeURIComponent(modelName);
	const key = encodeURIComponent(apiKey);
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				systemInstruction: {
					parts: [
						{ text: systemPrompt }
					]
				},
				contents: messages.map(message => ({
					role: message.role === 'assistant' ? 'model' : 'user',
					parts: [
						{ text: message.content }
					]
				}))
			})
		}
	);

	const data = await response.json() as GeminiResponse;
	if (!response.ok) {
		throw new Error(data.error?.message ?? `Gemini request failed with ${response.status}.`);
	}

	const text = data.candidates?.[0]?.content?.parts
		?.map(part => part.text)
		.find(Boolean);

	if (!text) {
		throw new Error('Gemini returned no text response.');
	}

	return text;
}
