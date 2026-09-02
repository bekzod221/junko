# EdgyLoader API

Deploy this folder to Render as a **Web Service**.

1. Root directory: `api`
2. Build: `npm install`
3. Start: `npm start`
4. Copy the `https://….onrender.com` URL into `AuthAPI.baseURL` in the iOS app.

Optional env:

- `PORT` — set automatically by Render
- `ADMIN_API_SECRET` — required for `/create`, `/delete`, `/reset-hwid`, `/showall` and all `/product-*` routes
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT` — optional login notifications

Render’s filesystem is ephemeral unless you attach a disk. Mount a disk at `/data` and set `DATA_DIR=/data` if you want keys **and products** to persist across deploys — both `keys.json` and
`products.json` are written there. On first boot `products.json` is seeded from the
copy shipped in `db/`, so an existing catalog carries over.

## Endpoints

| Method | Path | Body |
| --- | --- | --- |
| GET | `/ping` | |
| GET | `/products` | catalog (public) |
| POST | `/verify` | `{ "key", "hwid" }` |
| POST | `/create` | `{ "key", "duration", "product" }` (admin) |
| POST | `/delete` | `{ "id" }` (admin) |
| POST | `/reset-hwid` | `{ "key" }` (admin) |
| GET | `/showall` | admin |
| POST | `/product-create` | `{ "name", "icon"?, "file"?, "pass"?, "features"?, "isActive"?, "details"? }` (admin) |
| POST | `/product-update` | `{ "name", ...fields }` (admin) |
| POST | `/product-delete` | `{ "name", "force"? }` (admin) |

`/verify` codes: `ok`, `invalid`, `expired`, `other_device`.

Products are keyed by `name`, because keys reference a product by name rather than
an id. `/product-update` therefore edits every field except the name.
`/product-delete` answers `409 in_use` if any key still references the product; pass
`"force": true` to delete anyway (those keys then fail `/verify`).

`features` is stored as a string array. Catalog products (hero skins) omit `file`
and instead send `details`:

```json
{
  "description": "Mobile Legends collaboration skins.",
  "heroes": [
    {
      "name": "Xavier",
      "icon": "https://…/xavier.jpg",
      "skins": [
        { "name": "Gojo", "icon": "https://…/gojo.jpg", "file": "https://…/gojo.3105", "pass": "edgy" }
      ]
    }
  ]
}
```

A product needs either a top-level `file` or at least one skin `file`. `pass` is
`null` when the archive is not encrypted (`"null"` is still accepted as empty).
