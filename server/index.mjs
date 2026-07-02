import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
    addMessage,
    countUsers,
    createUser,
    findUserById,
    findUserByUsername,
    getOrCreateDm,
    getOrCreateMainGroup,
    listMessages,
    messagePreview,
    userInChat,
} from './db.mjs';
import {
    authMiddleware,
    signToken,
    verifyToken,
} from './auth.mjs';
import {
    DISPLAY_NAMES,
    GROUP_TITLE,
    isMemberUsername,
    MEMBERS,
} from './config.mjs';
import {
    ensureUploadsDir,
    filePath,
    getFileRecord,
    guessKind,
    maxUploadBytes,
    registerFile,
    safeExt,
    UPLOADS_DIR,
} from './files.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, 'web');

const PORT = Number(process.env.PORT || 3920);
const app = express();

ensureUploadsDir();

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            ensureUploadsDir();
            cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
            cb(null, randomUUID() + safeExt(file.originalname, file.mimetype));
        },
    }),
    limits: { fileSize: maxUploadBytes() },
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
    );
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});

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
    const base = {
        ...msg,
        kind: msg.kind || 'text',
        senderName: sender?.displayName || sender?.username || '?',
    };
    if (msg.file?.id) {
        base.fileUrl = `/files/${msg.file.id}`;
    }
    return base;
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
                    ? {
                        text: messagePreview(last),
                        kind: last.kind || 'text',
                        createdAt: last.createdAt,
                        senderId: last.senderId,
                    }
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
                ? {
                    text: messagePreview(last),
                    kind: last.kind || 'text',
                    createdAt: last.createdAt,
                    senderId: last.senderId,
                }
                : null,
            updatedAt: last?.createdAt || group.updatedAt,
        });
    }

    chats.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return chats;
}

function authFromQueryOrHeader(req, res, next) {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ')
        ? hdr.slice(7)
        : String(req.query.token || '');
    const userId = verifyToken(token);
    if (!userId) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    req.userId = userId;
    req.authToken = token;
    next();
}

function sendWebApp(res) {
    res.sendFile(join(WEB_DIR, 'index.html'));
}

app.get('/', (_req, res) => {
    sendWebApp(res);
});

app.get('/app', (_req, res) => {
    sendWebApp(res);
});

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'glink',
        members: MEMBERS,
        group: GROUP_TITLE,
        accounts: MEMBERS.map((username) => ({
            username,
            displayName: DISPLAY_NAMES[username] || username,
            taken: Boolean(findUserByUsername(username)),
        })),
    });
});

function parseUsername(body) {
    return String(body?.username || '').trim().toLowerCase();
}

function rejectBadUsername(username, res) {
    if (!isMemberUsername(username)) {
        res.status(403).json({ error: 'not_allowed', allowed: MEMBERS });
        return true;
    }
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        res.status(400).json({ error: 'bad_username' });
        return true;
    }
    return false;
}

function enterAs(username, res) {
    const existing = findUserByUsername(username);
    if (existing) {
        res.json({
            token: signToken(existing.id),
            user: publicUser(existing),
            created: false,
        });
        return;
    }
    if (countUsers() >= MEMBERS.length) {
        res.status(403).json({ error: 'full' });
        return;
    }
    try {
        const user = createUser({
            username,
            passwordHash: '',
            displayName: DISPLAY_NAMES[username] || username,
        });
        res.json({
            token: signToken(user.id),
            user: publicUser(user),
            created: true,
        });
    } catch (e) {
        if (e.message === 'username_taken') {
            const again = findUserByUsername(username);
            if (again) {
                res.json({
                    token: signToken(again.id),
                    user: publicUser(again),
                    created: false,
                });
                return;
            }
            res.status(409).json({ error: 'username_taken' });
            return;
        }
        throw e;
    }
}

/** Выбрал себя — зашёл. Без паролей, чат на троих. */
app.post('/auth/signin', (req, res) => {
    const username = parseUsername(req.body);
    if (rejectBadUsername(username, res)) return;
    enterAs(username, res);
});

app.post('/auth/register', (req, res) => {
    const username = parseUsername(req.body);
    if (rejectBadUsername(username, res)) return;
    enterAs(username, res);
});

app.post('/auth/login', (req, res) => {
    const username = parseUsername(req.body);
    if (rejectBadUsername(username, res)) return;
    enterAs(username, res);
});

app.get('/me', authMiddleware, (req, res) => {
    const user = findUserById(req.userId);
    if (!user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    res.json({ user: publicUser(user) });
});

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

function maybeUpload(req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
        upload.single('file')(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    res.status(413).json({ error: 'file_too_large' });
                    return;
                }
                next(err);
                return;
            }
            next();
        });
        return;
    }
    next();
}

app.post('/chats/:chatId/messages', authMiddleware, maybeUpload, (req, res) => {
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
        let message;
        if (req.file) {
            const stored = registerFile({
                storedName: req.file.filename,
                originalName: req.file.originalname,
                mime: req.file.mimetype,
                size: req.file.size,
                uploaderId: req.userId,
            });
            const kind = guessKind(req.file.mimetype, req.body?.kind);
            message = enrichMessage(
                addMessage({
                    chatId,
                    senderId: req.userId,
                    text: req.body?.text,
                    kind,
                    file: stored,
                }),
            );
        } else {
            message = enrichMessage(
                addMessage({
                    chatId,
                    senderId: req.userId,
                    text: req.body?.text,
                    kind: 'text',
                }),
            );
        }
        broadcast(chatId, { type: 'message', message });
        res.json({ message });
    } catch (e) {
        if (e.message === 'empty_message') {
            res.status(400).json({ error: 'empty_message' });
            return;
        }
        throw e;
    }
});

app.get('/files/:fileId', authFromQueryOrHeader, (req, res) => {
    const record = getFileRecord(req.params.fileId);
    if (!record) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    const path = filePath(record);
    if (!existsSync(path)) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.setHeader('Content-Type', record.mime || 'application/octet-stream');
    res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(record.originalName)}"`,
    );
    res.sendFile(path);
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
    console.log(`[glink] веб-клиент: http://0.0.0.0:${PORT}/`);
    console.log(`[glink] ws://0.0.0.0:${PORT}/ws`);
});
