import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { theme } from './lib/theme';

const SERVER_URL = Constants.expoConfig?.extra?.serverUrl || 'https://31.128.38.147:3920';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

const BACK_JS = `
(function () {
  if (window.glinkGoBack && window.glinkGoBack()) return;
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage('glink:back:exit');
})();
true;
`;

export default function App() {
    const webRef = useRef(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (Platform.OS !== 'android') return undefined;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            webRef.current?.injectJavaScript(BACK_JS);
            return true;
        });
        return () => sub.remove();
    }, []);

    useEffect(() => {
        Notifications.requestPermissionsAsync().catch(() => {});
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const chatId = response.notification.request.content.data?.chatId;
            if (!chatId) return;
            webRef.current?.injectJavaScript(
                `window.glinkOpenChat && window.glinkOpenChat(${JSON.stringify(chatId)}); true;`,
            );
        });
        return () => sub.remove();
    }, []);

    const onWebMessage = async (event) => {
        const raw = event.nativeEvent.data;
        if (raw === 'glink:back:exit') {
            BackHandler.exitApp();
            return;
        }
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'notify:request') {
                await Notifications.requestPermissionsAsync();
                return;
            }
            if (msg.type === 'notify') {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: msg.title || 'Glink',
                        body: msg.body || '',
                        data: { chatId: msg.chatId || '' },
                    },
                    trigger: null,
                });
            }
        } catch (_) {}
    };

    return (
        <SafeAreaView style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor={theme.bg} />
            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={theme.primaryDark} />
                </View>
            ) : null}
            <WebView
                ref={webRef}
                source={{ uri: SERVER_URL }}
                style={styles.web}
                onLoadEnd={() => setLoading(false)}
                onLoadStart={() => setLoading(true)}
                onError={() => setLoading(false)}
                onMessage={onWebMessage}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                setSupportMultipleWindows={false}
                originWhitelist={['https://*', 'http://*']}
                cacheEnabled
                pullToRefreshEnabled={Platform.OS === 'android'}
                onPermissionRequest={(event) => {
                    event.grant(event.resources);
                }}
                onContentProcessDidTerminate={() => webRef.current?.reload()}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: theme.bg,
    },
    web: {
        flex: 1,
        backgroundColor: theme.bg,
    },
    loader: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.bg,
        zIndex: 1,
    },
});
