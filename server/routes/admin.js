import { Router } from "express";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { requireAdmin } from "../auth.js";
import { ApiError, notFound } from "../lib/errors.js";
import {
  adminOrderStatusSchema,
  parseBody,
  productInputSchema,
  productPatchSchema
} from "../lib/validation.js";
import { mapProduct, uniqueSlug } from "../services/catalog.js";
import {
  getAdminStats,
  getOrderByCode,
  getRefundableOrder,
  listOrdersForAdmin,
  markOrderRefunded,
  serializeOrder,
  updateOrderStatus
} from "../services/orders.js";

export function createAdminRouter({ db, config }) {
  const router = Router();
  const razorpay = config.razorpay.configured
    ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
    : null;

  router.use(requireAdmin);

  router.get("/stats", (req, res) => {
    const stats = getAdminStats(db);
    const refundPending = db
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE payment_status = 'refund_pending'")
      .get().count;
    res.json({ stats: { ...stats, refundPending } });
  });

  router.get("/orders", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !config.orderStatuses.includes(status)) {
      throw new ApiError(400, "INVALID_STATUS", "Unknown order status filter.");
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const bundles = listOrdersForAdmin(db, { status, limit });
    res.json({ orders: bundles.map((bundle) => serializeOrder(bundle, config, { admin: true })) });
  });

  router.get("/orders/:code", (req, res) => {
    const bundle = getOrderByCode(db, req.params.code);
    if (!bundle) throw notFound("Order not found.");
    res.json({ order: serializeOrder(bundle, config, { admin: true }) });
  });

  router.patch("/orders/:code/status", (req, res) => {
    const data = parseBody(adminOrderStatusSchema, req.body);
    updateOrderStatus(db, { code: req.params.code, status: data.status, note: data.note });
    const bundle = getOrderByCode(db, req.params.code);
    res.json({ order: serializeOrder(bundle, config, { admin: true }) });
  });

  router.post("/orders/:code/refund", async (req, res) => {
    const order = getRefundableOrder(db, req.params.code);
    if (!order) throw notFound("Order not found.");
    if (order.payment_status !== "refund_pending") {
      throw new ApiError(409, "NOT_REFUNDABLE", "This order does not have a pending refund.");
    }

    const isDemo = order.payment_method === "UPI (test)" || String(order.payment_reference || "").startsWith("demo_");
    if (isDemo) {
      markOrderRefunded(db, order.id, `demo_refund_${crypto.randomBytes(8).toString("hex")}`);
    } else {
      if (!razorpay || !order.payment_reference) {
        throw new ApiError(503, "REFUND_UNAVAILABLE", "Razorpay is not configured for automatic refunds.");
      }
      let refund;
      try {
        refund = await razorpay.payments.refund(order.payment_reference, {
          amount: order.total_paise,
          speed: "normal",
          notes: { orderCode: order.order_code, reason: "Order cancelled by store" }
        });
      } catch (error) {
        console.error("Razorpay refund failed:", error?.error?.description || error.message);
        throw new ApiError(502, "REFUND_FAILED", "The refund could not be processed. Please try again or refund from Razorpay.");
      }
      markOrderRefunded(db, order.id, refund.id);
    }

    const bundle = getOrderByCode(db, order.order_code);
    res.json({ order: serializeOrder(bundle, config, { admin: true }) });
  });

  router.get("/products", (req, res) => {
    const rows = db
      .prepare("SELECT * FROM products ORDER BY is_active DESC, name COLLATE NOCASE ASC")
      .all();
    res.json({ products: rows.map((row) => mapProduct(row, true)) });
  });

  router.post("/products", (req, res) => {
    const data = parseBody(productInputSchema, req.body);
    const now = new Date().toISOString();
    const slug = uniqueSlug(db, data.name);
    const result = db
      .prepare(
        `INSERT INTO products
          (name, slug, description, category, price_paise, unit, image_url, stock, is_featured, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name,
        slug,
        data.description,
        data.category,
        data.pricePaise,
        data.unit,
        data.imageUrl,
        data.stock,
        data.isFeatured ? 1 : 0,
        data.isActive ? 1 : 0,
        now,
        now
      );
    const row = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(result.lastInsertRowid));
    res.status(201).json({ product: mapProduct(row, true) });
  });

  router.patch("/products/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "INVALID_PRODUCT", "Invalid product id.");
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!existing) throw notFound("Product not found.");
    const data = parseBody(productPatchSchema, req.body);
    if (!Object.keys(data).length) {
      throw new ApiError(400, "NO_CHANGES", "No product changes were provided.");
    }

    const next = {
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      category: data.category ?? existing.category,
      pricePaise: data.pricePaise ?? existing.price_paise,
      unit: data.unit ?? existing.unit,
      imageUrl: data.imageUrl ?? existing.image_url,
      stock: data.stock ?? existing.stock,
      isFeatured: data.isFeatured ?? Boolean(existing.is_featured),
      isActive: data.isActive ?? Boolean(existing.is_active)
    };
    const slug = data.name !== undefined ? uniqueSlug(db, data.name, id) : existing.slug;

    db.prepare(
      `UPDATE products
       SET name = ?, slug = ?, description = ?, category = ?, price_paise = ?, unit = ?,
           image_url = ?, stock = ?, is_featured = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      next.name,
      slug,
      next.description,
      next.category,
      next.pricePaise,
      next.unit,
      next.imageUrl,
      next.stock,
      next.isFeatured ? 1 : 0,
      next.isActive ? 1 : 0,
      new Date().toISOString(),
      id
    );
    const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    res.json({ product: mapProduct(row, true) });
  });

  return router;
}
