import crypto from "node:crypto";
import { withTransaction } from "../db.js";
import { ApiError } from "../lib/errors.js";

export const allowedTransitions = {
  placed: ["cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: []
};

export function generateOrderCode() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const suffix = crypto.randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
  return `OV-${stamp}-${suffix}`;
}

function appendEvent(db, orderId, status, note, now) {
  db.prepare("INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)").run(
    orderId,
    status,
    note || null,
    now
  );
}

function loadBundle(db, whereSql, params) {
  const order = db
    .prepare(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone, u.username AS customer_username
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE ${whereSql}`
    )
    .get(...params);
  if (!order) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id);
  const events = db
    .prepare("SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC")
    .all(order.id);
  return { order, items, events };
}

export function getOrderByCode(db, code) {
  return loadBundle(db, "o.order_code = ?", [code]);
}

export function getOrderById(db, id) {
  return loadBundle(db, "o.id = ?", [id]);
}

export function listOrdersForUser(db, userId) {
  const rows = db
    .prepare("SELECT order_code FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100")
    .all(userId);
  return rows.map((row) => getOrderByCode(db, row.order_code)).filter(Boolean);
}

export function listOrdersForAdmin(db, { status = "", limit = 100 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  const rows = status
    ? db.prepare("SELECT order_code FROM orders WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, safeLimit)
    : db.prepare("SELECT order_code FROM orders ORDER BY id DESC LIMIT ?").all(safeLimit);
  return rows.map((row) => getOrderByCode(db, row.order_code)).filter(Boolean);
}

export function serializeOrder(bundle, config, { admin = false } = {}) {
  if (!bundle) return null;
  const { order, items, events } = bundle;
  const activePayment = order.payment_status === "paid";
  return {
    code: order.order_code,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    subtotalPaise: order.subtotal_paise,
    deliveryFeePaise: order.delivery_fee_paise,
    totalPaise: order.total_paise,
    address: {
      label: order.delivery_label,
      recipientName: order.recipient_name,
      contactPhone: order.contact_phone,
      line: order.address_line,
      notes: order.delivery_notes || "",
      lat: order.lat,
      lng: order.lng,
      distanceKm: order.distance_km
    },
    items: items.map((item) => ({
      productId: item.product_id,
      name: item.name,
      slug: item.slug,
      imageUrl: item.image_url,
      unit: item.unit,
      quantity: item.quantity,
      pricePaise: item.price_paise
    })),
    events: events.map((event) => ({
      status: event.status,
      note: event.note,
      createdAt: event.created_at
    })),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at,
    cancelReason: order.cancel_reason,
    canPay: Boolean(
      config.payments.available &&
        order.payment_status === "pending" &&
        order.status !== "cancelled"
    ),
    canCancel: Boolean(order.payment_status === "pending" && order.status === "placed"),
    admin: admin
      ? {
          customer: {
            id: order.user_id,
            name: order.customer_name,
            username: order.customer_username,
            email: order.customer_email,
            phone: order.customer_phone
          },
          paymentReference: order.payment_reference,
          paymentProviderId: order.payment_provider_id,
          refundReference: order.refund_reference,
          stockReserved: Boolean(order.stock_reserved),
          allowedTransitions: activePayment ? allowedTransitions[order.status] || [] : order.status === "placed" ? ["cancelled"] : ["cancelled"]
        }
      : undefined
  };
}

export function releaseOrderStock(db, orderId, now = new Date().toISOString()) {
  const order = db.prepare("SELECT stock_reserved FROM orders WHERE id = ?").get(orderId);
  if (!order || !order.stock_reserved) return;
  const items = db.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?").all(orderId);
  for (const item of items) {
    if (!item.product_id) continue;
    db.prepare("UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?").run(
      item.quantity,
      now,
      item.product_id
    );
  }
  db.prepare("UPDATE orders SET stock_reserved = 0, updated_at = ? WHERE id = ?").run(now, orderId);
}

function cancelOrderTx(db, { code, reason, byAdmin = false, expired = false }) {
  const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(code);
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (order.status === "delivered") {
    throw new ApiError(409, "ORDER_ALREADY_DELIVERED", "Delivered orders cannot be cancelled.");
  }
  if (order.status === "cancelled") {
    throw new ApiError(409, "ORDER_ALREADY_CANCELLED", "This order has already been cancelled.");
  }
  if (!byAdmin && order.payment_status !== "pending") {
    throw new ApiError(409, "CONTACT_STORE", "This order is already paid. Please contact the store to cancel it.");
  }

  const now = new Date().toISOString();
  releaseOrderStock(db, order.id, now);
  const nextPaymentStatus =
    order.payment_status === "paid"
      ? "refund_pending"
      : expired
        ? "expired"
        : "cancelled";
  const note = expired
    ? "Payment was not completed within the payment window."
    : reason || (byAdmin ? "Cancelled by the store." : "Cancelled by customer.");

  db.prepare(
    `UPDATE orders
     SET status = 'cancelled', payment_status = ?, cancel_reason = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextPaymentStatus, note, now, order.id);
  appendEvent(db, order.id, "cancelled", note, now);
  return order.id;
}

export function cancelOrder(db, options) {
  return withTransaction(db, () => cancelOrderTx(db, options));
}

export function markOrderPaid(
  db,
  { code, method, providerOrderId = null, paymentReference, amountPaise = null }
) {
  return withTransaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(code);
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.payment_status === "paid") return order.id;
    if (order.status === "cancelled") {
      throw new ApiError(409, "ORDER_CANCELLED", "This order has expired or was cancelled.");
    }
    if (amountPaise !== null && Number(amountPaise) !== order.total_paise) {
      throw new ApiError(400, "AMOUNT_MISMATCH", "The payment amount does not match this order.");
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE orders
       SET payment_status = 'paid', payment_method = ?, payment_provider_id = ?,
           payment_reference = ?, paid_at = ?, status = 'confirmed', updated_at = ?
       WHERE id = ?`
    ).run(method, providerOrderId, paymentReference, now, now, order.id);
    appendEvent(db, order.id, "confirmed", "Payment received. Your order is confirmed.", now);
    return order.id;
  });
}

export function updateOrderStatus(db, { code, status, note = "" }) {
  return withTransaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(code);
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.status === status) {
      throw new ApiError(409, "SAME_STATUS", "The order is already in that status.");
    }
    if (order.payment_status !== "paid" && status !== "cancelled") {
      throw new ApiError(409, "PAYMENT_PENDING", "Payment has not been received for this order.");
    }
    if (!allowedTransitions[order.status]?.includes(status)) {
      throw new ApiError(409, "INVALID_STATUS_TRANSITION", "That status change is not allowed for this order.");
    }

    if (status === "cancelled") {
      return cancelOrderTx(db, { code, reason: note || "Cancelled by the store.", byAdmin: true });
    }

    const now = new Date().toISOString();
    const deliveredAt = status === "delivered" ? now : order.delivered_at;
    db.prepare("UPDATE orders SET status = ?, updated_at = ?, delivered_at = ? WHERE id = ?").run(
      status,
      now,
      deliveredAt,
      order.id
    );
    const defaultNotes = {
      packed: "Your produce is packed and ready for dispatch.",
      out_for_delivery: "Your order is on the way.",
      delivered: "Delivered. Thank you for choosing Organic Vegetables."
    };
    appendEvent(db, order.id, status, note || defaultNotes[status] || "", now);
    return order.id;
  });
}

export function expireUnpaidOrders(db, config) {
  const cutoff = new Date(
    Date.now() - config.delivery.paymentWindowMinutes * 60 * 1000
  ).toISOString();
  const rows = db
    .prepare(
      "SELECT order_code FROM orders WHERE status = 'placed' AND payment_status = 'pending' AND created_at < ? LIMIT 50"
    )
    .all(cutoff);

  let count = 0;
  for (const row of rows) {
    try {
      cancelOrder(db, { code: row.order_code, expired: true });
      count += 1;
    } catch (error) {
      if (error.code !== "ORDER_ALREADY_CANCELLED") {
        console.error("Failed to expire order", row.order_code, error.message);
      }
    }
  }
  return count;
}

export function getAdminStats(db) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const active = db
    .prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('confirmed','packed','out_for_delivery')")
    .get().count;
  const awaitingPayment = db
    .prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'placed' AND payment_status = 'pending'")
    .get().count;
  const todayOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ?").get(startIso).count;
  const todayRevenue = db
    .prepare("SELECT COALESCE(SUM(total_paise), 0) AS total FROM orders WHERE paid_at >= ? AND payment_status = 'paid' AND status != 'cancelled'")
    .get(startIso).total;
  const lowStock = db
    .prepare("SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND stock <= 5")
    .get().count;
  const customers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'customer'").get().count;
  return {
    activeOrders: active,
    awaitingPayment,
    todayOrders,
    todayRevenuePaise: todayRevenue,
    lowStock,
    customers
  };
}

export function getRefundableOrder(db, code) {
  return db
    .prepare("SELECT * FROM orders WHERE order_code = ?")
    .get(code);
}

export function markOrderRefunded(db, orderId, refundReference) {
  return withTransaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.payment_status !== "refund_pending") {
      throw new ApiError(409, "NOT_REFUNDABLE", "This order does not have a pending refund.");
    }
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE orders SET payment_status = 'refunded', refund_reference = ?, updated_at = ? WHERE id = ?"
    ).run(refundReference, now, orderId);
    appendEvent(db, orderId, "refunded", "Refund processed to the original payment method.", now);
    return orderId;
  });
}
