/** sasha_pshonko, dasha_pshonko, senya */
export const MEMBERS = (
    process.env.GLINK_MEMBERS || 'sasha_pshonko,dasha_pshonko,senya'
)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const DISPLAY_NAMES = Object.fromEntries(
    (
        process.env.GLINK_NAMES ||
        'sasha_pshonko:Саша,dasha_pshonko:Даша,senya:Сеня'
    )
        .split(',')
        .map((pair) => {
            const [u, name] = pair.split(':').map((s) => s.trim());
            return [u?.toLowerCase(), name];
        })
        .filter(([u]) => u),
);

export const GROUP_TITLE = process.env.GLINK_GROUP || 'Мы трое';

export function isMemberUsername(username) {
    return MEMBERS.includes(String(username || '').toLowerCase());
}
