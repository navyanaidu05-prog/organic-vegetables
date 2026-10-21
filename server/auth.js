import crypto from "node:crypto";
import { ApiError } from "./lib/errors.js";

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.created_at
  };
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: "lax",
    path: "/",
    maxAge: config.session.days * 24 * 60 * 60 * 1000
  };
}

export function clearSessionCookie(res, config) {
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: "lax",
    path: "/"
  });
}

export function startSession(db, res, userId, config) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.session.days * 24 * 60 * 60 * 1000);
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    tokenHash,
    userId,
    expiresAt.toISOString(),
    now.toISOString()
  );
  res.cookie(config.session.cookieName, token, sessionCookieOptions(config));
  return { tokenHash, expiresAt };
}

export function attachUser({ db, config }) {
  return (req, res, next) => {
    req.user = null;
    req.sessionHash = null;
    const token = req.cookies?.[config.session.cookieName];
    if (!token || typeof token !== "string" || token.length < 32) return next();

    const tokenHash = hashToken(token);
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.username, u.email, u.phone, u.role, u.created_at, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(tokenHash, new Date().toISOString());

    if (!row) {
      clearSessionCookie(res, config);
      return next();
    }

    req.user = publicUser(row);
    req.sessionHash = tokenHash;
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return next(new ApiError(401, "AUTH_REQUIRED", "Please sign in to continue."));
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new ApiError(401, "AUTH_REQUIRED", "Please sign in to continue."));
  }
  if (req.user.role !== "admin") {
    return next(new ApiError(403, "ADMIN_ONLY", "This area is available to store administrators only."));
  }
  next();
}
