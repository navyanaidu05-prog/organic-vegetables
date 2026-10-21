import { ApiError, api } from "./api.js";

let scriptPromise = null;

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new ApiError("Could not load the secure UPI checkout. Check your connection and try again.", {
        code: "CHECKOUT_LOAD_FAILED"
      }));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export async function payWithDemo(orderCode) {
  const result = await api.post("/payments/demo", { orderCode });
  return result.order;
}

export async function payWithRazorpay(orderCode) {
  const setup = await api.post("/payments/razorpay/order", { orderCode });
  await loadRazorpay();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const checkout = new window.Razorpay({
      key: setup.keyId,
      amount: setup.amountPaise,
      currency: setup.currency || "INR",
      name: setup.storeName || "Organic Vegetables",
      description: `Order ${setup.orderCode}`,
      order_id: setup.providerOrderId,
      prefill: setup.customer,
      notes: { orderCode: setup.orderCode },
      theme: { color: "#173f2a" },
      method: { upi: true, card: false, netbanking: false, wallet: false, paylater: false, emi: false },
      handler: async (response) => {
        try {
          const verified = await api.post("/payments/verify", {
            orderCode: setup.orderCode,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          finish(resolve, verified.order);
        } catch (error) {
          finish(reject, error);
        }
      },
      modal: {
        ondismiss: () => {
          finish(
            reject,
            new ApiError("Payment was not completed. Your order is saved and you can pay from My orders.", {
              code: "PAYMENT_DISMISSED"
            })
          );
        }
      }
    });

    checkout.on("payment.failed", (response) => {
      const message =
        response?.error?.description || "The UPI payment failed. Please try again from My orders.";
      finish(reject, new ApiError(message, { code: "PAYMENT_FAILED" }));
    });

    checkout.open();
  });
}
