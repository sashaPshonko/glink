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
import { defaultServerUrl, getServerUrl, login, register } from '../lib/api';
import { placeholder, theme } from '../lib/theme';

export default function LoginScreen({ onAuthed }) {
    const [mode, setMode] = useState('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [serverUrl, setServerUrl] = useState(defaultServerUrl());
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getServerUrl().then(setServerUrl);
    }, []);

    async function submit() {
        setError('');
        setLoading(true);
        try {
            const payload = {
                username: username.trim().toLowerCase(),
                password,
                displayName: displayName.trim(),
                serverUrl: serverUrl.trim(),
            };
            const data =
                mode === 'login'
                    ? await login(payload)
                    : await register(payload);
            onAuthed(data.user);
        } catch (e) {
            setError(e.code || e.message || 'error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Text style={styles.logo}>Glink</Text>
            <Text style={styles.sub}>нежно-розовый чат для нас ♡</Text>

            <TextInput
                style={styles.input}
                placeholder="URL сервера"
                placeholderTextColor={placeholder}
                autoCapitalize="none"
                value={serverUrl}
                onChangeText={setServerUrl}
            />
            <TextInput
                style={styles.input}
                placeholder="логин"
                placeholderTextColor={placeholder}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
            />
            {mode === 'register' && (
                <TextInput
                    style={styles.input}
                    placeholder="имя"
                    placeholderTextColor={placeholder}
                    value={displayName}
                    onChangeText={setDisplayName}
                />
            )}
            <TextInput
                style={styles.input}
                placeholder="пароль"
                placeholderTextColor={placeholder}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.btn} onPress={submit} disabled={loading}>
                {loading ? (
                    <ActivityIndicator color={theme.textOnPrimary} />
                ) : (
                    <Text style={styles.btnText}>
                        {mode === 'login' ? 'Войти' : 'Регистрация'}
                    </Text>
                )}
            </Pressable>

            <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
                <Text style={styles.switch}>
                    {mode === 'login'
                        ? 'Нет аккаунта? Зарегистрироваться'
                        : 'Уже есть аккаунт? Войти'}
                </Text>
            </Pressable>
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
    logo: { color: theme.primaryDark, fontSize: 42, fontWeight: '700' },
    sub: { color: theme.textMuted, marginBottom: 28, marginTop: 4 },
    input: {
        backgroundColor: theme.surface,
        color: theme.text,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 13,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.border,
    },
    btn: {
        backgroundColor: theme.primaryDark,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    btnText: { color: theme.textOnPrimary, fontWeight: '600', fontSize: 16 },
    switch: { color: theme.link, textAlign: 'center', marginTop: 18 },
    error: { color: theme.error, marginBottom: 8 },
});
