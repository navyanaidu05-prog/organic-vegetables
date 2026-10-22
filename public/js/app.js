import { ApiError, api } from "./api.js";
import * as views from "./views.js";
import {
  busy,
  clearFormError,
  closeDialog,
  confirmDialog,
  currentDialog,
  openDialog,
  showFormError,
  toast
} from "./ui.js";
import { payWithDemo, payWithRazorpay } from "./payments.js";
import {
  escapeHtml,
  formatDistance,
  formatMoney,
  haversineKm,
  icon,
  initials,
  statusMeta
} from "./utils.js";

const CART_KEY = "ov_cart_v1";
const ADDRESS_KEY = "ov_address_v1";
const ADMIN_TAB_KEY = "ov_admin_tab";

const state = {
  config: null,
  user: null,
  products: [],
  categories: [],
  cart: readCart(),
  route: { path: window.location.pathname.replace(/\/+$/, "") || "/", search: window.location.search },
  savedAddress: readJson(ADDRESS_KEY),
  checkoutDraft: null,
  checkoutLocation: null,
  cartDialog: null,
  adminTab: sessionStorage.getItem(ADMIN_TAB_KEY) || "orders",
  adminData: null,
  installPrompt: null,
  cleanups: [],
  shopReset: null,
  isBooted: false
};

const mainEl = () => document.getElementById("main");

function readJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const map = new Map();
    for (const item of raw) {
      const id = Number(item?.productId);
      const quantity = Number(item?.quantity);
      if (!Number.isInteger(id) || id < 1) continue;
      if (!Number.isInteger(quantity) || quantity < 1) continue;
      map.set(id, Math.min(20, (map.get(id) || 0) + quantity));
    }
    return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  } catch {
    return [];
  }
}

function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function findProduct(productId) {
  return state.products.find((product) => product.id === Number(productId));
}

function getCartLines() {
  return state.cart
    .map((item) => {
      const product = findProduct(item.productId);
      return product && product.inStock ? { product, quantity: item.quantity } : null;
    })
    .filter(Boolean);
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartIndicators() {
  const count = cartCount();
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(count);
    el.hidden = count === 0;
  });
  document.querySelectorAll("[data-cart-button]").forEach((el) => {
    el.setAttribute("aria-label", `Open cart, ${count} ${count === 1 ? "item" : "items"}`);
  });
}

function sanitizeCart() {
  let changed = false;
  const next = [];
  for (const item of state.cart) {
    const product = findProduct(item.productId);
    if (!product || !product.inStock) {
      changed = true;
      continue;
    }
    const quantity = Math.min(item.quantity, product.stock, 20);
    if (quantity !== item.quantity) changed = true;
    if (quantity > 0) next.push({ productId: item.productId, quantity });
  }
  state.cart = next;
  if (changed) persistCart();
}

function addToCart(productId, quantity = 1, { silent = false } = {}) {
  const product = findProduct(productId);
  const amount = Math.max(1, Math.min(20, Number(quantity) || 1));
  if (!product || !product.inStock) {
    if (!silent) toast("That vegetable is not available right now.", { type: "error" });
    return false;
  }
  const existing = state.cart.find((item) => item.productId === product.id);
  const max = Math.min(product.stock, 20);
  const current = existing?.quantity || 0;
  if (current >= max) {
    if (!silent) toast(`Only ${max} of ${product.name} can go in one basket.`, { type: "info" });
    return false;
  }
  const next = Math.min(max, current + amount);
  if (existing) {
    existing.quantity = next;
  } else {
    state.cart.push({ productId: product.id, quantity: next });
  }
  persistCart();
  updateCartIndicators();
  refreshCartDialog();
  if (!silent) {
    toast(`${product.name} added to your basket.`, {
      actionLabel: "View basket",
      onAction: openCartDrawer
    });
  }
  return true;
}

function setCartQuantity(productId, quantity) {
  const product = findProduct(productId);
  if (!product) return;
  const item = state.cart.find((entry) => entry.productId === product.id);
  if (!item) return;
  const next = Math.max(0, Math.min(product.stock, 20, Number(quantity) || 0));
  if (next <= 0) {
    state.cart = state.cart.filter((entry) => entry.productId !== product.id);
  } else {
    item.quantity = next;
  }
  persistCart();
  updateCartIndicators();
  refreshCartDialog();
  if (currentPath() === "/checkout") {
    closeDialog();
    state.cartDialog = null;
    void renderRoute({ preserveScroll: true });
  }
}

function removeFromCart(productId) {
  const product = findProduct(productId);
  state.cart = state.cart.filter((item) => item.productId !== Number(productId));
  persistCart();
  updateCartIndicators();
  refreshCartDialog();
  if (product) toast(`${product.name} removed.`, { type: "info" });
  if (currentPath() === "/checkout") {
    closeDialog();
    state.cartDialog = null;
    void renderRoute({ preserveScroll: true });
  }
}

function clearCart() {
  state.cart = [];
  persistCart();
  updateCartIndicators();
  refreshCartDialog();
}

function getSavedAddress() {
  if (!state.savedAddress || !state.user) return null;
  if (state.savedAddress.userId && state.savedAddress.userId !== state.user.id) return null;
  return state.savedAddress;
}

function renderChrome() {
  if (!state.config) return;
  const path = currentPath();
  const header = document.getElementById("site-header");
  const mobileNav = document.getElementById("mobile-nav");
  const footer = document.getElementById("site-footer");
  if (header) {
    header.innerHTML = views.renderHeader({
      config: state.config,
      user: state.user,
      cartCount: cartCount(),
      path
    });
  }
  if (mobileNav) {
    mobileNav.innerHTML = views.renderMobileNav({
      user: state.user,
      cartCount: cartCount(),
      path
    });
  }
  if (footer) footer.innerHTML = views.renderFooter({ config: state.config });
  document.body.dataset.route = path === "/" ? "home" : path.split("/")[1] || "home";
  updateCartIndicators();
}

function openCartDrawer() {
  closeDialog();
  const dialog = openDialog(
    views.renderCartDrawer({
      cartLines: getCartLines(),
      products: state.products,
      cartCount: cartCount(),
      config: state.config
    }),
    {
      className: "drawer-modal",
      onClose: () => {
        state.cartDialog = null;
      }
    }
  );
  state.cartDialog = dialog;
}

function refreshCartDialog() {
  if (!state.cartDialog?.open || currentDialog() !== state.cartDialog) return;
  state.cartDialog.innerHTML = views.renderCartDrawer({
    cartLines: getCartLines(),
    products: state.products,
    cartCount: cartCount(),
    config: state.config
  });
}

function openAuthModal(tab = "login") {
  if (state.user) {
    toast("You're already signed in.", { type: "info" });
    return;
  }
  openDialog(views.renderAuthModal(tab), { className: "auth-dialog" });
}

function openProductModal(slug) {
  const product = state.products.find((entry) => entry.slug === slug);
  if (!product) {
    toast("That vegetable is not available right now.", { type: "error" });
    return;
  }
  openDialog(views.renderProductModal(product, state.config), { className: "product-dialog" });
}

function openPolicyModal() {
  openDialog(views.renderPolicyModal(), { className: "modal-medium" });
}

function openSupportModal(title, message, actionLabel = "Call the store") {
  const phone = state.config?.store?.phone || "";
  openDialog(
    `<div class="support-dialog">
      <button type="button" class="icon-button support-close" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
      <div class="support-icon">${icon("phone", 26)}</div>
      <span class="eyebrow"><span class="eyebrow-dot"></span> Here to help</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <a class="btn btn-primary btn-block" href="tel:${escapeHtml(String(phone).replace(/[^\d+]/g, ""))}">${escapeHtml(actionLabel)} · ${escapeHtml(phone)}</a>
    </div>`,
    { className: "modal-small" }
  );
}

function updateProductModalQuantity(delta) {
  const form = document.querySelector('[data-form="product-add"]');
  const input = document.getElementById("product-quantity");
  if (!form || !input) return;
  const product = findProduct(form.dataset.productId);
  if (!product) return;
  const max = Math.min(product.stock, 20);
  const next = Math.max(1, Math.min(max, Number(input.value || 1) + delta));
  input.value = String(next);
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = `Add to basket · ${formatMoney(product.pricePaise * next)}`;
}

function saveCheckoutDraft() {
  const form = document.getElementById("checkout-form");
  if (!form) return;
  const data = new FormData(form);
  state.checkoutDraft = {
    label: String(data.get("addressLabel") || "Home"),
    recipientName: String(data.get("recipientName") || ""),
    contactPhone: String(data.get("contactPhone") || ""),
    line: String(data.get("line") || ""),
    notes: String(data.get("notes") || ""),
    lat: state.checkoutLocation?.lat ?? null,
    lng: state.checkoutLocation?.lng ?? null
  };
}

function isValidMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits) || /^91[6-9]\d{9}$/.test(digits);
}

function pinIcon(kind) {
  return window.L.divIcon({
    className: "leaflet-pin-shell",
    html: `<span class="leaflet-pin leaflet-pin-${kind}"><span></span></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36]
  });
}

function createLeafletMap(element, options = {}) {
  if (!window.L || !element) return null;
  const map = window.L.map(element, {
    scrollWheelZoom: false,
    zoomControl: true,
    ...options
  });
  window.L.tileLayer(state.config.map.tileUrl, {
    attribution: state.config.map.attribution,
    maxZoom: 19
  }).addTo(map);
  return map;
}

function addRouteCleanup(fn) {
  state.cleanups.push(fn);
}

function cleanupRoute() {
  for (const cleanup of state.cleanups.splice(0)) {
    try {
      cleanup();
    } catch {
      void 0;
    }
  }
}

async function initCheckoutPage() {
  const form = document.getElementById("checkout-form");
  const mapElement = document.getElementById("checkout-map");
  if (!form || !mapElement || !state.config) return;

  const addressSource = state.checkoutDraft || getSavedAddress();
  const lineInput = form.querySelector('[name="line"]');
  const statusElement = document.getElementById("location-status");
  const useButton = document.getElementById("use-my-location");
  const findButton = document.getElementById("find-address");
  const submitButtons = [
    ...document.querySelectorAll("#place-order-button, #checkout-mobile-submit")
  ];
  const paymentsAvailable = state.config.payments.available;
  let selected = null;
  let marker = null;
  let map = null;
  let serviceable = false;
  let geocodeSequence = 0;
  let placing = false;

  const coords = {
    lat: Number(addressSource?.lat),
    lng: Number(addressSource?.lng)
  };
  const hasSavedPin =
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    Math.abs(coords.lat) <= 90 &&
    Math.abs(coords.lng) <= 180;

  if (hasSavedPin) {
    selected = { lat: coords.lat, lng: coords.lng };
    state.checkoutLocation = selected;
  }

  function updateServiceability() {
    if (!statusElement) return;
    if (!selected) {
      statusElement.className = "location-status is-neutral";
      statusElement.innerHTML = `${icon("map-pin", 18)}<span></span>`;
      statusElement.querySelector("span").textContent =
        "Click the map to drop your delivery pin, or use your current location.";
      serviceable = false;
    } else {
      const distance = haversineKm(
        state.config.store.lat,
        state.config.store.lng,
        selected.lat,
        selected.lng
      );
      serviceable = distance <= state.config.delivery.radiusKm;
      if (serviceable) {
        statusElement.className = "location-status is-success";
        statusElement.innerHTML = `${icon("check-circle", 18)}<span></span>`;
        statusElement.querySelector("span").textContent =
          `Within the delivery area · ${formatDistance(distance)} from the store.`;
      } else {
        statusElement.className = "location-status is-error";
        statusElement.innerHTML = `${icon("alert-circle", 18)}<span></span>`;
        statusElement.querySelector("span").textContent =
          `This pin is ${formatDistance(distance)} away. We deliver within ${state.config.delivery.radiusKm} km of the store — move the pin closer.`;
      }
    }

    if (findButton) findButton.disabled = !selected;
    const disabled = !selected || !serviceable || !paymentsAvailable;
    for (const button of submitButtons) button.disabled = disabled;
  }

  function saveDraft() {
    saveCheckoutDraft();
  }

  function setSelected(lat, lng, { fly = false, geocode = false, overwrite = false } = {}) {
    selected = { lat, lng };
    state.checkoutLocation = selected;
    if (map) {
      if (!marker) {
        marker = window.L.marker([lat, lng], { icon: pinIcon("home"), draggable: true }).addTo(map);
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          setSelected(point.lat, point.lng, { geocode: true });
        });
      } else {
        marker.setLatLng([lat, lng]);
      }
      if (fly) map.flyTo([lat, lng], 16, { duration: 0.8 });
    }
    saveDraft();
    updateServiceability();
    if (geocode) void findAddress(overwrite);
  }

  async function findAddress(overwrite = true) {
    if (!selected) return;
    const sequence = ++geocodeSequence;
    const lineAtStart = lineInput.value.trim();
    const restore = findButton ? busy(findButton, "Finding…") : () => {};
    try {
      const result = await api.get(
        `/delivery/reverse?lat=${selected.lat.toFixed(6)}&lng=${selected.lng.toFixed(6)}`
      );
      if (sequence !== geocodeSequence || !selected) return;
      const lineUnchanged = lineInput.value.trim() === lineAtStart;
      if (overwrite ? lineUnchanged : !lineInput.value.trim()) {
        lineInput.value = result.address;
        saveDraft();
      }
    } catch (error) {
      if (sequence === geocodeSequence) {
        toast(error.message, { type: "info" });
      }
    } finally {
      restore();
      if (findButton) findButton.disabled = !selected;
      updateServiceability();
    }
  }

  if (window.L) {
    const center = selected
      ? [selected.lat, selected.lng]
      : [state.config.store.lat, state.config.store.lng];
    map = createLeafletMap(mapElement, { zoom: selected ? 16 : 13 });
    if (map) {
      map.setView(center, selected ? 16 : 13);
      window.L.marker(
        [state.config.store.lat, state.config.store.lng],
        { icon: pinIcon("store") }
      )
        .addTo(map)
        .bindTooltip(state.config.store.name, { direction: "top", offset: [0, -30] });

      if (selected) {
        marker = window.L.marker([selected.lat, selected.lng], {
          icon: pinIcon("home"),
          draggable: true
        }).addTo(map);
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          setSelected(point.lat, point.lng, { geocode: true });
        });
      }

      map.on("click", (event) => {
        setSelected(event.latlng.lat, event.latlng.lng, {
          geocode: true,
          overwrite: !lineInput.value.trim()
        });
      });

      setTimeout(() => map.invalidateSize(), 80);
      addRouteCleanup(() => {
        map.remove();
        map = null;
      });
    }
  } else {
    statusElement.className = "location-status is-error";
    statusElement.innerHTML = `${icon("alert-circle", 18)}<span>The map could not load. Please type your address and call the store to confirm delivery.</span>`;
  }

  updateServiceability();

  if (hasSavedPin && lineInput.value.trim()) {
    updateServiceability();
  }

  useButton?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      toast("Your browser does not support location access. Drop a pin on the map instead.", {
        type: "info"
      });
      return;
    }
    const restore = busy(useButton, "Locating…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        restore();
        const { latitude, longitude } = position.coords;
        if (map) map.flyTo([latitude, longitude], 16, { duration: 0.9 });
        setSelected(latitude, longitude, { geocode: true, overwrite: true });
      },
      (error) => {
        restore();
        const message =
          error.code === 1
            ? "Location access was blocked. Allow location for this site, or click the map to set your pin."
            : "We couldn't get your location right now. Click the map to set your delivery pin.";
        toast(message, { type: "info" });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });

  findButton?.addEventListener("click", () => {
    void findAddress(true);
  });

  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (placing) return;
    clearFormError(form);

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = new FormData(form);
    if (!isValidMobile(data.get("contactPhone"))) {
      showFormError(form, "Enter a valid 10-digit Indian mobile number.");
      form.elements.contactPhone?.focus();
      return;
    }
    if (!selected) {
      showFormError(form, "Drop your delivery pin on the map so we know where to deliver.");
      mapElement.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!serviceable) {
      showFormError(form, "That delivery location is outside our delivery area. Please move the pin closer.");
      mapElement.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!paymentsAvailable) {
      showFormError(form, "Online UPI payments are temporarily unavailable. Please call the store to order.");
      return;
    }
    if (!getCartLines().length) {
      showFormError(form, "Your basket is empty.");
      return;
    }

    placing = true;
    const submitter = event.submitter || document.getElementById("place-order-button");
    const restore = submitter ? busy(submitter, "Placing order…") : () => {};
    for (const button of submitButtons) button.disabled = true;

    try {
      const payload = {
        items: state.cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        })),
        address: {
          label: String(data.get("addressLabel") || "Home"),
          recipientName: String(data.get("recipientName") || "").trim(),
          contactPhone: String(data.get("contactPhone") || "").trim(),
          line: String(data.get("line") || "").trim(),
          notes: String(data.get("notes") || "").trim(),
          lat: selected.lat,
          lng: selected.lng
        }
      };

      const result = await api.post("/orders", payload);
      const order = result.order;

      state.savedAddress = {
        userId: state.user.id,
        label: payload.address.label,
        recipientName: payload.address.recipientName,
        contactPhone: payload.address.contactPhone,
        line: payload.address.line,
        notes: payload.address.notes,
        lat: payload.address.lat,
        lng: payload.address.lng
      };
      localStorage.setItem(ADDRESS_KEY, JSON.stringify(state.savedAddress));
      state.checkoutDraft = null;
      state.checkoutLocation = null;
      clearCart();

      let paymentResult;
      try {
        paymentResult = await payFlow(order);
      } catch (paymentError) {
        await navigate(`/orders/${encodeURIComponent(order.code)}`, { replace: true });
        toast(
          paymentError.code === "PAYMENT_DISMISSED"
            ? "Order saved. You can finish the UPI payment from My orders."
            : paymentError.message,
          { type: paymentError.code === "PAYMENT_DISMISSED" ? "info" : "error", duration: 7000 }
        );
        return;
      }

      if (paymentResult.status === "paid") {
        toast("Payment received. Your order is confirmed.", { type: "success" });
        await navigate(`/orders/${encodeURIComponent(order.code)}?success=1`, { replace: true });
      } else {
        toast("Order saved. You can pay for it from My orders.", { type: "info" });
        await navigate(`/orders/${encodeURIComponent(order.code)}`, { replace: true });
      }
    } catch (error) {
      handleError(error, form);
      restore();
      for (const button of submitButtons) button.disabled = false;
    } finally {
      placing = false;
    }
  });
}

function initOrderMap(order) {
  const element = document.getElementById("order-map");
  if (!element || !window.L) return;
  const map = createLeafletMap(element, { scrollWheelZoom: false });
  if (!map) return;
  const store = [Number(element.dataset.storeLat), Number(element.dataset.storeLng)];
  const destination = [Number(element.dataset.orderLat), Number(element.dataset.orderLng)];
  window.L.marker(store, { icon: pinIcon("store") })
    .addTo(map)
    .bindTooltip("Our store", { direction: "top", offset: [0, -30] });
  window.L.marker(destination, { icon: pinIcon("home") })
    .addTo(map)
    .bindPopup("Delivery address")
    .openPopup();
  window.L.polyline([store, destination], {
    color: "#3d7a47",
    weight: 2.5,
    opacity: 0.8,
    dashArray: "6 8"
  }).addTo(map);
  map.fitBounds([store, destination], { padding: [45, 45], maxZoom: 15 });
  setTimeout(() => map.invalidateSize(), 80);
  addRouteCleanup(() => map.remove());
}

function initShopFilters(initialCategory, initialSearch) {
  const grid = document.getElementById("shop-grid");
  const searchInput = document.getElementById("shop-search");
  const countElement = document.getElementById("shop-count");
  const emptyElement = document.getElementById("shop-empty");
  const sortSelect = document.getElementById("shop-sort");
  const chips = [...document.querySelectorAll("[data-shop-category]")];
  if (!grid) return;
  let activeCategory = initialCategory || "";
  let search = initialSearch || "";
  let sort = "name";

  const sortCards = () => {
    const cards = [...grid.querySelectorAll("[data-product-card]")];
    cards.sort((a, b) => {
      if (sort === "price-low") return Number(a.dataset.price) - Number(b.dataset.price);
      if (sort === "price-high") return Number(b.dataset.price) - Number(a.dataset.price);
      if (sort === "name") return a.dataset.name.localeCompare(b.dataset.name);
      const featured = Number(b.dataset.featured) - Number(a.dataset.featured);
      return featured || a.dataset.name.localeCompare(b.dataset.name);
    });
    for (const card of cards) grid.append(card);
  };

  const apply = () => {
    const term = search.trim().toLowerCase();
    const cards = [...grid.querySelectorAll("[data-product-card]")];
    let visible = 0;
    for (const card of cards) {
      const visibleCard =
        (!activeCategory || card.dataset.category === activeCategory) &&
        (!term || card.dataset.search.includes(term));
      card.hidden = !visibleCard;
      if (visibleCard) visible += 1;
    }
    if (countElement) countElement.textContent = `${visible} fresh ${visible === 1 ? "pick" : "picks"}`;
    if (emptyElement) emptyElement.hidden = visible > 0;
    chips.forEach((chip) => {
      chip.classList.toggle("is-active", (chip.dataset.shopCategory || "") === activeCategory);
    });
    const url = new URL(window.location.href);
    if (activeCategory) url.searchParams.set("category", activeCategory);
    else url.searchParams.delete("category");
    if (term) url.searchParams.set("q", search.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  const reset = () => {
    activeCategory = "";
    search = "";
    if (searchInput) searchInput.value = "";
    apply();
  };
  state.shopReset = reset;
  sortCards();
  apply();

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      activeCategory = chip.dataset.shopCategory || "";
      apply();
    });
  });

  searchInput?.addEventListener("input", () => {
    search = searchInput.value;
    apply();
  });

  sortSelect?.addEventListener("change", () => {
    sort = sortSelect.value;
    sortCards();
    apply();
  });
}

function initOrderFilters() {
  const tabs = [...document.querySelectorAll("[data-order-filter]")];
  const cards = [...document.querySelectorAll("[data-order-card]")];
  const empty = document.getElementById("orders-filter-empty");
  if (!tabs.length) return;

  function apply(filter) {
    let visible = 0;
    for (const card of cards) {
      let show = true;
      if (filter === "active") show = card.dataset.active === "1";
      if (filter === "delivered") show = card.dataset.orderStatus === "delivered";
      if (filter === "cancelled") show = card.dataset.orderStatus === "cancelled";
      card.hidden = !show;
      if (show) visible += 1;
    }
    if (empty) empty.hidden = visible > 0;
    for (const tab of tabs) {
      const active = tab.dataset.orderFilter === filter;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => apply(tab.dataset.orderFilter));
  }
}

function initAdminFilters() {
  const select = document.getElementById("admin-order-filter");
  const rows = [...document.querySelectorAll("[data-admin-order-row]")];
  if (!select) return;
  select.addEventListener("change", () => {
    for (const row of rows) {
      row.hidden = Boolean(select.value) && row.dataset.status !== select.value;
    }
  });
}

function initOrderPolling(order) {
  if (!["placed", "confirmed", "packed", "out_for_delivery"].includes(order.status)) return;
  let lastStatus = order.status;
  let lastPayment = order.paymentStatus;
  let cancelled = false;
  const timer = setInterval(async () => {
    if (document.hidden || cancelled) return;
    try {
      const result = await api.get(`/orders/${encodeURIComponent(order.code)}`);
      if (cancelled) return;
      if (result.order.status !== lastStatus || result.order.paymentStatus !== lastPayment) {
        lastStatus = result.order.status;
        lastPayment = result.order.paymentStatus;
        toast(`Order ${order.code} updated: ${statusMeta(result.order.status).label}`, { type: "info" });
        await renderRoute({ preserveScroll: true });
      }
    } catch {
      void 0;
    }
  }, 25000);
  addRouteCleanup(() => {
    cancelled = true;
    clearInterval(timer);
  });
}

async function payFlow(order) {
  if (state.config.payments.demoEnabled) {
    const confirmed = await confirmDialog({
      title: "Test UPI checkout",
      message:
        "Demo UPI is active on this store. No real money will be charged. Confirm to simulate a successful UPI payment.",
      confirmLabel: `Pay ${formatMoney(order.totalPaise)} (test)`,
      cancelLabel: "Pay later",
      details: `<div class="confirm-payment-detail"><span>Order ${escapeHtml(order.code)}</span><strong>${formatMoney(order.totalPaise)}</strong></div>`
    });
    if (!confirmed) return { status: "cancelled" };
    const paidOrder = await payWithDemo(order.code);
    return { status: "paid", order: paidOrder };
  }
  const paidOrder = await payWithRazorpay(order.code);
  return { status: "paid", order: paidOrder };
}

async function handlePayOrder(code, trigger) {
  const restore = busy(trigger, "Opening UPI…");
  let restored = false;
  const done = () => {
    if (!restored) {
      restored = true;
      restore();
    }
  };

  try {
    const result = await api.get(`/orders/${encodeURIComponent(code)}`);
    const order = result.order;
    if (!order.canPay) {
      throw new ApiError("This order can no longer be paid online.", {
        code: "CANNOT_PAY",
        status: 409
      });
    }
    done();
    let paymentResult;
    try {
      paymentResult = await payFlow(order);
    } catch (error) {
      if (error.code === "PAYMENT_DISMISSED") {
        toast("Payment not completed. Your order is saved in My orders.", { type: "info" });
      } else {
        toast(error.message, { type: "error" });
      }
      return;
    }

    if (paymentResult.status === "paid") {
      toast("Payment received. Your order is confirmed.");
      const current = currentPath();
      if (current === `/orders/${order.code}`) {
        window.history.replaceState(null, "", `/orders/${encodeURIComponent(order.code)}?success=1`);
        await renderRoute({ preserveScroll: true });
      } else {
        await navigate(`/orders/${encodeURIComponent(order.code)}?success=1`);
      }
    } else {
      toast("Order saved. You can pay any time before it expires.", { type: "info" });
    }
  } catch (error) {
    done();
    handleError(error);
  }
}

async function handleCancelOrder(code, trigger) {
  const confirmed = await confirmDialog({
    title: "Cancel this order?",
    message:
      "If you haven't paid, the order will be cancelled and the reserved vegetables will go back into stock. Paid orders need to be cancelled by the store.",
    confirmLabel: "Cancel order",
    cancelLabel: "Keep order",
    tone: "danger",
    details: `<div class="confirm-order-code">${escapeHtml(code)}</div>`
  });
  if (!confirmed) return;

  const restore = busy(trigger, "Cancelling…");
  try {
    await api.post(`/orders/${encodeURIComponent(code)}/cancel`, {});
    toast("Order cancelled.", { type: "info" });
    await renderRoute({ preserveScroll: true });
  } catch (error) {
    restore();
    handleError(error);
  }
}

async function handleReorder(code) {
  try {
    const result = await api.get(`/orders/${encodeURIComponent(code)}`);
    let added = 0;
    let unavailable = 0;
    for (const item of result.order.items) {
      const product =
        findProduct(item.productId) ||
        state.products.find((entry) => entry.slug === item.slug);
      if (!product || !product.inStock) {
        unavailable += 1;
        continue;
      }
      if (addToCart(product.id, item.quantity, { silent: true })) added += 1;
      else unavailable += 1;
    }
    updateCartIndicators();
    if (added) {
      toast(
        unavailable
          ? `${added} items added. ${unavailable} item${unavailable === 1 ? " is" : "s are"} no longer available.`
          : "Items added back to your basket.",
        { type: "success" }
      );
      openCartDrawer();
    } else {
      toast("None of those items are available right now.", { type: "error" });
    }
  } catch (error) {
    handleError(error);
  }
}

async function handleLogout(trigger) {
  const restore = busy(trigger, "Signing out…");
  try {
    await api.post("/auth/logout", {});
    state.user = null;
    state.savedAddress = null;
    state.checkoutDraft = null;
    state.checkoutLocation = null;
    localStorage.removeItem(ADDRESS_KEY);
    renderChrome();
    closeDialog();
    await navigate("/", { replace: true });
    toast("You're signed out. See you soon.", { type: "info" });
  } catch (error) {
    restore();
    handleError(error);
  }
}

function handleError(error, form = null) {
  if (error instanceof ApiError && error.status === 401) {
    state.user = null;
    state.checkoutDraft = null;
    closeDialog();
    renderChrome();
    toast("Your session ended. Please sign in again.", { type: "info" });
    void renderRoute({ preserveScroll: true });
    return;
  }
  if (form) showFormError(form, error.message);
  toast(error.message || "Something went wrong. Please try again.", {
    type: error?.status === 409 || error?.status === 400 ? "info" : "error"
  });
}

async function handleFormSubmit(form) {
  const type = form.dataset.form;
  clearFormError(form);
  const submit = form.querySelector('button[type="submit"]');
  let restore = () => {};

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (type === "login" || type === "register") {
    const data = Object.fromEntries(new FormData(form));
    if (type === "register" && data.password !== data.confirmPassword) {
      showFormError(form, "The two passwords do not match.");
      return;
    }
    restore = submit ? busy(submit, type === "login" ? "Signing in…" : "Creating account…") : restore;
    try {
      const result =
        type === "login"
          ? await api.post("/auth/login", {
              identifier: data.identifier,
              password: data.password
            })
          : await api.post("/auth/register", {
              name: data.name,
              username: data.username,
              email: data.email,
              phone: data.phone,
              password: data.password
            });
      state.user = result.user;
      closeDialog();
      renderChrome();
      await renderRoute();
      toast(
        type === "login"
          ? `Welcome back, ${String(result.user.name).split(/\s+/)[0]}.`
          : "Your account is ready. Let's go shopping."
      );
    } catch (error) {
      restore();
      handleError(error, form);
    }
    return;
  }

  if (type === "profile") {
    restore = submit ? busy(submit, "Saving…") : restore;
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = await api.patch("/auth/profile", data);
      state.user = result.user;
      renderChrome();
      await renderRoute({ preserveScroll: true });
      toast("Your details are up to date.");
    } catch (error) {
      restore();
      handleError(error, form);
    }
    return;
  }

  if (type === "password") {
    restore = submit ? busy(submit, "Updating…") : restore;
    try {
      const data = Object.fromEntries(new FormData(form));
      await api.patch("/auth/password", data);
      form.reset();
      restore();
      toast("Password updated. Other devices have been signed out.");
    } catch (error) {
      restore();
      handleError(error, form);
    }
    return;
  }

  if (type === "product-add") {
    const productId = Number(form.dataset.productId);
    const quantity = Number(new FormData(form).get("quantity") || 1);
    const added = addToCart(productId, quantity);
    if (added) {
      closeDialog();
    }
    return;
  }

  if (type === "admin-order-status") {
    const data = Object.fromEntries(new FormData(form));
    const code = form.dataset.code;
    if (data.status === "cancelled") {
      const confirmed = await confirmDialog({
        title: "Cancel this order?",
        message: "This will release any reserved stock. If the order is paid, a refund will be marked as pending.",
        confirmLabel: "Cancel order",
        cancelLabel: "Keep it",
        tone: "danger",
        details: `<div class="confirm-order-code">${escapeHtml(code)}</div>`
      });
      if (!confirmed) return;
    }
    restore = submit ? busy(submit, "Updating…") : restore;
    try {
      await api.patch(`/admin/orders/${encodeURIComponent(code)}/status`, {
        status: data.status,
        note: data.note || ""
      });
      closeDialog();
      toast("Order updated.");
      await renderRoute({ preserveScroll: true });
    } catch (error) {
      restore();
      handleError(error, form);
    }
    return;
  }

  if (type === "admin-product") {
    const id = Number(form.dataset.productId);
    const row = form.closest("tr");
    const name = String(row?.querySelector('[name="name"]')?.value || "").trim();
    const price = Number(row?.querySelector('[name="priceRupees"]')?.value);
    const stock = Number(row?.querySelector('[name="stock"]')?.value);
    if (name.length < 2) {
      toast("Enter a vegetable name with at least 2 characters.", { type: "error" });
      return;
    }
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
      toast("Enter a valid price and stock quantity.", { type: "error" });
      return;
    }
    restore = submit ? busy(submit, "Saving…") : restore;
    try {
      await api.patch(`/admin/products/${id}`, {
        name,
        pricePaise: Math.round(price * 100),
        stock,
        isActive: Boolean(row.querySelector('[name="isActive"]')?.checked),
        isFeatured: Boolean(row.querySelector('[name="isFeatured"]')?.checked)
      });
      toast("Inventory updated.");
      await renderRoute({ preserveScroll: true });
    } catch (error) {
      restore();
      handleError(error, form);
    }
    return;
  }

  if (type === "admin-price") {
    const id = Number(form.dataset.productId);
    const price = Number(new FormData(form).get("priceRupees"));
    if (!Number.isFinite(price) || price <= 0) {
      showFormError(form, "Enter a valid price.");
      return;
    }
    restore = submit ? busy(submit, "Saving…") : restore;
    try {
      const result = await api.patch(`/admin/products/${id}`, {
        pricePaise: Math.round(price * 100)
      });
      state.products = state.products.map((product) =>
        product.id === result.product.id ? result.product : product
      );
      closeDialog();
      toast("Today's rate updated on the storefront.");
      await renderRoute({ preserveScroll: true });
    } catch (error) {
      restore();
      handleError(error, form);
    }
    return;
  }

  if (type === "admin-add-product") {
    const data = new FormData(form);
    const price = Number(data.get("priceRupees"));
    const stock = Number(data.get("stock"));
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
      showFormError(form, "Enter a valid price and stock quantity.");
      return;
    }
    restore = submit ? busy(submit, "Adding…") : restore;
    try {
      await api.post("/admin/products", {
        name: String(data.get("name") || "").trim(),
        category: String(data.get("category") || "").trim(),
        description: String(data.get("description") || "").trim(),
        pricePaise: Math.round(price * 100),
        unit: String(data.get("unit") || "").trim(),
        imageUrl: String(data.get("imageUrl") || "").trim(),
        stock,
        isActive: form.elements.isActive.checked,
        isFeatured: form.elements.isFeatured.checked
      });
      closeDialog();
      state.adminTab = "inventory";
      sessionStorage.setItem(ADMIN_TAB_KEY, state.adminTab);
      toast("Vegetable added to the store.");
      await renderRoute({ preserveScroll: true });
    } catch (error) {
      restore();
      handleError(error, form);
    }
  }
}

async function openAdminOrderModal(code) {
  try {
    let order = state.adminData?.orders?.find((entry) => entry.code === code);
    if (!order) {
      const result = await api.get(`/admin/orders/${encodeURIComponent(code)}`);
      order = result.order;
    }
    openDialog(views.renderAdminOrderModal(order), { className: "modal-admin" });
  } catch (error) {
    handleError(error);
  }
}

async function handleAdminRefund(code, trigger) {
  const confirmed = await confirmDialog({
    title: "Process this refund?",
    message:
      "The full order amount will be refunded through Razorpay (or simulated in demo mode). This cannot be undone from the store.",
    confirmLabel: "Process refund",
    cancelLabel: "Not yet",
    tone: "danger",
    details: `<div class="confirm-order-code">${escapeHtml(code)}</div>`
  });
  if (!confirmed) return;
  const restore = busy(trigger, "Refunding…");
  try {
    await api.post(`/admin/orders/${encodeURIComponent(code)}/refund`, {});
    closeDialog();
    toast("Refund processed.");
    await renderRoute({ preserveScroll: true });
  } catch (error) {
    restore();
    handleError(error);
  }
}

function setAdminTab(tab) {
  state.adminTab = tab === "inventory" ? "inventory" : "orders";
  sessionStorage.setItem(ADMIN_TAB_KEY, state.adminTab);
  document.querySelectorAll(".admin-tab").forEach((button) => {
    const active = button.dataset.tab === state.adminTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.adminPanel === state.adminTab);
  });
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    const choice = await state.installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      toast("Organic Vegetables is being added to your home screen.");
    }
    state.installPrompt = null;
    return;
  }
  openDialog(
    `<div class="support-dialog">
      <button type="button" class="icon-button support-close" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
      <div class="support-icon">${icon("smartphone", 26)}</div>
      <span class="eyebrow"><span class="eyebrow-dot"></span> Install the app</span>
      <h2>Keep the market in your pocket.</h2>
      <p>In your browser menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. The app works best over a secure HTTPS connection.</p>
      <button type="button" class="btn btn-primary btn-block" data-action="close-modal">Got it</button>
    </div>`,
    { className: "modal-small" }
  );
}

async function handleAction(action, element) {
  switch (action) {
    case "open-auth":
      openAuthModal(element.dataset.tab || "login");
      break;
    case "auth-tab":
      openAuthModal(element.dataset.tab || "login");
      break;
    case "close-modal":
      closeDialog();
      break;
    case "open-cart":
      openCartDrawer();
      break;
    case "go-checkout":
      closeDialog();
      await navigate("/checkout");
      break;
    case "view-product":
      openProductModal(element.dataset.slug);
      break;
    case "add-to-cart":
      addToCart(Number(element.dataset.id), 1);
      break;
    case "cart-increase":
      {
        const id = Number(element.dataset.id);
        const item = state.cart.find((entry) => entry.productId === id);
        if (item) setCartQuantity(id, item.quantity + 1);
      }
      break;
    case "cart-decrease":
      {
        const id = Number(element.dataset.id);
        const item = state.cart.find((entry) => entry.productId === id);
        if (item) setCartQuantity(id, item.quantity - 1);
      }
      break;
    case "cart-remove":
      removeFromCart(Number(element.dataset.id));
      break;
    case "qty-change":
      updateProductModalQuantity(Number(element.dataset.delta));
      break;
    case "pay-order":
      await handlePayOrder(element.dataset.code, element);
      break;
    case "cancel-order":
      await handleCancelOrder(element.dataset.code, element);
      break;
    case "reorder":
      await handleReorder(element.dataset.code);
      break;
    case "print-order":
      window.print();
      break;
    case "logout":
      await handleLogout(element);
      break;
    case "install-app":
      await installApp();
      break;
    case "reload-page":
      window.location.reload();
      break;
    case "open-policy":
      openPolicyModal();
      break;
    case "forgot-password":
      openSupportModal(
        "Password help",
        "For your security, password resets are handled by the store team. Call us with your account email and we'll help you get back in."
      );
      break;
    case "clear-shop-filters":
      state.shopReset?.();
      break;
    case "admin-tab":
      setAdminTab(element.dataset.tab);
      break;
    case "admin-manage-order":
      await openAdminOrderModal(element.dataset.code);
      break;
    case "admin-add-product":
      openDialog(views.renderAddProductModal(), { className: "modal-medium" });
      break;
    case "admin-edit-price":
      {
        const product = findProduct(Number(element.dataset.id));
        if (product) openDialog(views.renderPriceEditor(product), { className: "modal-medium" });
      }
      break;
    case "import-product-image":
      break;
    case "pick-product-image":
      {
        const input = currentDialog()?.querySelector('input[name="imageUrl"]');
        if (input) {
          input.value = element.dataset.url || "";
          input.focus();
        }
      }
      break;
    case "admin-refund":
      await handleAdminRefund(element.dataset.code, element);
      break;
    default:
      break;
  }
}

function shouldInterceptLink(link, event) {
  if (!link || link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download") || link.dataset.noSpa !== undefined) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/vendor/") ||
    /\.(?:png|jpe?g|webp|svg|ico|css|js|json|webmanifest)$/i.test(url.pathname)
  ) {
    return false;
  }
  return true;
}

async function navigate(path, { replace = false, preserveScroll = false } = {}) {
  saveCheckoutDraft();
  closeDialog();
  const url = new URL(path, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.href = url.href;
    return;
  }
  const current = window.location.pathname + window.location.search;
  const next = url.pathname + url.search;
  if (next === current && url.hash) {
    window.history.pushState(null, "", url.hash ? `${next}${url.hash}` : next);
    document.querySelector(url.hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (replace) {
    window.history.replaceState(null, "", `${next}${url.hash}`);
  } else if (current !== next || window.location.hash) {
    window.history.pushState(null, "", `${next}${url.hash}`);
  }
  await renderRoute({ preserveScroll });
}

async function renderRoute({ preserveScroll = false } = {}) {
  cleanupRoute();
  closeDialog();
  const path = currentPath();
  const search = window.location.search;
  const savedScroll = window.scrollY;
  const main = mainEl();
  if (!main) return;
  state.route = { path, search };
  main.innerHTML = views.renderPageLoading();
  main.setAttribute("aria-busy", "true");
  renderChrome();
  let pageTitle = "Organic Vegetables | Fresh produce, delivered";

  try {
    if (path === "/") {
      main.innerHTML = views.renderHome({
        products: state.products,
        categories: state.categories,
        config: state.config,
        user: state.user
      });
    } else if (path === "/shop") {
      pageTitle = "Shop fresh vegetables | Organic Vegetables";
      const params = new URLSearchParams(search);
      main.innerHTML = views.renderShop({
        products: state.products,
        categories: state.categories,
        config: state.config,
        initialCategory: params.get("category") || "",
        initialSearch: params.get("q") || ""
      });
      initShopFilters(params.get("category") || "", params.get("q") || "");
    } else if (path === "/checkout") {
      pageTitle = "Secure checkout | Organic Vegetables";
      const address = state.checkoutDraft || getSavedAddress();
      main.innerHTML = views.renderCheckout({
        user: state.user,
        cartLines: getCartLines(),
        config: state.config,
        savedAddress: address,
        paymentsAvailable: state.config.payments.available
      });
      if (state.user) await initCheckoutPage();
    } else if (path === "/orders") {
      pageTitle = "My orders | Organic Vegetables";
      if (!state.user) {
        main.innerHTML = views.renderOrders({ user: null, orders: [] });
      } else {
        const result = await api.get("/orders");
        main.innerHTML = views.renderOrders({ user: state.user, orders: result.orders });
        initOrderFilters();
      }
    } else if (/^\/orders\/[^/]+$/.test(path)) {
      const code = decodeURIComponent(path.split("/")[2] || "");
      pageTitle = `Order ${code} | Organic Vegetables`;
      if (!state.user) {
        main.innerHTML = views.signInGate({
          title: "Sign in to track this order.",
          text: "Your order updates, payment status and delivery details are kept in your account."
        });
      } else {
        const result = await api.get(`/orders/${encodeURIComponent(code)}`);
        const params = new URLSearchParams(search);
        const success = params.get("success") === "1";
        main.innerHTML = views.renderOrderDetail({
          order: result.order,
          config: state.config,
          success
        });
        initOrderMap(result.order);
        initOrderPolling(result.order);
        if (success) {
          window.history.replaceState(null, "", `/orders/${encodeURIComponent(result.order.code)}`);
        }
      }
    } else if (path === "/account") {
      pageTitle = "My account | Organic Vegetables";
      main.innerHTML = views.renderAccount({ user: state.user, config: state.config });
    } else if (path === "/admin") {
      pageTitle = "Store dashboard | Organic Vegetables";
      if (!state.user) {
        main.innerHTML = views.renderAdmin({
          user: null,
          stats: emptyStats(),
          orders: [],
          products: [],
          activeTab: state.adminTab,
          config: state.config
        });
      } else if (state.user.role !== "admin") {
        main.innerHTML = views.renderAdmin({
          user: state.user,
          stats: emptyStats(),
          orders: [],
          products: [],
          activeTab: state.adminTab,
          config: state.config
        });
      } else {
        const [statsResult, ordersResult, productsResult] = await Promise.all([
          api.get("/admin/stats"),
          api.get("/admin/orders"),
          api.get("/admin/products")
        ]);
        state.adminData = {
          stats: statsResult.stats,
          orders: ordersResult.orders,
          products: productsResult.products
        };
        main.innerHTML = views.renderAdmin({
          user: state.user,
          stats: state.adminData.stats,
          orders: state.adminData.orders,
          products: state.adminData.products,
          activeTab: state.adminTab === "inventory" ? "inventory" : "orders",
          config: state.config
        });
        initAdminFilters();
      }
    } else {
      pageTitle = "Page not found | Organic Vegetables";
      main.innerHTML = views.renderNotFound();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && state.user) {
      state.user = null;
      state.checkoutDraft = null;
      renderChrome();
      await renderRoute({ preserveScroll });
      return;
    }
    main.innerHTML = views.renderAppError(error.message || "Something went wrong.");
    if (!(error instanceof ApiError)) console.error(error);
  } finally {
    document.title = pageTitle;
    main.removeAttribute("aria-busy");
  }

  if (preserveScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: "auto" }));
  } else if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      requestAnimationFrame(() =>
        target.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function emptyStats() {
  return {
    activeOrders: 0,
    todayOrders: 0,
    todayRevenuePaise: 0,
    awaitingPayment: 0,
    lowStock: 0,
    refundPending: 0,
    customers: 0
  };
}

function bindGlobalEvents() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a[href]");
    if (link && shouldInterceptLink(link, event)) {
      event.preventDefault();
      await navigate(link.getAttribute("href"));
      return;
    }

    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;
    event.preventDefault();
    try {
      await handleAction(actionElement.dataset.action, actionElement);
    } catch (error) {
      handleError(error);
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    try {
      await handleFormSubmit(form);
    } catch (error) {
      handleError(error, form);
    }
  });

  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (image instanceof HTMLImageElement && !image.dataset.fallbackApplied) {
        image.dataset.fallbackApplied = "1";
        image.src = "/images/placeholder.svg";
      }
    },
    true
  );

  window.addEventListener("popstate", () => {
    void renderRoute();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    toast("App installed. Find Organic Vegetables on your home screen.");
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!["https:", "http:"].includes(window.location.protocol)) return;
  if (
    window.location.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
  ) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    void 0;
  }
}

async function boot() {
  bindGlobalEvents();
  try {
    const [config, products, me] = await Promise.all([
      api.get("/config"),
      api.get("/products"),
      api.get("/auth/me")
    ]);
    state.config = config;
    state.products = products.products;
    state.categories = products.categories;
    state.user = me.user;
    state.savedAddress = getSavedAddress();
    sanitizeCart();
    state.isBooted = true;
    renderChrome();
    await renderRoute();
    void registerServiceWorker();
  } catch (error) {
    const main = mainEl();
    if (main) {
      main.innerHTML = views.renderAppError(
        error.message || "We couldn't load the store. Check your connection and try again."
      );
    }
  }
}

boot();
