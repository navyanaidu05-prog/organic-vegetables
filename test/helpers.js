import { once } from "node:events";
import { loadConfig } from "../server/config.js";
import { createApp } from "../server/app.js";
import { createDatabase, seedDatabase } from "../server/db.js";

export const testAdmin = {
  name: "Test Store Admin",
  username: "testadmin",
  email: "testadmin@example.com",
  phone: "9888877777",
  password: "TestAdminPass123"
};

export const testCustomer = {
  name: "Asha Rao",
  username: "asha.rao",
  email: "asha.rao@example.com",
  phone: "9876543210",
  password: "StrongPass123"
};

export async function startServer(overrides = {}) {
  const config = loadConfig({
    isProduction: false,
    databasePath: ":memory:",
    appUrl: "http://127.0.0.1",
    trustProxy: false,
    admin: testAdmin,
    razorpay: { keyId: "", keySecret: "", webhookSecret: "", configured: false },
    payments: { demoEnabled: true, available: true },
    ...overrides
  });
  const db = createDatabase(":memory:");
  seedDatabase(db, config);
  const app = createApp({ db, config });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    config,
    db,
    server,
    baseUrl,
    client: () => createClient(baseUrl),
    async close() {
      server.closeIdleConnections?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      db.close();
    }
  };
}

export function createClient(baseUrl) {
  const cookies = new Map();

  async function request(path, options = {}) {
    const {
      method = "GET",
      body,
      bodyText,
      headers = {}
    } = options;
    const hasBody = body !== undefined || bodyText !== undefined;
    const requestHeaders = {
      accept: "application/json",
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(method !== "GET" && method !== "HEAD" ? { origin: baseUrl } : {}),
      ...headers
    };
    if (cookies.size) {
      requestHeaders.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: hasBody ? bodyText ?? JSON.stringify(body) : undefined,
      redirect: "manual"
    });

    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value || /max-age=0/i.test(cookie)) {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    return { status: response.status, headers: response.headers, text, data };
  }

  return { request, cookies };
}

export async function registerCustomer(client, overrides = {}) {
  return client.request("/api/auth/register", {
    method: "POST",
    body: { ...testCustomer, ...overrides }
  });
}

export async function login(client, identifier, password) {
  return client.request("/api/auth/login", {
    method: "POST",
    body: { identifier, password }
  });
}

export async function loginAdmin(client) {
  return login(client, testAdmin.username, testAdmin.password);
}

export function orderPayload(productId, overrides = {}) {
  const { address, items, ...rest } = overrides;
  return {
    items: items || [{ productId, quantity: 2 }],
    address: {
      label: "Home",
      recipientName: testCustomer.name,
      contactPhone: testCustomer.phone,
      line: "42 Green Avenue, Indiranagar, Bengaluru 560038",
      notes: "Please leave at the door.",
      lat: 12.9716,
      lng: 77.5946,
      ...address
    },
    ...rest
  };
}
