# EdgyLoader API

Deploy this folder to Render as a **Web Service**.

1. Root directory: `api`
2. Build: `npm install`
3. Start: `npm start`
4. Copy the `https://….onrender.com` URL into `AuthAPI.baseURL` in the iOS app.

Optional env:

- `PORT` — set automatically by Render
- `ADMIN_API_SECRET` — required for `/create`, `/delete`, `/reset-hwid`, `/showall`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT` — optional login notifications

Render’s filesystem is ephemeral unless you attach a disk. Mount a disk at `/data` and set `DATA_DIR=/data` if you want keys to persist across deploys.

## Endpoints

| Method | Path | Body |
| --- | --- | --- |
| GET | `/ping` | |
| GET | `/products` | catalog from `db/products.json` |
| POST | `/verify` | `{ "key", "hwid" }` |
| POST | `/create` | `{ "key", "duration", "product" }` (admin) |
| POST | `/delete` | `{ "id" }` (admin) |
| POST | `/reset-hwid` | `{ "key" }` (admin) |
| GET | `/showall` | admin |

`/verify` codes: `ok`, `invalid`, `expired`, `other_device`.
