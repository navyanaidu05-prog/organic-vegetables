import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

function boolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function paiseFromRupees(value, fallbackRupees) {
  const rupees = numberValue(value, fallbackRupees);
  return Math.max(0, Math.round(rupees * 100));
}

function deepMerge(base, overrides) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object") {
      result[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function loadConfig(overrides = {}) {
  const env = process.env;
  const isProduction = (env.NODE_ENV || "development") === "production";
  const razorpayKeyId = (env.RAZORPAY_KEY_ID || "").trim();
  const razorpayKeySecret = (env.RAZORPAY_KEY_SECRET || "").trim();
  const sessionSecret = env.SESSION_SECRET || "development-only-session-secret-change-me";

  if (isProduction && (sessionSecret.length < 32 || sessionSecret.includes("replace-with"))) {
    throw new Error("SESSION_SECRET must be at least 32 random characters in production.");
  }

  const razorpayConfigured = Boolean(razorpayKeyId && razorpayKeySecret);
  const demoRequested = boolean(env.ALLOW_DEMO_PAYMENTS, !razorpayConfigured);
  const demoEnabled = !isProduction && demoRequested && !razorpayConfigured;
  const appUrl = (env.APP_URL || `http://localhost:${numberValue(env.PORT, 3000)}`).replace(/\/+$/, "");
  const storeLat = numberValue(env.STORE_LAT, 12.9716);
  const storeLng = numberValue(env.STORE_LNG, 77.5946);

  if (storeLat < -90 || storeLat > 90 || storeLng < -180 || storeLng > 180) {
    throw new Error("STORE_LAT and STORE_LNG must be valid coordinates.");
  }

  const config = {
    rootDir,
    env: env.NODE_ENV || "development",
    isProduction,
    port: numberValue(env.PORT, 3000),
    appUrl,
    trustProxy: env.TRUST_PROXY === undefined ? (isProduction ? 1 : false) : env.TRUST_PROXY,
    databasePath: path.resolve(rootDir, env.DATABASE_PATH || "./data/organic.db"),
    session: {
      secret: sessionSecret,
      days: Math.min(90, Math.max(1, numberValue(env.SESSION_DAYS, 30))),
      cookieName: "ov_session",
      secure: isProduction
    },
    store: {
      name: env.STORE_NAME || "Organic Vegetables",
      tagline: env.STORE_TAGLINE || "Farm fresh. Delivered with care.",
      address: env.STORE_ADDRESS || "100 Green Market Road, Indiranagar, Bengaluru 560038",
      phone: env.STORE_PHONE || "+91 98765 43210",
      email: env.STORE_EMAIL || "hello@organicvegetables.in",
      lat: storeLat,
      lng: storeLng
    },
    delivery: {
      radiusKm: Math.max(0.5, numberValue(env.DELIVERY_RADIUS_KM, 15)),
      feePaise: paiseFromRupees(env.DELIVERY_FEE, 49),
      freeOverPaise: paiseFromRupees(env.FREE_DELIVERY_MIN, 499),
      paymentWindowMinutes: 30
    },
    admin: {
      name: env.ADMIN_NAME || "Store Admin",
      username: (env.ADMIN_USERNAME || "admin").toLowerCase(),
      email: (env.ADMIN_EMAIL || "admin@organicvegetables.in").toLowerCase(),
      phone: env.ADMIN_PHONE || "9876543210",
      password: env.ADMIN_PASSWORD || ""
    },
    razorpay: {
      keyId: razorpayKeyId,
      keySecret: razorpayKeySecret,
      webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
      configured: razorpayConfigured
    },
    payments: {
      demoEnabled,
      available: razorpayConfigured || demoEnabled
    },
    geocode: {
      url: env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/reverse",
      contactEmail: env.GEOCODE_CONTACT_EMAIL || env.STORE_EMAIL || "hello@organicvegetables.in"
    },
    map: {
      tileUrl: env.MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: env.MAP_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors"
    },
    orderStatuses: ["placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"]
  };

  return deepMerge(config, overrides);
}

export const config = loadConfig();

if (config.isProduction && !config.razorpay.configured) {
  console.warn("Razorpay keys are not configured. Online UPI payments are disabled in production.");
}
