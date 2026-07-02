# Glink

Нежно-розовый чат для **Саши, Даши и Сени**.

---

## Аккаунты

| Логин | Имя |
|-------|-----|
| `sasha_pshonko` | Саша |
| `dasha_pshonko` | Даша |
| `senya` | Сеня |

---

## Чаты

- Личный с каждым (2 штуки на человека)
- Группа **«Мы трое»**

---

## Сервер

```bash
cd glink/server
npm install
nohup env GLINK_SECRET=секрет node index.mjs > glink.log 2>&1 &
```

Если менял логины — удали старую базу и зарегистрируйся заново:

```bash
rm -f glink/server/data/store.json
```

---

## Приложение

```bash
cd glink/app
npm install
npx expo start
```
