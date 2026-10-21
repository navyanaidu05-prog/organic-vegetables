import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../auth.js";
import { withTransaction } from "../db.js";
import { ApiError, notFound } from "../lib/errors.js";
import { normalizePhone, orderCreateSchema, parseBody } from "../lib/validation.js";
import { deliveryQuote } from "./delivery.js";
import {
  cancelOrder,
  generateOrderCode,
  getOrderByCode,
  listOrdersForUser,
  serializeOrder
} from "../services/orders.js";

function createOrderLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many order attempts. Please wait a little while." }
      });
    }
  });
}

export function createOrdersRouter({ db, config }) {
  const router = Router();
  const orderLimiter = createOrderLimiter();

  router.use(requireAuth);

  router.get("/", (req, res) => {
    const bundles = listOrdersForUser(db, req.user.id);
    res.json({ orders: bundles.map((bundle) => serializeOrder(bundle, config)) });
  });

  router.post("/", orderLimiter, (req, res) => {
    if (!config.payments.available) {
      throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Online payments are not configured. Please contact the store.");
    }

    const data = parseBody(orderCreateSchema, req.body);
    const phone = normalizePhone(data.address.contactPhone);
    const quantityByProduct = new Map();
    for (const item of data.items) {
      const next = (quantityByProduct.get(item.productId) || 0) + item.quantity;
      if (next > 20) {
        throw new ApiError(400, "TOO_MANY_ITEMS", "You can order up to 20 of each vegetable.");
      }
      quantityByProduct.set(item.productId, next);
    }
    if ([...quantityByProduct.values()].reduce((sum, qty) => sum + qty, 0) > 50) {
      throw new ApiError(400, "TOO_MANY_ITEMS", "Please split large orders into smaller ones.");
    }

    let subtotalPaise = 0;
    const itemRows = [];
    for (const [productId, quantity] of quantityByProduct) {
      const row = db.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1").get(productId);
      if (!row) {
        throw new ApiError(409, "PRODUCT_UNAVAILABLE", "One of the vegetables in your cart is no longer available.");
      }
      if (row.stock < quantity) {
        throw new ApiError(409, "STOCK_UNAVAILABLE", `Only ${row.stock} ${row.unit} of ${row.name} is available.`);
      }
      subtotalPaise += row.price_paise * quantity;
      itemRows.push({ row, quantity });
    }

    const quote = deliveryQuote(config, data.address.lat, data.address.lng, subtotalPaise);
    if (!quote.serviceable) {
      throw new ApiError(
        422,
        "OUTSIDE_DELIVERY_AREA",
        `This address is ${quote.distanceKm} km away. We currently deliver within ${quote.radiusKm} km of the store.`,
        { distanceKm: quote.distanceKm, radiusKm: quote.radiusKm }
      );
    }

    const deliveryFeePaise = quote.deliveryFeePaise;
    const totalPaise = subtotalPaise + deliveryFeePaise;
    const contactPhone = phone;
    let orderCode;
    let orderId;

    withTransaction(db, () => {
      const now = new Date().toISOString();
      do {
        orderCode = generateOrderCode();
      } while (db.prepare("SELECT id FROM orders WHERE order_code = ?").get(orderCode));

      for (const { row, quantity } of itemRows) {
        const updated = db
          .prepare("UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ? AND is_active = 1")
          .run(quantity, now, row.id, quantity);
        if (updated.changes !== 1) {
          throw new ApiError(409, "STOCK_UNAVAILABLE", `${row.name} just went out of stock. Please update your cart.`);
        }
      }

      const result = db
        .prepare(
          `INSERT INTO orders (
            order_code, user_id, status, payment_status, subtotal_paise, delivery_fee_paise, total_paise,
            delivery_label, recipient_name, contact_phone, address_line, delivery_notes,
            lat, lng, distance_km, stock_reserved, created_at, updated_at
          ) VALUES (?, ?, 'placed', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          orderCode,
          req.user.id,
          subtotalPaise,
          deliveryFeePaise,
          totalPaise,
          data.address.label,
          data.address.recipientName,
          contactPhone,
          data.address.line,
          data.address.notes || "",
          data.address.lat,
          data.address.lng,
          quote.distanceKm,
          now,
          now
        );
      orderId = Number(result.lastInsertRowid);

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, product_id, name, slug, image_url, unit, quantity, price_paise)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const { row, quantity } of itemRows) {
        insertItem.run(
          orderId,
          row.id,
          row.name,
          row.slug,
          row.image_url,
          row.unit,
          quantity,
          row.price_paise
        );
      }

      db.prepare("INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, 'placed', ?, ?)").run(
        orderId,
        "Order placed. Waiting for payment.",
        now
      );
    });

    const bundle = getOrderByCode(db, orderCode);
    res.status(201).json({ order: serializeOrder(bundle, config) });
  });

  router.get("/:code", (req, res) => {
    const bundle = getOrderByCode(db, req.params.code);
    if (!bundle || (bundle.order.user_id !== req.user.id && req.user.role !== "admin")) {
      throw notFound("Order not found.");
    }
    res.json({ order: serializeOrder(bundle, config, { admin: req.user.role === "admin" }) });
  });

  router.post("/:code/cancel", (req, res) => {
    const bundle = getOrderByCode(db, req.params.code);
    if (!bundle || bundle.order.user_id !== req.user.id) throw notFound("Order not found.");
    if (!serializeOrder(bundle, config).canCancel) {
      throw new ApiError(409, "CANNOT_CANCEL", "This order can no longer be cancelled online. Please contact the store.");
    }
    cancelOrder(db, { code: req.params.code, reason: "Cancelled by customer." });
    const updated = getOrderByCode(db, req.params.code);
    res.json({ order: serializeOrder(updated, config) });
  });

  return router;
}
