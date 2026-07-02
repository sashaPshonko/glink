import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { fetchMe, getToken, logout } from './lib/api';
import LoginScreen from './screens/LoginScreen';
import ChatsListScreen from './screens/ChatsListScreen';
import ChatScreen from './screens/ChatScreen';
import { theme } from './lib/theme';

export default function App() {
    const [boot, setBoot] = useState(true);
    const [user, setUser] = useState(null);
    const [activeChat, setActiveChat] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const token = await getToken();
                if (token) {
                    const me = await fetchMe();
                    setUser(me.user);
                }
            } catch {
                setUser(null);
            } finally {
                setBoot(false);
            }
        })();
    }, []);

    async function handleLogout() {
        await logout();
        setUser(null);
        setActiveChat(null);
    }

    if (boot) {
        return (
            <View style={styles.boot}>
                <ActivityIndicator color={theme.primaryDark} size="large" />
            </View>
        );
    }

    return (
        <>
            <StatusBar barStyle="dark-content" backgroundColor={theme.bg} />
            {!user ? (
                <LoginScreen onAuthed={setUser} />
            ) : activeChat ? (
                <ChatScreen
                    chat={activeChat}
                    user={user}
                    onBack={() => setActiveChat(null)}
                />
            ) : (
                <ChatsListScreen
                    user={user}
                    onOpenChat={setActiveChat}
                    onLogout={handleLogout}
                />
            )}
        </>
    );
}

const styles = StyleSheet.create({
    boot: {
        flex: 1,
        backgroundColor: theme.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
