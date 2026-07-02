import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { connectWs, fetchMessages, sendMessage } from '../lib/api';
import { placeholder, theme } from '../lib/theme';

function chatTitle(chat) {
    if (chat.type === 'group') return chat.title || 'Группа';
    return chat.peer?.displayName || chat.peer?.username || '?';
}

export default function ChatScreen({ chat, user, onBack }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const listRef = useRef(null);
    const isGroup = chat.type === 'group';

    const appendMessage = useCallback((msg) => {
        setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
        });
    }, []);

    const loadMessages = useCallback(async () => {
        const data = await fetchMessages(chat.id);
        setMessages(data.messages || []);
    }, [chat.id]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                await loadMessages();
            } finally {
                setLoading(false);
            }
        })();
    }, [loadMessages]);

    useEffect(() => {
        let ws;
        let alive = true;
        connectWs((ev) => {
            if (!alive) return;
            if (ev.type === 'message' && ev.message?.chatId === chat.id) {
                appendMessage(ev.message);
            }
        }).then((socket) => {
            ws = socket;
            socket.onopen = () => {
                socket.send(JSON.stringify({ type: 'join', chatId: chat.id }));
            };
        });
        return () => {
            alive = false;
            ws?.close();
        };
    }, [chat.id, appendMessage]);

    async function onSend() {
        const body = text.trim();
        if (!body) return;
        setText('');
        const { message } = await sendMessage(chat.id, body);
        appendMessage(message);
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={theme.primaryDark} size="large" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={8}
        >
            <View style={styles.header}>
                <Pressable onPress={onBack} style={styles.backBtn}>
                    <Text style={styles.back}>←</Text>
                </Pressable>
                <View style={styles.headerBody}>
                    <Text style={styles.title}>{chatTitle(chat)}</Text>
                    <Text style={styles.sub}>
                        {isGroup ? `${chat.members?.length || 3} участника ♡` : 'личный чат'}
                    </Text>
                </View>
            </View>

            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(item) => item.id}
                style={styles.listBg}
                contentContainerStyle={styles.list}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => {
                    const mine = item.senderId === user.id;
                    return (
                        <View
                            style={[
                                styles.bubble,
                                mine ? styles.mine : styles.theirs,
                            ]}
                        >
                            {isGroup && !mine && (
                                <Text style={styles.sender}>{item.senderName}</Text>
                            )}
                            <Text style={styles.bubbleText}>{item.text}</Text>
                        </View>
                    );
                }}
            />

            <View style={styles.composer}>
                <TextInput
                    style={styles.input}
                    placeholder="Сообщение…"
                    placeholderTextColor={placeholder}
                    value={text}
                    onChangeText={setText}
                    onSubmitEditing={onSend}
                />
                <Pressable style={styles.send} onPress={onSend}>
                    <Text style={styles.sendText}>♡</Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    center: {
        flex: 1,
        backgroundColor: theme.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    header: {
        paddingTop: 56,
        paddingHorizontal: 12,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.bgSoft,
    },
    backBtn: { padding: 8, marginRight: 4 },
    back: { color: theme.primaryDark, fontSize: 28 },
    headerBody: { flex: 1 },
    title: { color: theme.text, fontSize: 20, fontWeight: '700' },
    sub: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
    listBg: { backgroundColor: theme.bg },
    list: { padding: 16, paddingBottom: 8 },
    bubble: {
        maxWidth: '82%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        marginBottom: 8,
    },
    mine: {
        alignSelf: 'flex-end',
        backgroundColor: theme.mineBubble,
    },
    theirs: {
        alignSelf: 'flex-start',
        backgroundColor: theme.theirsBubble,
        borderWidth: 1,
        borderColor: theme.border,
    },
    sender: {
        color: theme.senderLabel,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    bubbleText: { color: theme.bubbleText, fontSize: 16 },
    composer: {
        flexDirection: 'row',
        padding: 12,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        backgroundColor: theme.bgSoft,
    },
    input: {
        flex: 1,
        backgroundColor: theme.surface,
        color: theme.text,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: theme.border,
    },
    send: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendText: { color: theme.textOnPrimary, fontSize: 20 },
});
