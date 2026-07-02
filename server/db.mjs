import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { MEMBERS } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GLINK_DATA || join(__dirname, 'data');
const DB_FILE = join(DATA_DIR, 'store.json');

const empty = () => ({
    users: [],
    chats: [],
    messages: [],
    files: [],
});

export function readDb() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(DB_FILE)) {
        const db = empty();
        writeDb(db);
        return db;
    }
    const db = JSON.parse(readFileSync(DB_FILE, 'utf8'));
    if (!db.files) db.files = [];
    return db;
}

export function writeDb(db) {
    writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = readDb();

function persist() {
    writeDb(db);
}

export function reloadDb() {
    db = readDb();
}

export function resetDb() {
    db = empty();
    persist();
}

export function countUsers() {
    return db.users.length;
}

export function createUser({ username, passwordHash, displayName }) {
    if (db.users.some((u) => u.username === username)) {
        throw new Error('username_taken');
    }
    const user = {
        id: randomUUID(),
        username,
        passwordHash,
        displayName: displayName || username,
        createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    persist();
    return user;
}

export function findUserByUsername(username) {
    return db.users.find((u) => u.username === username) || null;
}

export function findUserById(id) {
    return db.users.find((u) => u.id === id) || null;
}

export function listUsersExcept(userId) {
    return db.users
        .filter((u) => u.id !== userId)
        .map(({ id, username, displayName }) => ({ id, username, displayName }));
}

export function dmKey(a, b) {
    return [a, b].sort().join(':');
}

export function getOrCreateMainGroup(memberIds, title) {
    const key = MEMBERS.slice().sort().join('+');
    const sorted = [...new Set(memberIds)].sort();
    let chat = db.chats.find((c) => c.type === 'group' && c.groupKey === key);
    if (!chat) {
        chat = {
            id: randomUUID(),
            type: 'group',
            groupKey: key,
            title,
            memberIds: sorted,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        db.chats.push(chat);
        persist();
        return chat;
    }
    const merged = [...new Set([...chat.memberIds, ...sorted])].sort();
    if (merged.join(',') !== chat.memberIds.slice().sort().join(',')) {
        chat.memberIds = merged;
        chat.updatedAt = new Date().toISOString();
        persist();
    }
    if (chat.title !== title) {
        chat.title = title;
        persist();
    }
    return chat;
}

export function getOrCreateDm(userId, peerId) {
    const key = dmKey(userId, peerId);
    let chat = db.chats.find((c) => c.type === 'dm' && c.dmKey === key);
    if (!chat) {
        chat = {
            id: randomUUID(),
            type: 'dm',
            dmKey: key,
            memberIds: [userId, peerId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        db.chats.push(chat);
        persist();
    }
    return chat;
}

function lastMessageFor(chatId) {
    return db.messages
        .filter((m) => m.chatId === chatId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

export function messagePreview(msg) {
    if (!msg) return '';
    if (msg.kind === 'image') return msg.text ? `📷 ${msg.text}` : '📷 фото';
    if (msg.kind === 'voice') return '🎤 голосовое';
    if (msg.kind === 'video_note') return '🎬 кружок';
    if (msg.kind === 'video') return msg.file?.name ? `🎬 ${msg.file.name}` : '🎬 видео';
    if (msg.kind === 'audio') return msg.file?.name ? `🎵 ${msg.file.name}` : '🎵 аудио';
    if (msg.kind === 'file') return `📎 ${msg.file?.name || 'файл'}`;
    if (msg.kind === 'album' || (msg.files?.length > 1)) {
        const n = msg.files?.length || 0;
        if (msg.text) return `📎 ${n} вложения · ${msg.text}`;
        return `📎 ${n} вложения`;
    }
    return msg.text || '';
}

export function listChatsForUser(userId) {
    return db.chats
        .filter((c) => c.memberIds.includes(userId))
        .map((chat) => formatChatRow(chat, userId))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function formatChatRow(chat, userId) {
    const last = lastMessageFor(chat.id);
    const base = {
        id: chat.id,
        type: chat.type,
        lastMessage: last
            ? {
                text: messagePreview(last),
                kind: last.kind || 'text',
                createdAt: last.createdAt,
                senderId: last.senderId,
            }
            : null,
        updatedAt: last?.createdAt || chat.updatedAt,
    };
    if (chat.type === 'group') {
        return {
            ...base,
            title: chat.title,
            members: chat.memberIds
                .map((id) => findUserById(id))
                .filter(Boolean)
                .map(({ id, username, displayName }) => ({ id, username, displayName })),
        };
    }
    const peerId = chat.memberIds.find((id) => id !== userId);
    const peer = peerId ? findUserById(peerId) : null;
    return {
        ...base,
        peer: peer
            ? { id: peer.id, username: peer.username, displayName: peer.displayName }
            : null,
    };
}

export function userInChat(userId, chatId) {
    const chat = db.chats.find((c) => c.id === chatId);
    return Boolean(chat?.memberIds.includes(userId));
}

export function listMessages(chatId, after = null) {
    let rows = db.messages.filter((m) => m.chatId === chatId);
    if (after) {
        const t = Date.parse(after);
        rows = rows.filter((m) => Date.parse(m.createdAt) > t);
    }
    return rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function addMessage({ chatId, senderId, text, kind = 'text', file = null, files = null }) {
    const chat = db.chats.find((c) => c.id === chatId);
    if (!chat) throw new Error('chat_not_found');

    const entries = Array.isArray(files) && files.length
        ? files.map((f) => ({
            id: f.id,
            name: f.name || f.originalName || 'файл',
            mime: f.mime || '',
            size: f.size || 0,
            kind: f.kind || 'file',
        }))
        : file
            ? [{
                id: file.id,
                name: file.originalName || file.name,
                mime: file.mime,
                size: file.size,
                kind: kind || 'file',
            }]
            : [];

    const msgKind = entries.length > 1
        ? 'album'
        : entries.length === 1
            ? (entries[0].kind || kind || 'file')
            : (kind || 'text');

    const msg = {
        id: randomUUID(),
        chatId,
        senderId,
        kind: msgKind,
        text: String(text || '').trim(),
        file: entries[0]
            ? {
                id: entries[0].id,
                name: entries[0].name,
                mime: entries[0].mime,
                size: entries[0].size,
            }
            : null,
        files: entries.length > 1 ? entries : undefined,
        createdAt: new Date().toISOString(),
        readBy: [],
        reactions: {},
    };

    if (msgKind === 'text' && !msg.text) throw new Error('empty_message');
    if (msgKind !== 'text' && !entries.length) throw new Error('empty_message');

    db.messages.push(msg);
    chat.updatedAt = msg.createdAt;
    persist();
    return msg;
}

export function editMessage({ messageId, chatId, userId, text }) {
    const msg = db.messages.find((m) => m.id === messageId && m.chatId === chatId);
    if (!msg) throw new Error('message_not_found');
    if (msg.senderId !== userId) throw new Error('forbidden');
    if (msg.kind !== 'text' && !msg.text) throw new Error('not_editable');

    const newText = String(text ?? '').trim();
    if (msg.kind === 'text' && !newText) throw new Error('empty_message');

    msg.text = newText;
    msg.editedAt = new Date().toISOString();

    const chat = findChatById(chatId);
    if (chat) chat.updatedAt = msg.editedAt;
    persist();
    return msg;
}

const REACTION_KEYS = new Set(['heart', 'thumbs', 'fire', 'strawberry']);

export function toggleMessageReaction({ messageId, chatId, userId, reaction }) {
    if (!REACTION_KEYS.has(reaction)) throw new Error('invalid_reaction');
    const msg = db.messages.find((m) => m.id === messageId && m.chatId === chatId);
    if (!msg) throw new Error('message_not_found');
    const chat = findChatById(chatId);
    if (!chat?.memberIds.includes(userId)) throw new Error('forbidden');

    if (!msg.reactions || typeof msg.reactions !== 'object') msg.reactions = {};
    if (msg.reactions[userId] === reaction) delete msg.reactions[userId];
    else msg.reactions[userId] = reaction;

    persist();
    return msg;
}

export function findChatById(chatId) {
    return db.chats.find((c) => c.id === chatId) || null;
}

export function isMessageUnread(message, userId) {
    if (!message || message.senderId === userId) return false;
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    return !readBy.includes(userId);
}

export function countUnreadMessages(chatId, userId) {
    let count = 0;
    for (const msg of db.messages) {
        if (msg.chatId !== chatId) continue;
        if (isMessageUnread(msg, userId)) count++;
    }
    return count;
}

/** @returns {string[]} ids of messages newly marked read */
export function markMessagesReadByIds(chatId, readerId, messageIds) {
    const chat = findChatById(chatId);
    if (!chat?.memberIds.includes(readerId)) return [];

    const wanted = new Set(messageIds);
    const updated = [];
    for (const msg of db.messages) {
        if (msg.chatId !== chatId || !wanted.has(msg.id)) continue;
        if (msg.senderId === readerId) continue;
        if (!Array.isArray(msg.readBy)) msg.readBy = [];
        if (!msg.readBy.includes(readerId)) {
            msg.readBy.push(readerId);
            updated.push(msg.id);
        }
    }
    if (updated.length) persist();
    return updated;
}

/** @returns {string[]} ids of messages newly marked read */
export function markMessagesRead(chatId, readerId) {
    const chat = findChatById(chatId);
    if (!chat?.memberIds.includes(readerId)) return [];

    const updated = [];
    for (const msg of db.messages) {
        if (msg.chatId !== chatId) continue;
        if (msg.senderId === readerId) continue;
        if (!Array.isArray(msg.readBy)) msg.readBy = [];
        if (!msg.readBy.includes(readerId)) {
            msg.readBy.push(readerId);
            updated.push(msg.id);
        }
    }
    if (updated.length) persist();
    return updated;
}

/** @returns {'sent'|'read'|null} status for viewer's own messages */
export function readStatusFor(message, chat, viewerId) {
    if (!message || message.senderId !== viewerId) return null;
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    const others = (chat?.memberIds || []).filter((id) => id !== viewerId);
    if (!others.length) return 'sent';
    return others.some((id) => readBy.includes(id)) ? 'read' : 'sent';
}
