# максим

Мессенджер на троих. Розовый. Без секретов.

---

## VPS — одна команда

```bash
cd ~/glink/server
npm install
bash start.sh
```

Порт **3920** — открой в firewall.

Проверка: `curl http://IP_VPS:3920/health`

Перезапуск:

```bash
pkill -f 'glink/server/index.mjs'
bash start.sh
```

Новые логины — сброс базы:

```bash
rm -f data/store.json
```

---

## Аккаунты

| Логин | |
|-------|--|
| `sasha_pshonko` | Саша |
| `dasha_pshonko` | Даша |
| `senya` | Сеня |

Каждый один раз **Регистрация**, пароль любой (от 6 символов).

---

## iPhone

1. App Store → **Expo Go**
2. На Mac:
   ```bash
   cd glink/app
   npm install
   npx expo start --tunnel
   ```
3. QR в Expo Go
4. URL: `http://IP_VPS:3920`

---

## Чаты

- личный с Дашей
- личный с Сеней  
- **Мы трое** — группа
