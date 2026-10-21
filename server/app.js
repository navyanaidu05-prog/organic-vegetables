import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { attachUser } from "./auth.js";
import { ApiError } from "./lib/errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createProductsRouter } from "./routes/products.js";
import { createDeliveryRouter } from "./routes/delivery.js";
import { createOrdersRouter } from "./routes/orders.js";
import { createPaymentsRouter, createWebhookRouter } from "./routes/payments.js";
import { createAdminRouter } from "./routes/admin.js";

const publicDir = path.resolve(fileURLToPath(new URL("../public", import.meta.url)));

function apiRateLimiter(config) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isProduction ? 450 : 1500,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.path.startsWith("/webhooks/"),
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." }
      });
    }
  });
}

function sameOriginGuard(config) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.path === "/webhooks/razorpay") return next();
    if (!req.is("application/json")) {
      return next(new ApiError(415, "JSON_REQUIRED", "This endpoint requires a JSON request body."));
    }
    const origin = req.get("origin");
    if (origin) {
      const allowed = new Set([config.appUrl, `${req.protocol}://${req.get("host")}`]);
      if (!allowed.has(origin)) {
        return next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed."));
      }
    }
    next();
  };
}

function securityMiddleware(config) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'self'", "https://*.razorpay.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "https://checkout.razorpay.com"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "https://*.razorpay.com"],
        upgradeInsecureRequests: config.isProduction ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false
  });
}

export function createApp({ db, config }) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy !== false) app.set("trust proxy", config.trustProxy);

  app.use(securityMiddleware(config));
  app.use(compression());
  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      'geolocation=(self), camera=(), microphone=(), payment=(self "https://checkout.razorpay.com")'
    );
    next();
  });

  app.use(express.json({
    limit: "128kb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    }
  }));
  app.use(cookieParser());

  app.use("/api", apiRateLimiter(config));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", sameOriginGuard(config));
  app.use("/api", attachUser({ db, config }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "organic-vegetables", time: new Date().toISOString() });
  });

  app.get("/api/config", (req, res) => {
    res.json({
      store: config.store,
      delivery: {
        radiusKm: config.delivery.radiusKm,
        feePaise: config.delivery.feePaise,
        freeOverPaise: config.delivery.freeOverPaise,
        paymentWindowMinutes: config.delivery.paymentWindowMinutes
      },
      payments: {
        available: config.payments.available,
        demoEnabled: config.payments.demoEnabled,
        provider: config.razorpay.configured ? "razorpay" : null
      },
      razorpayKeyId: config.razorpay.configured ? config.razorpay.keyId : null,
      map: config.map,
      orderStatuses: config.orderStatuses,
      currency: "INR"
    });
  });

  app.use("/api/auth", createAuthRouter({ db, config }));
  app.use("/api/products", createProductsRouter({ db, config }));
  app.use("/api/delivery", createDeliveryRouter({ config }));
  app.use("/api/orders", createOrdersRouter({ db, config }));
  app.use("/api/payments", createPaymentsRouter({ db, config }));
  app.use("/api/admin", createAdminRouter({ db, config }));
  app.use("/api/webhooks", createWebhookRouter({ db, config }));

  app.use("/api", (req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "API endpoint not found." } });
  });

  app.get("/favicon.ico", (req, res) => {
    res.redirect(301, "/favicon.png");
  });

  app.use(
    express.static(publicDir, {
      index: false,
      maxAge: config.isProduction ? "1h" : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("sw.js") || filePath.endsWith("manifest.webmanifest")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      }
    })
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((req, res) => {
    res.status(404).type("text").send("Not found");
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details || undefined
        }
      });
    }
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({
        error: { code: "INVALID_JSON", message: "The request body is not valid JSON." }
      });
    }
    if (error?.type === "entity.too.large") {
      return res.status(413).json({
        error: { code: "BODY_TOO_LARGE", message: "The request is too large." }
      });
    }
    console.error("Unhandled request error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }
    });
  });

  return app;
}
