import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { normalizePhone, tryNormalizePhone } from "./lib/validation.js";

const schemaVersion = 1;

function migrate(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  if (current >= schemaVersion) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
      unit TEXT NOT NULL,
      image_url TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'placed',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      payment_provider_id TEXT,
      payment_reference TEXT,
      refund_reference TEXT,
      subtotal_paise INTEGER NOT NULL,
      delivery_fee_paise INTEGER NOT NULL,
      total_paise INTEGER NOT NULL,
      delivery_label TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      address_line TEXT NOT NULL,
      delivery_notes TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      distance_km REAL NOT NULL,
      stock_reserved INTEGER NOT NULL DEFAULT 1,
      cancel_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      delivered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      image_url TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      price_paise INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS products_active_idx ON products(is_active, category);
    CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at);
    CREATE INDEX IF NOT EXISTS orders_payment_idx ON orders(payment_status, created_at);
    CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id, id);
  `);

  db.exec(`PRAGMA user_version = ${schemaVersion}`);
}

export function createDatabase(filePath) {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function seedProducts(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (existing > 0) return;

  const products = [
    {
      name: "Vine Tomatoes",
      slug: "vine-tomatoes",
      description: "Deep red, juicy tomatoes ripened on the vine. Perfect for salads, curries and slow-roasted sauces.",
      category: "Fresh Vegetables",
      pricePaise: 4900,
      unit: "500 g",
      imageUrl: "/images/tomatoes.jpg",
      stock: 45,
      isFeatured: 1
    },
    {
      name: "Baby Spinach",
      slug: "baby-spinach",
      description: "Tender green leaves with a clean, sweet finish. Wash lightly and add to dal, smoothies or warm salads.",
      category: "Leafy Greens",
      pricePaise: 3500,
      unit: "250 g bunch",
      imageUrl: "/images/spinach.jpg",
      stock: 30,
      isFeatured: 1
    },
    {
      name: "Orange Carrots",
      slug: "orange-carrots",
      description: "Crisp, naturally sweet carrots pulled fresh from the soil. Great for snacking, roasting and soups.",
      category: "Root Vegetables",
      pricePaise: 4200,
      unit: "500 g",
      imageUrl: "/images/carrots.jpg",
      stock: 38,
      isFeatured: 1
    },
    {
      name: "Garden Broccoli",
      slug: "garden-broccoli",
      description: "Firm, bright green florets with a mild flavour. Steam, roast or stir-fry for an easy seasonal side.",
      category: "Fresh Vegetables",
      pricePaise: 5900,
      unit: "1 head (approx. 350 g)",
      imageUrl: "/images/broccoli.jpg",
      stock: 24,
      isFeatured: 1
    },
    {
      name: "Bell Pepper Mix",
      slug: "bell-pepper-mix",
      description: "A colourful mix of red, yellow, orange and green peppers. Crunchy, sweet and ready for the pan.",
      category: "Fresh Vegetables",
      pricePaise: 8900,
      unit: "500 g",
      imageUrl: "/images/peppers.jpg",
      stock: 28,
      isFeatured: 0
    },
    {
      name: "Salad Cucumbers",
      slug: "salad-cucumbers",
      description: "Cool, crunchy cucumbers with thin skins. Slice into salads or serve with a little salt and lime.",
      category: "Fresh Vegetables",
      pricePaise: 3200,
      unit: "500 g",
      imageUrl: "/images/cucumbers.jpg",
      stock: 36,
      isFeatured: 0
    },
    {
      name: "Red Onions",
      slug: "red-onions",
      description: "Everyday red onions with a bold flavour. A kitchen staple for curries, chutneys and fresh salsas.",
      category: "Root Vegetables",
      pricePaise: 4500,
      unit: "1 kg",
      imageUrl: "/images/onions.jpg",
      stock: 50,
      isFeatured: 0
    },
    {
      name: "Crisp Lettuce",
      slug: "crisp-lettuce",
      description: "Light, ruffled leaves with a fresh crunch. The foundation for a crisp salad or a generous sandwich.",
      category: "Leafy Greens",
      pricePaise: 3900,
      unit: "1 head",
      imageUrl: "/images/lettuce.jpg",
      stock: 26,
      isFeatured: 0
    },
    {
      name: "Baby Potatoes",
      slug: "baby-potatoes",
      description: "Creamy, thin-skinned potatoes that hold their shape beautifully. Roast whole with herbs and olive oil.",
      category: "Root Vegetables",
      pricePaise: 3800,
      unit: "500 g",
      imageUrl: "/images/potatoes.jpg",
      stock: 42,
      isFeatured: 0
    }
  ];

  const insert = db.prepare(`
    INSERT INTO products
      (name, slug, description, category, price_paise, unit, image_url, stock, is_featured, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const product of products) {
      insert.run(
        product.name,
        product.slug,
        product.description,
        product.category,
        product.pricePaise,
        product.unit,
        product.imageUrl,
        product.stock,
        product.isFeatured,
        now,
        now
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedAdmin(db, adminConfig) {
  if (!adminConfig?.password) {
    console.warn("ADMIN_PASSWORD is not set. No admin account was created.");
    return;
  }

  const phone = tryNormalizePhone(adminConfig.phone) || normalizePhone(adminConfig.phone);
  const existing = db
    .prepare("SELECT id, role FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?) OR phone = ?")
    .get(adminConfig.username, adminConfig.email, phone);

  if (existing) {
    if (existing.role !== "admin") {
      console.warn("Admin seed skipped because the configured admin identity belongs to a customer account.");
    }
    return;
  }

  if (adminConfig.password.length < 8) {
    console.warn("ADMIN_PASSWORD must be at least 8 characters. No admin account was created.");
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(adminConfig.password, 12);
  db.prepare(`
    INSERT INTO users (name, username, email, phone, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
  `).run(
    adminConfig.name,
    adminConfig.username.toLowerCase(),
    adminConfig.email.toLowerCase(),
    phone,
    passwordHash,
    now,
    now
  );
  console.log(`Admin account ready: ${adminConfig.username} / ${adminConfig.email}`);
}

export function seedDatabase(db, config) {
  seedProducts(db);
  seedAdmin(db, config.admin);
}

export function withTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      void 0;
    }
    throw error;
  }
}
