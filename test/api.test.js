import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  login,
  loginAdmin,
  orderPayload,
  registerCustomer,
  startServer,
  testCustomer
} from "./helpers.js";

function productBySlug(products, slug) {
  return products.find((product) => product.slug === slug);
}

test("serves the public catalog, delivery quote, and hardened app shell", async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());
  const client = ctx.client();

  const health = await client.request("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const config = await client.request("/api/config");
  assert.equal(config.status, 200);
  assert.equal(config.data.delivery.radiusKm, 15);
  assert.equal(config.data.payments.demoEnabled, true);
  assert.equal(config.data.payments.available, true);
  assert.equal(config.data.razorpayKeyId, null);

  const catalog = await client.request("/api/products");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.products.length, 9);
  const catalogNames = catalog.data.products.map((product) => product.name);
  assert.deepEqual(
    catalogNames,
    [...catalogNames].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  );
  const tomato = productBySlug(catalog.data.products, "vine-tomatoes");
  assert.equal(tomato.stock, 45);
  assert.equal(tomato.pricePaise, 4900);

  const nearby = await client.request("/api/delivery/check?lat=12.9716&lng=77.5946");
  assert.equal(nearby.status, 200);
  assert.equal(nearby.data.serviceable, true);
  assert.equal(nearby.data.distanceKm, 0);

  const farAway = await client.request("/api/delivery/check?lat=28.6139&lng=77.2090");
  assert.equal(farAway.status, 200);
  assert.equal(farAway.data.serviceable, false);

  const html = await client.request("/", { headers: { accept: "text/html" } });
  assert.equal(html.status, 200);
  assert.match(html.text, /<title>.*Organic Vegetables/i);
  const csp = html.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self' https:\/\/checkout\.razorpay\.com/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(html.headers.get("permissions-policy"), /geolocation=\(self\)/);

  const manifest = await client.request("/manifest.webmanifest");
  assert.equal(manifest.status, 200);
  assert.equal(manifest.data.name, "Organic Vegetables");

  const worker = await client.request("/sw.js", { headers: { accept: "*/*" } });
  assert.equal(worker.status, 200);
  assert.equal(worker.headers.get("cache-control"), "no-cache");
  assert.match(worker.text, /organic-vegetables-v\d+/);

  const missing = await client.request("/api/does-not-exist");
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error.code, "NOT_FOUND");
});

test("registers, logs in, signs out, and enforces request security", async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());
  const client = ctx.client();

  const unauthenticated = await client.request("/api/orders");
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.data.error.code, "AUTH_REQUIRED");

  const badPhone = await registerCustomer(client, { phone: "1234567890" });
  assert.equal(badPhone.status, 400);
  assert.equal(badPhone.data.error.code, "INVALID_PHONE");

  const registered = await registerCustomer(client);
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.username, "asha.rao");
  assert.equal(registered.data.user.phone, "+919876543210");
  assert.equal(registered.data.user.role, "customer");
  assert.ok(client.cookies.has("ov_session"));

  const me = await client.request("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, testCustomer.email);

  const duplicate = await registerCustomer(client, {
    username: "asha.second",
    email: testCustomer.email,
    phone: "9876543211"
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error.code, "EMAIL_TAKEN");

  const logout = await client.request("/api/auth/logout", { method: "POST", body: {} });
  assert.equal(logout.status, 200);
  assert.equal(client.cookies.has("ov_session"), false);
  const signedOut = await client.request("/api/auth/me");
  assert.equal(signedOut.data.user, null);

  const wrongPassword = await login(client, testCustomer.email, "WrongPassword123");
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.data.error.code, "INVALID_CREDENTIALS");

  const signedIn = await login(client, testCustomer.username, testCustomer.password);
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.getSetCookie().join(";"), /HttpOnly/i);
  assert.match(signedIn.headers.getSetCookie().join(";"), /SameSite=Lax/i);

  const badOrigin = await client.request("/api/auth/login", {
    method: "POST",
    body: { identifier: testCustomer.email, password: testCustomer.password },
    headers: { origin: "https://attacker.example" }
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.data.error.code, "ORIGIN_NOT_ALLOWED");

  const wrongType = await client.request("/api/auth/login", {
    method: "POST",
    bodyText: JSON.stringify({ identifier: testCustomer.email, password: testCustomer.password }),
    headers: { "content-type": "text/plain" }
  });
  assert.equal(wrongType.status, 415);
  assert.equal(wrongType.data.error.code, "JSON_REQUIRED");

  const invalidJson = await client.request("/api/auth/login", {
    method: "POST",
    bodyText: "{",
    headers: { "content-type": "application/json" }
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.data.error.code, "INVALID_JSON");
});

test("creates orders, reserves stock, takes demo payment, and tracks delivery", async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());
  const customer = ctx.client();
  const otherCustomer = ctx.client();

  assert.equal((await registerCustomer(customer)).status, 201);
  assert.equal(
    (
      await registerCustomer(otherCustomer, {
        name: "Vikram Shah",
        username: "vikram",
        email: "vikram@example.com",
        phone: "9876543211"
      })
    ).status,
    201
  );

  const catalog = await customer.request("/api/products");
  const tomato = productBySlug(catalog.data.products, "vine-tomatoes");
  const created = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(tomato.id)
  });
  assert.equal(created.status, 201);
  assert.match(created.data.order.code, /^OV-\d{8}-[A-Z0-9]{6}$/);
  assert.equal(created.data.order.status, "placed");
  assert.equal(created.data.order.paymentStatus, "pending");
  assert.equal(created.data.order.subtotalPaise, 9800);
  assert.equal(created.data.order.deliveryFeePaise, 4900);
  assert.equal(created.data.order.totalPaise, 14700);
  assert.equal(created.data.order.canPay, true);
  assert.equal(created.data.order.canCancel, true);
  const orderCode = created.data.order.code;

  const afterOrder = await customer.request("/api/products/vine-tomatoes");
  assert.equal(afterOrder.data.product.stock, 43);

  const hiddenOrder = await otherCustomer.request(`/api/orders/${orderCode}`);
  assert.equal(hiddenOrder.status, 404);

  const list = await customer.request("/api/orders");
  assert.equal(list.status, 200);
  assert.equal(list.data.orders.length, 1);

  const paid = await customer.request("/api/payments/demo", {
    method: "POST",
    body: { orderCode }
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.demo, true);
  assert.equal(paid.data.order.status, "confirmed");
  assert.equal(paid.data.order.paymentStatus, "paid");
  assert.equal(paid.data.order.paymentMethod, "UPI (test)");
  assert.equal(paid.data.order.canPay, false);
  assert.equal(paid.data.order.canCancel, false);

  const paidAgain = await customer.request("/api/payments/demo", {
    method: "POST",
    body: { orderCode }
  });
  assert.equal(paidAgain.status, 409);
  assert.equal(paidAgain.data.error.code, "ALREADY_PAID");

  const admin = ctx.client();
  const adminLogin = await loginAdmin(admin);
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.data.user.role, "admin");

  const customerStats = await customer.request("/api/admin/stats");
  assert.equal(customerStats.status, 403);
  assert.equal(customerStats.data.error.code, "ADMIN_ONLY");

  const adminOrder = await admin.request(`/api/admin/orders/${orderCode}`);
  assert.equal(adminOrder.status, 200);
  assert.deepEqual(adminOrder.data.order.admin.allowedTransitions, ["packed", "cancelled"]);

  const invalidSkip = await admin.request(`/api/admin/orders/${orderCode}/status`, {
    method: "PATCH",
    body: { status: "delivered" }
  });
  assert.equal(invalidSkip.status, 409);
  assert.equal(invalidSkip.data.error.code, "INVALID_STATUS_TRANSITION");

  for (const status of ["packed", "out_for_delivery", "delivered"]) {
    const updated = await admin.request(`/api/admin/orders/${orderCode}/status`, {
      method: "PATCH",
      body: { status }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.order.status, status);
  }

  const delivered = await customer.request(`/api/orders/${orderCode}`);
  assert.equal(delivered.status, 200);
  assert.ok(delivered.data.order.deliveredAt);
  assert.deepEqual(
    delivered.data.order.events.map((event) => event.status),
    ["placed", "confirmed", "packed", "out_for_delivery", "delivered"]
  );

  const filtered = await admin.request("/api/admin/orders?status=delivered");
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.orders.some((order) => order.code === orderCode), true);
});

test("restores stock on cancellation and processes demo refunds", async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());
  const customer = ctx.client();
  const admin = ctx.client();
  assert.equal((await registerCustomer(customer)).status, 201);

  const catalog = await customer.request("/api/products");
  const tomato = productBySlug(catalog.data.products, "vine-tomatoes");

  const first = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(tomato.id, { items: [{ productId: tomato.id, quantity: 3 }] })
  });
  assert.equal(first.status, 201);
  assert.equal((await customer.request("/api/products/vine-tomatoes")).data.product.stock, 42);

  const cancelled = await customer.request(`/api/orders/${first.data.order.code}/cancel`, {
    method: "POST",
    body: {}
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.order.status, "cancelled");
  assert.equal(cancelled.data.order.paymentStatus, "cancelled");
  assert.equal((await customer.request("/api/products/vine-tomatoes")).data.product.stock, 45);

  const cancelAgain = await customer.request(`/api/orders/${first.data.order.code}/cancel`, {
    method: "POST",
    body: {}
  });
  assert.equal(cancelAgain.status, 409);
  assert.equal(cancelAgain.data.error.code, "CANNOT_CANCEL");

  const second = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(tomato.id, { items: [{ productId: tomato.id, quantity: 4 }] })
  });
  assert.equal(second.status, 201);
  const secondCode = second.data.order.code;
  assert.equal((await customer.request("/api/products/vine-tomatoes")).data.product.stock, 41);

  const paid = await customer.request("/api/payments/demo", {
    method: "POST",
    body: { orderCode: secondCode }
  });
  assert.equal(paid.status, 200);

  const customerCancelPaid = await customer.request(`/api/orders/${secondCode}/cancel`, {
    method: "POST",
    body: {}
  });
  assert.equal(customerCancelPaid.status, 409);
  assert.equal(customerCancelPaid.data.error.code, "CANNOT_CANCEL");

  assert.equal((await loginAdmin(admin)).status, 200);
  const adminCancel = await admin.request(`/api/admin/orders/${secondCode}/status`, {
    method: "PATCH",
    body: { status: "cancelled", note: "Produce quality issue." }
  });
  assert.equal(adminCancel.status, 200);
  assert.equal(adminCancel.data.order.status, "cancelled");
  assert.equal(adminCancel.data.order.paymentStatus, "refund_pending");
  assert.equal(adminCancel.data.order.cancelReason, "Produce quality issue.");
  assert.equal((await customer.request("/api/products/vine-tomatoes")).data.product.stock, 45);

  const beforeRefund = await admin.request("/api/admin/stats");
  assert.equal(beforeRefund.data.stats.refundPending, 1);

  const refunded = await admin.request(`/api/admin/orders/${secondCode}/refund`, {
    method: "POST",
    body: {}
  });
  assert.equal(refunded.status, 200);
  assert.equal(refunded.data.order.paymentStatus, "refunded");
  assert.match(refunded.data.order.admin.refundReference, /^demo_refund_/);
  assert.deepEqual(
    refunded.data.order.events.map((event) => event.status),
    ["placed", "confirmed", "cancelled", "refunded"]
  );

  const afterRefund = await admin.request("/api/admin/stats");
  assert.equal(afterRefund.data.stats.refundPending, 0);
  const refundAgain = await admin.request(`/api/admin/orders/${secondCode}/refund`, {
    method: "POST",
    body: {}
  });
  assert.equal(refundAgain.status, 409);
  assert.equal(refundAgain.data.error.code, "NOT_REFUNDABLE");
});

test("lets admins manage products and rejects out-of-area or unavailable orders", async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());
  const customer = ctx.client();
  const admin = ctx.client();
  assert.equal((await registerCustomer(customer)).status, 201);

  const denied = await customer.request("/api/admin/products");
  assert.equal(denied.status, 403);
  const deniedPatch = await customer.request("/api/admin/products/1", {
    method: "PATCH",
    body: { name: "Customer Override", pricePaise: 100 }
  });
  assert.equal(deniedPatch.status, 403);
  assert.equal((await loginAdmin(admin)).status, 200);

  const stats = await admin.request("/api/admin/stats");
  assert.equal(stats.status, 200);
  for (const key of ["activeOrders", "awaitingPayment", "todayOrders", "todayRevenuePaise", "lowStock", "customers"]) {
    assert.equal(typeof stats.data.stats[key], "number");
  }

  const products = await admin.request("/api/admin/products");
  assert.equal(products.status, 200);
  assert.equal(products.data.products.length, 9);
  assert.equal(typeof products.data.products[0].isActive, "boolean");

  const created = await admin.request("/api/admin/products", {
    method: "POST",
    body: {
      name: "Test Kale",
      description: "Tender test kale leaves for integration testing.",
      category: "Leafy Greens",
      pricePaise: 4100,
      unit: "250 g",
      imageUrl: "/images/spinach.jpg",
      stock: 8,
      isFeatured: false,
      isActive: true
    }
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.product.slug, "test-kale");
  const productId = created.data.product.id;

  const renamed = await admin.request(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: { name: "Test Curly Kale", pricePaise: 4300 }
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.product.name, "Test Curly Kale");
  assert.equal(renamed.data.product.slug, "test-curly-kale");
  assert.equal(renamed.data.product.pricePaise, 4300);

  const publicAfterRename = await customer.request("/api/products");
  assert.equal(productBySlug(publicAfterRename.data.products, "test-curly-kale").pricePaise, 4300);

  const patched = await admin.request(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: { stock: 2 }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.product.stock, 2);

  const tooMany = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(productId, { items: [{ productId, quantity: 3 }] })
  });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.data.error.code, "STOCK_UNAVAILABLE");

  const outOfArea = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(productId, {
      items: [{ productId, quantity: 1 }],
      address: { lat: 28.6139, lng: 77.209 }
    })
  });
  assert.equal(outOfArea.status, 422);
  assert.equal(outOfArea.data.error.code, "OUTSIDE_DELIVERY_AREA");
  assert.equal((await admin.request(`/api/admin/products`)).data.products.find((item) => item.id === productId).stock, 2);

  const deactivated = await admin.request(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: { isActive: false }
  });
  assert.equal(deactivated.status, 200);
  const unavailable = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(productId, { items: [{ productId, quantity: 1 }] })
  });
  assert.equal(unavailable.status, 409);
  assert.equal(unavailable.data.error.code, "PRODUCT_UNAVAILABLE");

  const noChanges = await admin.request(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: {}
  });
  assert.equal(noChanges.status, 400);
  assert.equal(noChanges.data.error.code, "NO_CHANGES");

  const invalidStock = await admin.request(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: { stock: -1 }
  });
  assert.equal(invalidStock.status, 400);
  assert.equal(invalidStock.data.error.code, "VALIDATION_ERROR");
});

test("verifies Razorpay signatures and processes signed webhooks", async (t) => {
  const keySecret = "local_test_razorpay_secret";
  const webhookSecret = "local_test_webhook_secret";
  const ctx = await startServer({
    razorpay: {
      keyId: "rzp_test_local",
      keySecret,
      webhookSecret,
      configured: true
    },
    payments: { demoEnabled: false, available: true }
  });
  t.after(() => ctx.close());
  const customer = ctx.client();
  assert.equal((await registerCustomer(customer)).status, 201);
  assert.equal(ctx.config.payments.demoEnabled, false);

  const catalog = await customer.request("/api/products");
  const tomato = productBySlug(catalog.data.products, "vine-tomatoes");
  const created = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(tomato.id, { items: [{ productId: tomato.id, quantity: 1 }] })
  });
  assert.equal(created.status, 201);
  const orderCode = created.data.order.code;
  const providerOrderId = "order_test_local_123";
  ctx.db
    .prepare("UPDATE orders SET payment_provider_id = ?, payment_method = 'UPI' WHERE order_code = ?")
    .run(providerOrderId, orderCode);

  const demoDenied = await customer.request("/api/payments/demo", {
    method: "POST",
    body: { orderCode }
  });
  assert.equal(demoDenied.status, 403);
  assert.equal(demoDenied.data.error.code, "DEMO_DISABLED");

  const checkout = await customer.request("/api/payments/razorpay/order", {
    method: "POST",
    body: { orderCode }
  });
  assert.equal(checkout.status, 200);
  assert.equal(checkout.data.keyId, "rzp_test_local");
  assert.equal(checkout.data.providerOrderId, providerOrderId);
  assert.equal(checkout.data.amountPaise, created.data.order.totalPaise);

  const badSignature = await customer.request("/api/payments/verify", {
    method: "POST",
    body: {
      orderCode,
      razorpay_order_id: providerOrderId,
      razorpay_payment_id: "pay_test_local_123",
      razorpay_signature: "0".repeat(64)
    }
  });
  assert.equal(badSignature.status, 400);
  assert.equal(badSignature.data.error.code, "INVALID_SIGNATURE");

  const paymentId = "pay_test_local_123";
  const signature = crypto
    .createHmac("sha256", keySecret)
    .update(`${providerOrderId}|${paymentId}`)
    .digest("hex");
  const verified = await customer.request("/api/payments/verify", {
    method: "POST",
    body: {
      orderCode,
      razorpay_order_id: providerOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    }
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.verified, true);
  assert.equal(verified.data.order.status, "confirmed");
  assert.equal(verified.data.order.paymentStatus, "paid");

  const webhookOrder = await customer.request("/api/orders", {
    method: "POST",
    body: orderPayload(tomato.id, { items: [{ productId: tomato.id, quantity: 1 }] })
  });
  assert.equal(webhookOrder.status, 201);
  const webhookOrderCode = webhookOrder.data.order.code;
  const webhookProviderId = "order_webhook_local_456";
  ctx.db
    .prepare("UPDATE orders SET payment_provider_id = ?, payment_method = 'UPI' WHERE order_code = ?")
    .run(webhookProviderId, webhookOrderCode);

  const payload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_webhook_local_456",
          order_id: webhookProviderId,
          amount: webhookOrder.data.order.totalPaise,
          currency: "INR",
          status: "captured"
        }
      }
    }
  });
  const webhookSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload)
    .digest("hex");

  const rejectedWebhook = await customer.request("/api/webhooks/razorpay", {
    method: "POST",
    bodyText: payload,
    headers: { "x-razorpay-signature": "0".repeat(64) }
  });
  assert.equal(rejectedWebhook.status, 400);
  assert.equal(rejectedWebhook.data.error.code, "INVALID_SIGNATURE");

  const webhook = await customer.request("/api/webhooks/razorpay", {
    method: "POST",
    bodyText: payload,
    headers: { "x-razorpay-signature": webhookSignature }
  });
  assert.equal(webhook.status, 200);
  assert.equal(webhook.data.received, true);

  const tracked = await customer.request(`/api/orders/${webhookOrderCode}`);
  assert.equal(tracked.data.order.status, "confirmed");
  assert.equal(tracked.data.order.paymentStatus, "paid");
  assert.equal(tracked.data.order.paymentMethod, "UPI");
});
