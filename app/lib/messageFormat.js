import { Linking, Text } from 'react-native';
import { theme } from './theme';

const URL_RE = /(https?:\/\/[^\s]+)/g;

export function chatSubtitle(chat) {
    if (chat.waiting) return 'ещё не зарегистрировался';
    if (chat.lastMessage?.text) return chat.lastMessage.text;
    if (chat.type === 'group') return `${chat.members?.length || 3} участника`;
    return 'Напиши первым ♡';
}

export function LinkText({ text, style }) {
    if (!text) return null;
    const parts = text.split(URL_RE);
    return (
        <Text style={style}>
            {parts.map((part, i) =>
                /^https?:\/\//.test(part) ? (
                    <Text
                        key={i}
                        style={[style, styles.link]}
                        onPress={() => Linking.openURL(part)}
                    >
                        {part}
                    </Text>
                ) : (
                    <Text key={i}>{part}</Text>
                ),
            )}
        </Text>
    );
}

const styles = {
    link: { color: theme.link, textDecorationLine: 'underline' },
};
