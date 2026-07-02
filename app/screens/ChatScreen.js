import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Audio, Video } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
    connectWs,
    fetchMessages,
    fileUrl,
    markChatRead,
    sendMediaMessage,
    sendMessage,
} from '../lib/api';
import { LinkText } from '../lib/messageFormat';
import { placeholder, theme } from '../lib/theme';

function chatTitle(chat) {
    if (chat.type === 'group') return chat.title || 'Группа';
    return chat.peer?.displayName || chat.peer?.username || '?';
}

function MessageBody({ item, isGroup, mine }) {
    const [src, setSrc] = useState(null);
    const kind = item.kind || 'text';

    useEffect(() => {
        let alive = true;
        if (item.fileUrl) {
            fileUrl(item.fileUrl).then((url) => {
                if (alive) setSrc(url);
            });
        }
        return () => { alive = false; };
    }, [item.fileUrl]);

    return (
        <View>
            {isGroup && !mine && (
                <Text style={styles.sender}>{item.senderName}</Text>
            )}
            {kind === 'image' && src ? (
                <Pressable onPress={() => Linking.openURL(src)}>
                    <Image source={{ uri: src }} style={styles.image} resizeMode="cover" />
                </Pressable>
            ) : null}
            {kind === 'voice' && src ? (
                <VoicePlayer uri={src} />
            ) : null}
            {kind === 'video' && src ? (
                <VideoNote uri={src} />
            ) : null}
            {kind === 'file' && src ? (
                <Pressable onPress={() => Linking.openURL(src)}>
                    <Text style={styles.fileLink}>📎 {item.file?.name || 'файл'}</Text>
                </Pressable>
            ) : null}
            {item.text ? <LinkText text={item.text} style={styles.bubbleText} /> : null}
            {mine ? <MessageTicks status={item.status} /> : null}
        </View>
    );
}

function MessageTicks({ status }) {
    if (!status) return null;
    const read = status === 'read';
    return (
        <View style={styles.ticksRow}>
            <Text style={[styles.ticks, read && styles.ticksRead]}>{read ? '✓✓' : '✓'}</Text>
        </View>
    );
}

function fmtTime(ms) {
    if (!ms || !Number.isFinite(ms)) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function VoicePlayer({ uri }) {
    const soundRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [pos, setPos] = useState(0);
    const [dur, setDur] = useState(0);

    async function toggle() {
        if (playing && soundRef.current) {
            await soundRef.current.pauseAsync();
            setPlaying(false);
            return;
        }
        if (soundRef.current) {
            await soundRef.current.playAsync();
            setPlaying(true);
            return;
        }
        const { sound } = await Audio.Sound.createAsync({ uri });
        soundRef.current = sound;
        setPlaying(true);
        sound.setOnPlaybackStatusUpdate((st) => {
            if (!st.isLoaded) return;
            setPos(st.positionMillis || 0);
            setDur(st.durationMillis || 0);
            if (st.didJustFinish) {
                setPlaying(false);
                setPos(0);
                sound.setPositionAsync(0);
            }
        });
        await sound.playAsync();
    }

    useEffect(() => () => {
        soundRef.current?.unloadAsync();
    }, []);

    const pct = dur > 0 ? Math.min(1, pos / dur) : 0;

    return (
        <Pressable onPress={toggle} style={styles.voiceBtn}>
            <Text style={styles.voiceText}>{playing ? '⏸' : '▶'} голосовое</Text>
            <View style={styles.voiceTrack}>
                <View style={[styles.voiceFill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.voiceTime}>{fmtTime(pos)} / {fmtTime(dur)}</Text>
        </Pressable>
    );
}

function VideoNote({ uri }) {
    const ref = useRef(null);
    const [playing, setPlaying] = useState(false);

    async function toggle() {
        const v = ref.current;
        if (!v) return;
        if (playing) {
            await v.pauseAsync();
            setPlaying(false);
            return;
        }
        await v.playAsync();
        setPlaying(true);
    }

    return (
        <Pressable onPress={toggle} style={styles.videoCircle}>
            <Video
                ref={ref}
                source={{ uri }}
                style={styles.videoCircleInner}
                resizeMode="cover"
                isLooping={false}
                useNativeControls={false}
                onPlaybackStatusUpdate={(st) => {
                    if (st.didJustFinish) setPlaying(false);
                }}
            />
            {!playing ? (
                <View style={styles.videoBadge} pointerEvents="none">
                    <Text style={styles.videoBadgeText}>▶</Text>
                </View>
            ) : null}
        </Pressable>
    );
}

export default function ChatScreen({ chat, user, onBack }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [recording, setRecording] = useState(false);
    const listRef = useRef(null);
    const recordingRef = useRef(null);
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
        markChatRead(chat.id).catch(() => {});
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
                markChatRead(chat.id).catch(() => {});
            }
            if (ev.type === 'read' && ev.chatId === chat.id) {
                loadMessages();
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
    }, [chat.id, appendMessage, loadMessages]);

    async function onSend() {
        const body = text.trim();
        if (!body) return;
        setText('');
        const { message } = await sendMessage(chat.id, body);
        appendMessage(message);
    }

    async function pickPhoto() {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        const asset = picked.assets[0];
        const { message } = await sendMediaMessage(chat.id, {
            uri: asset.uri,
            name: asset.fileName || 'photo.jpg',
            mime: asset.mimeType || 'image/jpeg',
            kind: 'image',
        });
        appendMessage(message);
    }

    async function pickFile() {
        const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (picked.canceled || !picked.assets?.[0]) return;
        const asset = picked.assets[0];
        const { message } = await sendMediaMessage(chat.id, {
            uri: asset.uri,
            name: asset.name,
            mime: asset.mimeType || 'application/octet-stream',
            kind: 'file',
        });
        appendMessage(message);
    }

    async function startVoice() {
        if (recording) return;
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) return;
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
        });
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await rec.startAsync();
        recordingRef.current = rec;
        setRecording(true);
    }

    async function stopVoice() {
        const rec = recordingRef.current;
        if (!rec || !recording) return;
        setRecording(false);
        recordingRef.current = null;
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (!uri) return;
        const { message } = await sendMediaMessage(chat.id, {
            uri,
            name: 'voice.m4a',
            mime: 'audio/mp4',
            kind: 'voice',
        });
        appendMessage(message);
    }

    async function recordVideoNote() {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) return;
        const picked = await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            videoMaxDuration: 60,
            quality: 0.6,
            cameraType: ImagePicker.CameraType.front,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        const asset = picked.assets[0];
        const { message } = await sendMediaMessage(chat.id, {
            uri: asset.uri,
            name: 'video.mp4',
            mime: asset.mimeType || 'video/mp4',
            kind: 'video',
        });
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
                    const isVideo = item.kind === 'video';
                    return (
                        <View style={[
                            styles.bubble,
                            mine ? styles.mine : styles.theirs,
                            isVideo && styles.videoBubble,
                        ]}>
                            <MessageBody item={item} isGroup={isGroup} mine={mine} />
                        </View>
                    );
                }}
            />

            <View style={styles.composer}>
                <Pressable style={styles.toolBtn} onPress={pickPhoto}>
                    <Text style={styles.toolText}>📷</Text>
                </Pressable>
                <Pressable style={styles.toolBtn} onPress={pickFile}>
                    <Text style={styles.toolText}>📎</Text>
                </Pressable>
                <Pressable
                    style={[styles.toolBtn, recording && styles.toolRec]}
                    onPressIn={startVoice}
                    onPressOut={stopVoice}
                >
                    <Text style={styles.toolText}>🎤</Text>
                </Pressable>
                <Pressable style={styles.toolBtn} onPress={recordVideoNote}>
                    <Text style={styles.toolText}>⭕</Text>
                </Pressable>
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
    image: {
        width: 220,
        height: 220,
        borderRadius: 12,
        marginBottom: 4,
        backgroundColor: theme.border,
    },
    fileLink: { color: theme.link, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    voiceBtn: {
        backgroundColor: theme.bgSoft,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 4,
        alignSelf: 'flex-start',
        minWidth: 160,
    },
    voiceText: { color: theme.primaryDark, fontWeight: '600', marginBottom: 6 },
    voiceTrack: {
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.border,
        overflow: 'hidden',
        marginBottom: 4,
    },
    voiceFill: {
        height: '100%',
        backgroundColor: theme.primaryDark,
        borderRadius: 2,
    },
    voiceTime: { color: theme.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
    videoBubble: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    videoCircle: {
        width: 200,
        height: 200,
        borderRadius: 100,
        overflow: 'hidden',
        backgroundColor: '#111',
    },
    videoCircleInner: {
        width: 200,
        height: 200,
    },
    videoBadge: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.28)',
    },
    videoBadgeText: { color: '#fff', fontSize: 36 },
    ticksRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
    ticks: { color: theme.textMuted, fontSize: 12, letterSpacing: -2 },
    ticksRead: { color: '#2563eb' },
    composer: {
        flexDirection: 'row',
        padding: 12,
        gap: 6,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: theme.border,
        backgroundColor: theme.bgSoft,
    },
    toolBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolRec: { backgroundColor: '#fecdd3' },
    toolText: { fontSize: 18 },
    input: {
        flex: 1,
        backgroundColor: theme.surface,
        color: theme.text,
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: theme.border,
        minWidth: 0,
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
