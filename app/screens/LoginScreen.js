import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { defaultServerUrl, signin, testServer } from '../lib/api';
import { placeholder, theme } from '../lib/theme';

const FALLBACK_ACCOUNTS = [
    { username: 'sasha_pshonko', displayName: 'Саша' },
    { username: 'dasha_pshonko', displayName: 'Даша' },
    { username: 'senya', displayName: 'Сеня' },
];

export default function LoginScreen({ onAuthed }) {
    const [accounts, setAccounts] = useState(FALLBACK_ACCOUNTS);
    const [serverUrl, setServerUrl] = useState(defaultServerUrl());
    const [error, setError] = useState('');
    const [loadingUser, setLoadingUser] = useState('');
    const [serverOk, setServerOk] = useState(null);

    useEffect(() => {
        setServerUrl(defaultServerUrl());
        loadAccounts(defaultServerUrl());
    }, []);

    async function loadAccounts(url) {
        try {
            const data = await testServer(url || serverUrl);
            if (data.accounts?.length) {
                setAccounts(data.accounts.map(({ username, displayName }) => ({
                    username,
                    displayName,
                })));
            }
        } catch {
            /* keep fallback */
        }
    }

    async function checkServer() {
        setServerOk(null);
        const url = serverUrl.trim();
        try {
            await testServer(url);
            setServerOk(true);
            await loadAccounts(url);
        } catch {
            setServerOk(false);
        }
    }

    async function pick(username) {
        if (loadingUser) return;
        setError('');
        setLoadingUser(username);
        try {
            const data = await signin({
                username,
                serverUrl: serverUrl.trim(),
            });
            onAuthed(data.user);
        } catch (e) {
            setError(e.message || 'ошибка');
        } finally {
            setLoadingUser('');
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Text style={styles.logo}>Glink ♡</Text>
            <Text style={styles.sub}>нажми на себя — и в чат</Text>

            <View style={styles.whoRow}>
                {accounts.map((a) => {
                    const busy = loadingUser === a.username;
                    return (
                        <Pressable
                            key={a.username}
                            style={[styles.whoBtn, busy && styles.whoBusy]}
                            onPress={() => pick(a.username)}
                            disabled={Boolean(loadingUser)}
                        >
                            {busy ? (
                                <ActivityIndicator color={theme.primaryDark} />
                            ) : (
                                <>
                                    <View style={styles.whoAv}>
                                        <Text style={styles.whoAvText}>
                                            {(a.displayName || a.username)[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text style={styles.whoName}>{a.displayName}</Text>
                                </>
                            )}
                        </Pressable>
                    );
                })}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TextInput
                style={[styles.input, styles.serverInput]}
                placeholder="URL сервера"
                placeholderTextColor={placeholder}
                autoCapitalize="none"
                value={serverUrl}
                onChangeText={setServerUrl}
            />
            <Pressable style={styles.checkBtn} onPress={checkServer}>
                <Text style={styles.checkText}>Проверить сервер</Text>
            </Pressable>
            {serverOk === true && <Text style={styles.serverOk}>сервер доступен ✓</Text>}
            {serverOk === false && (
                <Text style={styles.serverBad}>сервер недоступен</Text>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: theme.bg,
        padding: 24,
        justifyContent: 'center',
    },
    logo: { color: theme.primaryDark, fontSize: 36, fontWeight: '800', textAlign: 'center' },
    sub: { color: theme.textMuted, marginBottom: 28, marginTop: 4, textAlign: 'center' },
    whoRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    whoBtn: {
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 4,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: theme.border,
        minHeight: 100,
        justifyContent: 'center',
    },
    whoBusy: { opacity: 0.7 },
    whoAv: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.avatar,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    whoAvText: { color: theme.primaryDark, fontWeight: '700', fontSize: 20 },
    whoName: { color: theme.text, fontWeight: '700', fontSize: 15 },
    input: {
        backgroundColor: theme.surface,
        color: theme.text,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 13,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: theme.border,
    },
    serverInput: { marginTop: 20, marginBottom: 6 },
    error: { color: theme.error, marginBottom: 8, textAlign: 'center' },
    checkBtn: { alignSelf: 'center', paddingVertical: 6 },
    checkText: { color: theme.link, fontSize: 14 },
    serverOk: { color: '#16a34a', textAlign: 'center', marginTop: 4 },
    serverBad: { color: theme.error, textAlign: 'center', marginTop: 4 },
});
