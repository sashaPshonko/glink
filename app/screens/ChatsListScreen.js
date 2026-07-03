import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { fetchChats, fileUrl } from '../lib/api';
import { chatSubtitle } from '../lib/messageFormat';
import { theme } from '../lib/theme';

function chatTitle(chat) {
    if (chat.type === 'group') return chat.title || 'Группа';
    return chat.peer?.displayName || chat.peer?.username || '?';
}

function ChatRowAvatar({ chat }) {
    const [uri, setUri] = useState(null);

    useEffect(() => {
        let live = true;
        if (chat.type !== 'group' && chat.peer?.avatarUrl) {
            fileUrl(chat.peer.avatarUrl).then((url) => {
                if (live) setUri(url);
            }).catch(() => {
                if (live) setUri(null);
            });
        } else {
            setUri(null);
        }
        return () => { live = false; };
    }, [chat.type, chat.peer?.avatarUrl]);

    if (chat.type === 'group') {
        return (
            <View style={[styles.avatar, styles.avatarGroup]}>
                <Text style={styles.avatarText}>♡</Text>
            </View>
        );
    }
    if (uri) {
        return (
            <View style={styles.avatar}>
                <Image source={{ uri }} style={styles.avatarImg} />
            </View>
        );
    }
    return (
        <View style={styles.avatar}>
            <Text style={styles.avatarText}>
                {(chatTitle(chat)[0] || '?').toUpperCase()}
            </Text>
        </View>
    );
}

export default function ChatsListScreen({ user, onOpenChat, onLogout }) {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchChats();
            setChats(data.chats || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>максим</Text>
                    <Text style={styles.me}>@{user.username}</Text>
                </View>
                <Pressable onPress={onLogout}>
                    <Text style={styles.logout}>выход</Text>
                </Pressable>
            </View>

            {loading && !chats.length ? (
                <ActivityIndicator color={theme.primaryDark} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={chats}
                    keyExtractor={(item) => item.id}
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={reload}
                            tintColor={theme.primaryDark}
                        />
                    }
                    renderItem={({ item }) => (
                        <Pressable
                            style={[styles.row, item.waiting && styles.rowWait]}
                            onPress={() => !item.waiting && onOpenChat(item)}
                            disabled={item.waiting}
                        >
                            <ChatRowAvatar chat={item} />
                            <View style={styles.rowBody}>
                                <Text style={styles.name}>{chatTitle(item)}</Text>
                                <Text style={styles.preview} numberOfLines={1}>
                                    {chatSubtitle(item)}
                                </Text>
                            </View>
                        </Pressable>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    header: {
        paddingTop: 56,
        paddingHorizontal: 20,
        paddingBottom: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.bgSoft,
    },
    title: { color: theme.primaryDark, fontSize: 28, fontWeight: '700' },
    me: { color: theme.textMuted },
    logout: { color: theme.logout },
    row: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.surface,
    },
    rowWait: { opacity: 0.5, backgroundColor: theme.bgSoft },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.avatar,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarGroup: { backgroundColor: theme.avatarGroup },
    avatarText: { color: theme.primaryDark, fontWeight: '700', fontSize: 18 },
    avatarImg: { width: '100%', height: '100%', borderRadius: 24 },
    rowBody: { flex: 1, justifyContent: 'center' },
    name: { color: theme.text, fontSize: 17, fontWeight: '600' },
    preview: { color: theme.textMuted, marginTop: 3 },
});
