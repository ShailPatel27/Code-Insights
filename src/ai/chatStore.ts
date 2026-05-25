import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
};

export type SavedChat = {
	id: string;
	title: string;
	functionKey: string;
	createdAt: string;
	updatedAt: string;
	messages: ChatMessage[];
};

type ChatDb = {
	chats: SavedChat[];
};

const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

export class ChatStore {
	private readonly dbPath: string;
	private temporaryChats = new Map<string, SavedChat>();

	constructor(private readonly context: vscode.ExtensionContext) {
		this.dbPath = path.join(context.globalStorageUri.fsPath, 'chats.json');
	}

	listChats(): SavedChat[] {
		const db = this.readDb();
		return [...db.chats, ...this.temporaryChats.values()]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	getChat(chatId: string): SavedChat | undefined {
		return this.temporaryChats.get(chatId) ?? this.readDb().chats.find(chat => chat.id === chatId);
	}

	createChat(functionKey: string, temporary = false, firstQuestion?: string): SavedChat {
		const now = new Date().toISOString();
		const chat: SavedChat = {
			id: `${temporary ? 'temp' : 'chat'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			title: firstQuestion ? makeTitle(firstQuestion) : 'New chat',
			functionKey,
			createdAt: now,
			updatedAt: now,
			messages: []
		};

		if (temporary) {
			this.temporaryChats.set(chat.id, chat);
			return chat;
		}

		const db = this.readDb();
		db.chats.unshift(chat);
		this.writeDb(db);
		return chat;
	}

	addMessage(chatId: string, message: ChatMessage): SavedChat {
		const temporary = this.temporaryChats.get(chatId);
		if (temporary) {
			temporary.messages.push(message);
			temporary.updatedAt = message.createdAt;
			if (temporary.title === 'New chat' && message.role === 'user') {
				temporary.title = makeTitle(message.content);
			}
			return temporary;
		}

		const db = this.readDb();
		const chat = db.chats.find(item => item.id === chatId);
		if (!chat) {
			throw new Error('Chat not found.');
		}

		chat.messages.push(message);
		chat.updatedAt = message.createdAt;
		if (chat.title === 'New chat' && message.role === 'user') {
			chat.title = makeTitle(message.content);
		}

		this.writeDb(db);
		return chat;
	}

	renameChat(chatId: string, title: string): SavedChat {
		const nextTitle = title.trim() || 'Untitled chat';
		const temporary = this.temporaryChats.get(chatId);
		if (temporary) {
			temporary.title = nextTitle;
			temporary.updatedAt = new Date().toISOString();
			return temporary;
		}

		const db = this.readDb();
		const chat = db.chats.find(item => item.id === chatId);
		if (!chat) {
			throw new Error('Chat not found.');
		}

		chat.title = nextTitle;
		chat.updatedAt = new Date().toISOString();
		this.writeDb(db);
		return chat;
	}

	deleteChat(chatId: string): void {
		if (this.temporaryChats.delete(chatId)) {
			return;
		}

		const db = this.readDb();
		db.chats = db.chats.filter(chat => chat.id !== chatId);
		this.writeDb(db);
	}

	removeLastAssistantMessage(chatId: string): SavedChat {
		const temporary = this.temporaryChats.get(chatId);
		if (temporary) {
			const index = findLastAssistantIndex(temporary.messages);
			if (index !== -1) {
				temporary.messages.splice(index, 1);
				temporary.updatedAt = new Date().toISOString();
			}
			return temporary;
		}

		const db = this.readDb();
		const chat = db.chats.find(item => item.id === chatId);
		if (!chat) {
			throw new Error('Chat not found.');
		}

		const index = findLastAssistantIndex(chat.messages);
		if (index !== -1) {
			chat.messages.splice(index, 1);
			chat.updatedAt = new Date().toISOString();
			this.writeDb(db);
		}

		return chat;
	}

	clearTemporaryChats(): void {
		this.temporaryChats.clear();
	}

	private readDb(): ChatDb {
		fs.mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });

		if (!fs.existsSync(this.dbPath)) {
			return { chats: [] };
		}

		const db = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8')) as ChatDb;
		const cutoff = Date.now() - maxAgeMs;
		const chats = (db.chats ?? []).filter(chat => new Date(chat.updatedAt).getTime() >= cutoff);

		if (chats.length !== (db.chats ?? []).length) {
			this.writeDb({ chats });
		}

		return { chats };
	}

	private writeDb(db: ChatDb): void {
		fs.mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });
		fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2));
	}
}

function findLastAssistantIndex(messages: ChatMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].role === 'assistant') {
			return index;
		}
	}

	return -1;
}

export function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
	return {
		role,
		content,
		createdAt: new Date().toISOString()
	};
}

function makeTitle(question: string): string {
	const compact = question.replace(/\s+/g, ' ').trim();
	if (!compact) {
		return 'New chat';
	}

	return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
}
