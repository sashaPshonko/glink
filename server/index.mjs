import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import {
    addMessage,
    countUsers,
    createUser,
    findUserById,
    findUserByUsername,
    getOrCreateDm,
    getOrCreateMainGroup,
    listMessages,
    userInChat,
} from './db.mjs';
import {
    authMiddleware,
    hashPassword,
    signToken,
    verifyPassword,
    verifyToken,
} from './auth.mjs';
import {
    DISPLAY_NAMES,
    GROUP_TITLE,
    isMemberUsername,
    MEMBERS,
} from './config.mjs';

const PORT = Number(process.env.PORT || 3920);
const app = express();
app.use(express.json());

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const chatSockets = new Map();
/** @type {Map<import('ws').WebSocket, { userId: string, chatIds: Set<string> }>} */
const socketMeta = new Map();

function publicUser(user) {
    return { id: user.id, username: user.username, displayName: user.displayName };
}

function enrichMessage(msg) {
    const sender = findUserById(msg.senderId);
    return {
        ...msg,
        senderName: sender?.displayName || sender?.username || '?',
    };
}

function broadcast(chatId, payload, except = null) {
    const set = chatSockets.get(chatId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    for (const ws of set) {
        if (ws !== except && ws.readyState === 1) ws.send(raw);
    }
}

function buildChatList(userId) {
    const me = findUserById(userId);
    if (!me) return [];

    const registered = MEMBERS.map((name) => findUserByUsername(name)).filter(Boolean);
    const chats = [];

    for (const memberName of MEMBERS) {
        if (memberName === me.username) continue;
        const peer = findUserByUsername(memberName);
        if (peer) {
            const chat = getOrCreateDm(userId, peer.id);
            const last = listMessages(chat.id).at(-1);
            chats.push({
                id: chat.id,
                type: 'dm',
                waiting: false,
                peer: publicUser(peer),
                lastMessage: last
                    ? { text: last.text, createdAt: last.createdAt, senderId: last.senderId }
                    : null,
                updatedAt: last?.createdAt || chat.updatedAt,
            });
        } else {
            chats.push({
                id: `pending:${memberName}`,
                type: 'dm',
                waiting: true,
                peer: {
                    username: memberName,
                    displayName: DISPLAY_NAMES[memberName] || memberName,
                },
                lastMessage: null,
                updatedAt: new Date(0).toISOString(),
            });
        }
    }

    const memberIds = registered.map((u) => u.id);
    if (memberIds.includes(userId)) {
        const group = getOrCreateMainGroup(memberIds, GROUP_TITLE);
        const last = listMessages(group.id).at(-1);
        chats.push({
            id: group.id,
            type: 'group',
            waiting: false,
            title: group.title,
            members: memberIds
                .map((id) => findUserById(id))
                .filter(Boolean)
                .map(publicUser),
            lastMessage: last
                ? { text: last.text, createdAt: last.createdAt, senderId: last.senderId }
                : null,
            updatedAt: last?.createdAt || group.updatedAt,
        });
    }

    chats.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return chats;
}

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'glink', members: MEMBERS, group: GROUP_TITLE });
});

app.post('/auth/register', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim();
    if (!isMemberUsername(username)) {
        res.status(403).json({ error: 'not_allowed', allowed: MEMBERS });
        return;
    }
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        res.status(400).json({ error: 'bad_username' });
        return;
    }
    if (password.length < 6) {
        res.status(400).json({ error: 'bad_password' });
        return;
    }
    if (countUsers() >= MEMBERS.length && !findUserByUsername(username)) {
        res.status(403).json({ error: 'full' });
        return;
    }
    try {
        const user = createUser({
            username,
            passwordHash: hashPassword(password),
            displayName: displayName || DISPLAY_NAMES[username] || username,
        });
        res.json({ token: signToken(user.id), user: publicUser(user) });
    } catch (e) {
        if (e.message === 'username_taken') {
            res.status(409).json({ error: 'username_taken' });
            return;
        }
        throw e;
    }
});

app.post('/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!isMemberUsername(username)) {
        res.status(403).json({ error: 'not_allowed', allowed: MEMBERS });
        return;
    }
    const user = findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
    }
    res.json({ token: signToken(user.id), user: publicUser(user) });
});

app.get('/me', authMiddleware, (req, res) => {
    const user = findUserById(req.userId);
    if (!user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    res.json({ user: publicUser(user) });
});

/** 3 личных чата + группа на троих */
app.get('/chats', authMiddleware, (req, res) => {
    res.json({ chats: buildChatList(req.userId) });
});

app.get('/chats/:chatId/messages', authMiddleware, (req, res) => {
    const { chatId } = req.params;
    if (chatId.startsWith('pending:')) {
        res.status(400).json({ error: 'waiting_peer' });
        return;
    }
    if (!userInChat(req.userId, chatId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
    }
    const after = req.query.after ? String(req.query.after) : null;
    const messages = listMessages(chatId, after).map(enrichMessage);
    res.json({ messages });
});

app.post('/chats/:chatId/messages', authMiddleware, (req, res) => {
    const { chatId } = req.params;
    if (chatId.startsWith('pending:')) {
        res.status(400).json({ error: 'waiting_peer' });
        return;
    }
    if (!userInChat(req.userId, chatId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
    }
    try {
        const message = enrichMessage(
            addMessage({
                chatId,
                senderId: req.userId,
                text: req.body?.text,
            }),
        );
        const payload = { type: 'message', message };
        broadcast(chatId, payload);
        res.json({ message });
    } catch (e) {
        if (e.message === 'empty_message') {
            res.status(400).json({ error: 'empty_message' });
            return;
        }
        throw e;
    }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');
    const userId = verifyToken(token);
    if (!userId) {
        ws.close(4401, 'unauthorized');
        return;
    }

    const meta = { userId, chatIds: new Set() };
    socketMeta.set(ws, meta);

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(String(raw));
        } catch {
            return;
        }
        if (msg?.type === 'join' && msg.chatId) {
            const chatId = String(msg.chatId);
            if (chatId.startsWith('pending:')) return;
            if (!userInChat(userId, chatId)) return;
            if (!chatSockets.has(chatId)) chatSockets.set(chatId, new Set());
            chatSockets.get(chatId).add(ws);
            meta.chatIds.add(chatId);
            ws.send(JSON.stringify({ type: 'joined', chatId }));
        }
    });

    ws.on('close', () => {
        for (const chatId of meta.chatIds) {
            chatSockets.get(chatId)?.delete(ws);
        }
        socketMeta.delete(ws);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[glink] ${MEMBERS.join(', ')} + группа «${GROUP_TITLE}»`);
    console.log(`[glink] http://0.0.0.0:${PORT}  ws://0.0.0.0:${PORT}/ws`);
});
