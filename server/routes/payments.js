import crypto from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import Razorpay from "razorpay";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { ApiError } from "../lib/errors.js";
import { parseBody } from "../lib/validation.js";
import { getOrderByCode, markOrderPaid, serializeOrder } from "../services/orders.js";

const orderCodeSchema = z.object({
  orderCode: z.string().trim().min(5).max(40)
});

const verifySchema = z.object({
  orderCode: z.string().trim().min(5).max(40),
  razorpay_order_id: z.string().trim().min(4).max(120),
  razorpay_payment_id: z.string().trim().min(4).max(120),
  razorpay_signature: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Invalid payment signature.")
});

function paymentLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many payment attempts. Please wait a few minutes." }
      });
    }
  });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function ownedPendingOrder(db, user, orderCode) {
  const bundle = getOrderByCode(db, orderCode);
  if (!bundle || bundle.order.user_id !== user.id) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  }
  if (bundle.order.status === "cancelled") {
    throw new ApiError(409, "ORDER_CANCELLED", "This order was cancelled or expired.");
  }
  if (bundle.order.payment_status === "paid") {
    throw new ApiError(409, "ALREADY_PAID", "This order is already paid.");
  }
  return bundle;
}

export function createPaymentsRouter({ db, config }) {
  const router = Router();
  const limiter = paymentLimiter();
  const razorpay = config.razorpay.configured
    ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
    : null;

  router.post("/demo", limiter, requireAuth, (req, res) => {
    if (!config.payments.demoEnabled) {
      throw new ApiError(403, "DEMO_DISABLED", "Demo payments are not available.");
    }
    const { orderCode } = parseBody(orderCodeSchema, req.body);
    ownedPendingOrder(db, req.user, orderCode);
    const reference = `demo_payment_${crypto.randomBytes(10).toString("hex")}`;
    const providerId = `demo_order_${crypto.randomBytes(8).toString("hex")}`;
    markOrderPaid(db, {
      code: orderCode,
      method: "UPI (test)",
      providerOrderId: providerId,
      paymentReference: reference
    });
    const bundle = getOrderByCode(db, orderCode);
    res.json({ order: serializeOrder(bundle, config), demo: true });
  });

  router.post("/razorpay/order", limiter, requireAuth, async (req, res) => {
    if (!config.razorpay.configured || !razorpay) {
      throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "UPI payments are not configured yet.");
    }
    const { orderCode } = parseBody(orderCodeSchema, req.body);
    const bundle = ownedPendingOrder(db, req.user, orderCode);

    let providerOrderId = bundle.order.payment_provider_id;
    if (!providerOrderId || !providerOrderId.startsWith("order_")) {
      try {
        const providerOrder = await razorpay.orders.create({
          amount: bundle.order.total_paise,
          currency: "INR",
          receipt: bundle.order.order_code,
          notes: {
            orderCode: bundle.order.order_code,
            customerId: String(req.user.id)
          }
        });
        providerOrderId = providerOrder.id;
        db.prepare(
          "UPDATE orders SET payment_provider_id = ?, payment_method = 'UPI', updated_at = ? WHERE id = ?"
        ).run(providerOrderId, new Date().toISOString(), bundle.order.id);
      } catch (error) {
        console.error("Razorpay order creation failed:", error?.error?.description || error.message);
        throw new ApiError(502, "PAYMENT_SETUP_FAILED", "Could not start the UPI payment. Please try again.");
      }
    }

    res.json({
      keyId: config.razorpay.keyId,
      providerOrderId,
      amountPaise: bundle.order.total_paise,
      currency: "INR",
      orderCode: bundle.order.order_code,
      customer: {
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone
      },
      storeName: config.store.name
    });
  });

  router.post("/verify", limiter, requireAuth, (req, res) => {
    if (!config.razorpay.configured) {
      throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "UPI payments are not configured.");
    }
    const data = parseBody(verifySchema, req.body);
    const bundle = getOrderByCode(db, data.orderCode);
    if (!bundle || bundle.order.user_id !== req.user.id) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    }

    if (bundle.order.payment_status === "paid") {
      return res.json({ order: serializeOrder(bundle, config), verified: true });
    }
    if (
      !bundle.order.payment_provider_id ||
      !safeEqual(bundle.order.payment_provider_id, data.razorpay_order_id)
    ) {
      throw new ApiError(400, "PAYMENT_MISMATCH", "This payment does not belong to the order.");
    }

    const expected = crypto
      .createHmac("sha256", config.razorpay.keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest("hex");
    if (!safeEqual(expected, data.razorpay_signature)) {
      throw new ApiError(400, "INVALID_SIGNATURE", "Payment verification failed. Please contact support if money was debited.");
    }

    markOrderPaid(db, {
      code: data.orderCode,
      method: "UPI",
      providerOrderId: data.razorpay_order_id,
      paymentReference: data.razorpay_payment_id
    });
    const paidBundle = getOrderByCode(db, data.orderCode);
    res.json({ order: serializeOrder(paidBundle, config), verified: true });
  });

  return router;
}

export function createWebhookRouter({ db, config }) {
  const router = Router();

  router.post("/razorpay", (req, res) => {
    if (!config.razorpay.configured || !config.razorpay.webhookSecret) {
      throw new ApiError(503, "WEBHOOK_NOT_CONFIGURED", "Razorpay webhooks are not configured.");
    }
    const signature = req.get("x-razorpay-signature") || "";
    const expected = crypto
      .createHmac("sha256", config.razorpay.webhookSecret)
      .update(req.rawBody || Buffer.from(""))
      .digest("hex");
    if (!safeEqual(expected, signature)) {
      throw new ApiError(400, "INVALID_SIGNATURE", "Invalid webhook signature.");
    }

    let payload;
    try {
      payload = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      throw new ApiError(400, "INVALID_PAYLOAD", "Invalid webhook payload.");
    }

    const event = payload.event || "";
    const payment = payload.payload?.payment?.entity;
    if (event === "payment.captured" && payment?.order_id) {
      const order = db
        .prepare("SELECT order_code FROM orders WHERE payment_provider_id = ?")
        .get(payment.order_id);
      if (order) {
        markOrderPaid(db, {
          code: order.order_code,
          method: "UPI",
          providerOrderId: payment.order_id,
          paymentReference: payment.id,
          amountPaise: payment.amount
        });
      }
    }

    res.json({ received: true });
  });

  return router;
}
