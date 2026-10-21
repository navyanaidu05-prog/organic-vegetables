import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { clearSessionCookie, hashToken, publicUser, requireAuth, startSession } from "../auth.js";
import { ApiError } from "../lib/errors.js";
import {
  loginSchema,
  normalizePhone,
  parseBody,
  passwordChangeSchema,
  profileUpdateSchema,
  registerSchema,
  tryNormalizePhone
} from "../lib/validation.js";

const dummyHash = bcrypt.hashSync("Organic-dummy-password-9471", 12);

function loginLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Please wait a few minutes and try again." }
      });
    }
  });
}

function registerLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many account attempts. Please wait a little while and try again." }
      });
    }
  });
}

function accountConflicts(db, { username, email, phone }, excludeId = 0) {
  const row = db
    .prepare(
      `SELECT username, email, phone FROM users
       WHERE id != ? AND (lower(username) = lower(?) OR lower(email) = lower(?) OR phone = ?)`
    )
    .get(excludeId, username, email, phone);
  if (!row) return null;
  if (row.username.toLowerCase() === username.toLowerCase()) {
    return new ApiError(409, "USERNAME_TAKEN", "That username is already taken.");
  }
  if (row.email.toLowerCase() === email.toLowerCase()) {
    return new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists.");
  }
  return new ApiError(409, "PHONE_TAKEN", "An account with that phone number already exists.");
}

function userById(db, id) {
  return db
    .prepare("SELECT id, name, username, email, phone, role, created_at FROM users WHERE id = ?")
    .get(id);
}

export function createAuthRouter({ db, config }) {
  const router = Router();
  const limiter = loginLimiter();
  const signupLimiter = registerLimiter();

  router.get("/me", (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.post("/register", signupLimiter, async (req, res) => {
    const data = parseBody(registerSchema, req.body);
    const phone = normalizePhone(data.phone);
    const conflict = accountConflicts(db, {
      username: data.username,
      email: data.email,
      phone
    });
    if (conflict) throw conflict;

    const passwordHash = await bcrypt.hash(data.password, 12);
    const now = new Date().toISOString();

    let result;
    try {
      result = db
        .prepare(
          `INSERT INTO users (name, username, email, phone, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)`
        )
        .run(data.name, data.username, data.email, phone, passwordHash, now, now);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new ApiError(409, "ACCOUNT_EXISTS", "An account already exists with those details.");
      }
      throw error;
    }

    const user = userById(db, Number(result.lastInsertRowid));
    startSession(db, res, user.id, config);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post("/login", limiter, async (req, res) => {
    const data = parseBody(loginSchema, req.body);
    const identifier = data.identifier.trim();
    const normalized = identifier.toLowerCase();
    const phone = tryNormalizePhone(identifier);
    const user = db
      .prepare(
        `SELECT id, name, username, email, phone, password_hash, role, created_at
         FROM users
         WHERE lower(email) = lower(?) OR lower(username) = lower(?) OR phone = ?`
      )
      .get(normalized, normalized, phone || "not-a-phone-number");

    const valid = await bcrypt.compare(data.password, user?.password_hash || dummyHash);
    if (!user || !valid) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email, username, phone number or password.");
    }

    startSession(db, res, user.id, config);
    res.json({ user: publicUser(user) });
  });

  router.post("/logout", (req, res) => {
    const token = req.cookies?.[config.session.cookieName];
    if (token && typeof token === "string") {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    }
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  router.patch("/profile", requireAuth, (req, res) => {
    const data = parseBody(profileUpdateSchema, req.body);
    const phone = normalizePhone(data.phone);
    const conflict = accountConflicts(db, { username: data.username, email: data.email, phone }, req.user.id);
    if (conflict) throw conflict;

    db.prepare(
      `UPDATE users SET name = ?, username = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?`
    ).run(data.name, data.username, data.email, phone, new Date().toISOString(), req.user.id);

    const user = userById(db, req.user.id);
    res.json({ user: publicUser(user) });
  });

  router.patch("/password", requireAuth, async (req, res) => {
    const data = parseBody(passwordChangeSchema, req.body);
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
    const valid = await bcrypt.compare(data.currentPassword, row.password_hash);
    if (!valid) throw new ApiError(400, "INVALID_PASSWORD", "Your current password is incorrect.");

    if (await bcrypt.compare(data.newPassword, row.password_hash)) {
      throw new ApiError(400, "SAME_PASSWORD", "Choose a new password that is different from your current one.");
    }

    const hash = await bcrypt.hash(data.newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      hash,
      new Date().toISOString(),
      req.user.id
    );
    if (req.sessionHash) {
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(req.user.id, req.sessionHash);
    }
    res.json({ ok: true, message: "Password updated. Other devices have been signed out." });
  });

  return router;
}
