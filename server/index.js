import { config } from "./config.js";
import { createApp } from "./app.js";
import { createDatabase, seedDatabase } from "./db.js";
import { expireUnpaidOrders } from "./services/orders.js";

const db = createDatabase(config.databasePath);
seedDatabase(db, config);

const app = createApp({ db, config });
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Organic Vegetables is running at ${config.appUrl}`);
  console.log(`Local URL: http://localhost:${config.port}`);
  if (config.payments.demoEnabled) {
    console.log("Payments: DEMO UPI mode (no real money). Add Razorpay keys to accept live UPI payments.");
  } else if (config.razorpay.configured) {
    console.log("Payments: Razorpay UPI is configured.");
  } else {
    console.warn("Payments: online payments are disabled until Razorpay keys are configured.");
  }
});

function cleanup() {
  try {
    const expired = expireUnpaidOrders(db, config);
    if (expired) console.log(`Cancelled ${expired} unpaid order(s).`);
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  } catch (error) {
    console.error("Cleanup failed:", error.message);
  }
}

cleanup();
const cleanupTimer = setInterval(cleanup, 5 * 60 * 1000);
cleanupTimer.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down...`);
  clearInterval(cleanupTimer);
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error(error.message);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Change PORT in .env.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
