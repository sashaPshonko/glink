import { existsSync, mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { readDb, reloadDb, writeDb } from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.GLINK_DATA || join(__dirname, 'data');
export const UPLOADS_DIR = join(DATA_DIR, 'uploads');

const MAX_BYTES = Number(process.env.GLINK_MAX_UPLOAD || 25 * 1024 * 1024);

export function ensureUploadsDir() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function maxUploadBytes() {
    return MAX_BYTES;
}

export function guessKind(mime, hint = '') {
    const m = String(mime || '').toLowerCase();
    const h = String(hint || '').toLowerCase();
    if (h === 'file') return 'file';
    if (h === 'video_note') return 'video_note';
    if (h === 'voice') return 'voice';
    if (h === 'sticker') return 'sticker';
    if (h === 'audio') return 'audio';
    if (h === 'video') return 'video';
    if (h === 'image') return 'image';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'file';
}

export function safeExt(name, mime) {
    const fromName = extname(String(name || '')).toLowerCase();
    if (fromName && fromName.length <= 8) return fromName;
    const m = String(mime || '').toLowerCase();
    if (m.startsWith('video/')) {
        if (m.includes('webm')) return '.webm';
        if (m.includes('quicktime')) return '.mov';
        return '.mp4';
    }
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('png')) return '.png';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('webm')) return '.webm';
    if (m.includes('ogg')) return '.ogg';
    if (m.includes('mp4') || m.includes('m4a')) return m.startsWith('audio/') ? '.m4a' : '.mp4';
    if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
    if (m.includes('pdf')) return '.pdf';
    return '';
}

export function registerFile(meta) {
    ensureUploadsDir();
    const db = readDb();
    if (!db.files) db.files = [];
    const file = {
        id: randomUUID(),
        storedName: meta.storedName,
        originalName: String(meta.originalName || 'file'),
        mime: String(meta.mime || 'application/octet-stream'),
        size: Number(meta.size || 0),
        uploaderId: meta.uploaderId,
        createdAt: new Date().toISOString(),
    };
    db.files.push(file);
    writeDb(db);
    reloadDb();
    return file;
}

export function getFileRecord(id) {
    reloadDb();
    const db = readDb();
    return db.files?.find((f) => f.id === id) || null;
}

export function filePath(record) {
    return join(UPLOADS_DIR, record.storedName);
}
