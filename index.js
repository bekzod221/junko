const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "db");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const PRODUCTS_FILE = path.join(__dirname, "db", "products.json");

const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || "";

function requireAdmin(req, res, next) {
  const provided =
    req.get("x-admin-secret") ||
    (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!ADMIN_API_SECRET || provided !== ADMIN_API_SECRET) {
    return res.status(401).json({ status: "error", code: "unauthorized", message: "unauthorized" });
  }
  next();
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const [datePart, timePart] = String(dateStr).split(" ");
  const [day, month, year] = datePart.split(".");
  const [hours, minutes, seconds] = (timePart || "00:00:00").split(":");
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDuration(durationStr) {
  const match = String(durationStr).match(/^(\d+)([dhms])$/);
  if (!match) throw new Error("Invalid duration format (use: 1d, 2h, 30m, 60s)");
  const amount = parseInt(match[1], 10);
  switch (match[2]) {
    case "d": return amount * 24 * 60 * 60 * 1000;
    case "h": return amount * 60 * 60 * 1000;
    case "m": return amount * 60 * 1000;
    case "s": return amount * 1000;
    default: throw new Error("Invalid duration unit");
  }
}

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeKeys(db) {
  await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
  await fs.writeFile(KEYS_FILE, JSON.stringify(db, null, 2), "utf-8");
}

async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch (err) {
    console.error("telegram:", err.message);
  }
}

function error(res, status, code, message) {
  return res.status(status).json({ status: "error", code, message });
}

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/ping", (_req, res) => res.send("OK"));

app.get("/products", async (_req, res) => {
  try {
    const products = await readJSON(PRODUCTS_FILE, []);
    res.json(products);
  } catch (err) {
    console.error(err);
    error(res, 500, "server", "Failed to load products");
  }
});

app.post("/verify", async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    const hwid = String(req.body?.hwid || "").trim();
    if (!key || !hwid) {
      return error(res, 400, "missing", "key and hwid are required");
    }

    const db = await readJSON(KEYS_FILE, []);
    const item = db.find((row) => row.key === key);
    if (!item) {
      return error(res, 404, "invalid", "Invalid key");
    }

    if (!item.product) {
      return error(res, 400, "invalid", "This key is not assigned to a product");
    }

    if (item.expiresAt === null || item.expiresAt === undefined) {
      if (!item.duration) {
        return error(res, 400, "invalid", "Invalid key configuration");
      }
      item.expiresAt = formatDate(new Date(Date.now() + parseDuration(item.duration)));
    }

    const expiryDate = parseDate(item.expiresAt);
    if (expiryDate && new Date() > expiryDate) {
      return error(res, 401, "expired", "This key has expired");
    }

    if (!item.hwid) {
      item.hwid = hwid;
    } else if (item.hwid !== hwid) {
      return error(res, 403, "other_device", "This key is owned by another device");
    }

    await writeKeys(db);
    notify(`EdgyLoader login: key=${key} hwid=${hwid} product=${item.product}`);

    return res.json({
      status: "success",
      code: "ok",
      message: "License activated",
      product: item.product,
      expiresAt: item.expiresAt,
    });
  } catch (err) {
    console.error(err);
    return error(res, 500, "server", "Invalid key");
  }
});

app.get("/showall", requireAdmin, async (_req, res) => {
  res.json(await readJSON(KEYS_FILE, []));
});

app.post("/create", requireAdmin, async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    const duration = String(req.body?.duration || "").trim();
    const product = String(req.body?.product || "").trim();
    if (!key || !duration || !product) {
      return error(res, 400, "missing", "key, duration and product are required");
    }

    const db = await readJSON(KEYS_FILE, []);
    if (db.find((row) => row.key === key)) {
      return error(res, 400, "exists", "Key already exists");
    }
    parseDuration(duration);

    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      key,
      hwid: "",
      version: "1.0",
      duration,
      expiresAt: null,
      product,
    };
    db.push(item);
    await writeKeys(db);
    return res.status(201).json({ status: "success", ...item });
  } catch (err) {
    return error(res, 400, "invalid", err.message);
  }
});

app.post("/delete", requireAdmin, async (req, res) => {
  const id = req.body?.id;
  if (!id) return error(res, 400, "missing", "id is required");
  const db = await readJSON(KEYS_FILE, []);
  const index = db.findIndex((row) => row.id === id);
  if (index === -1) return error(res, 404, "invalid", "Key not found");
  db.splice(index, 1);
  await writeKeys(db);
  return res.json({ status: "success" });
});

app.post("/reset-hwid", requireAdmin, async (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key) return error(res, 400, "missing", "key is required");
  const db = await readJSON(KEYS_FILE, []);
  const item = db.find((row) => row.key === key);
  if (!item) return error(res, 404, "invalid", "Key not found");
  item.hwid = "";
  await writeKeys(db);
  return res.json({ status: "success", message: "HWID reset" });
});

app.use((_req, res) => error(res, 404, "not_found", "Not found"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`EdgyLoader API listening on ${PORT}`);
});
