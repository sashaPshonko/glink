import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const TOKEN_KEY = 'glink_token';
const SERVER_KEY = 'glink_server';

export function defaultServerUrl() {
    return Constants.expoConfig?.extra?.serverUrl || 'http://127.0.0.1:3920';
}

export async function getServerUrl() {
    const saved = await AsyncStorage.getItem(SERVER_KEY);
    return saved || defaultServerUrl();
}

export async function setServerUrl(url) {
    await AsyncStorage.setItem(SERVER_KEY, url.replace(/\/$/, ''));
}

export async function getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token) {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function api(path, { method = 'GET', body, token, formData } = {}) {
    const base = await getServerUrl();
    const headers = {};
    if (!formData) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: formData || (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `http_${res.status}`);
        err.code = data.error;
        throw err;
    }
    return data;
}

export async function fileUrl(path) {
    const base = await getServerUrl();
    const token = await getToken();
    const sep = path.includes('?') ? '&' : '?';
    return `${base}${path}${sep}token=${encodeURIComponent(token || '')}`;
}

export async function testServer(url) {
    const base = (url || (await getServerUrl())).replace(/\/$/, '');
    const res = await fetch(`${base}/health`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error('bad_health');
    return data;
}

export async function signin({ username, serverUrl }) {
    if (serverUrl) await setServerUrl(serverUrl);
    const data = await api('/auth/signin', {
        method: 'POST',
        body: { username },
    });
    await setToken(data.token);
    return data;
}

export async function register({ username, password, displayName, serverUrl }) {
    if (serverUrl) await setServerUrl(serverUrl);
    const data = await api('/auth/register', {
        method: 'POST',
        body: { username, password, displayName },
    });
    await setToken(data.token);
    return data;
}

export async function login({ username, password, serverUrl }) {
    if (serverUrl) await setServerUrl(serverUrl);
    const data = await api('/auth/login', {
        method: 'POST',
        body: { username, password },
    });
    await setToken(data.token);
    return data;
}

export async function logout() {
    await setToken(null);
}

export async function fetchMe() {
    const token = await getToken();
    return api('/me', { token });
}

export async function fetchChats() {
    const token = await getToken();
    return api('/chats', { token });
}

export async function fetchMessages(chatId, after = null) {
    const token = await getToken();
    const q = after ? `?after=${encodeURIComponent(after)}` : '';
    return api(`/chats/${chatId}/messages${q}`, { token });
}

export async function sendMessage(chatId, text) {
    const token = await getToken();
    return api(`/chats/${chatId}/messages`, {
        method: 'POST',
        token,
        body: { text },
    });
}

export async function sendMediaMessage(chatId, { uri, name, mime, kind, text }) {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', { uri, name: name || 'upload', type: mime || 'application/octet-stream' });
    if (kind) formData.append('kind', kind);
    if (text) formData.append('text', text);
    return api(`/chats/${chatId}/messages`, {
        method: 'POST',
        token,
        formData,
    });
}

export async function connectWs(onEvent) {
    const token = await getToken();
    const base = await getServerUrl();
    const wsBase = base.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(token)}`);
    ws.onmessage = (ev) => {
        try {
            onEvent(JSON.parse(String(ev.data)));
        } catch {
            /* ignore */
        }
    };
    return ws;
}
