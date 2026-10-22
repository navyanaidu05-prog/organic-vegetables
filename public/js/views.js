import {
  ORDER_STATUS_META,
  TRACK_STEPS,
  escapeHtml,
  firstLine,
  formatDate,
  formatDateTime,
  formatDistance,
  formatMoney,
  formatTime,
  icon,
  initials,
  itemUnit,
  paymentMeta,
  productDescription,
  statusMeta
} from "./utils.js";

const productImages = [
  "/images/tomatoes.jpg",
  "/images/spinach.jpg",
  "/images/carrots.jpg",
  "/images/broccoli.jpg",
  "/images/peppers.jpg",
  "/images/cucumbers.jpg",
  "/images/onions.jpg",
  "/images/lettuce.jpg",
  "/images/potatoes.jpg"
];

function telHref(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

function plural(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : pluralWord || `${singular}s`}`;
}

function navLink(href, label, active) {
  return `<a href="${href}" class="nav-link ${active ? "is-active" : ""}" ${href.startsWith("/") ? "data-link" : ""}>${label}</a>`;
}

export function renderHeader({ config, user, cartCount, path }) {
  const radius = config?.delivery?.radiusKm || 15;
  const freeOver = formatMoney(config?.delivery?.freeOverPaise || 0);
  const shopActive = path.startsWith("/shop");
  const ordersActive = path.startsWith("/orders");
  const adminActive = path.startsWith("/admin");
  const homeActive = path === "/";
  const accountActive = path.startsWith("/account");

  return `
    <div class="announcement">
      <div class="container announcement-inner">
        <span>${icon("truck", 15)} Free delivery over ${escapeHtml(freeOver)}</span>
        <span class="announcement-separator" aria-hidden="true"></span>
        <span>${icon("leaf", 15)} Harvested fresh, every morning</span>
        <span class="announcement-separator announcement-hide-small" aria-hidden="true"></span>
        <span class="announcement-hide-small">${icon("map-pin", 15)} Delivering within ${radius} km</span>
      </div>
    </div>
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="/" data-link aria-label="Organic Vegetables home">
          <img src="/assets/logo.svg" alt="" width="46" height="46">
          <span class="brand-copy">
            <span class="brand-name">Organic</span>
            <span class="brand-sub">Vegetables</span>
          </span>
        </a>

        <nav class="desktop-nav" aria-label="Primary navigation">
          ${navLink("/", "Home", homeActive)}
          ${navLink("/shop", "Shop", shopActive)}
          ${navLink("/#promise", "Our promise", false)}
          ${navLink("/orders", "My orders", ordersActive)}
          ${user?.role === "admin" ? navLink("/admin", "Admin", adminActive) : ""}
        </nav>

        <div class="header-actions">
          <button type="button" class="header-cart" data-action="open-cart" aria-label="Open cart" data-cart-button>
            ${icon("cart", 21)}
            <span class="cart-count" data-cart-count ${cartCount ? "" : "hidden"}>${cartCount || 0}</span>
          </button>
          ${
            user
              ? `<a href="/account" class="profile-pill ${accountActive ? "is-active" : ""}" data-link>
                  <span class="avatar">${escapeHtml(initials(user.name))}</span>
                  <span class="profile-pill-name">${escapeHtml(firstName(user.name))}</span>
                </a>`
              : `<button type="button" class="btn btn-outline btn-sm header-auth" data-action="open-auth">Sign in</button>`
          }
        </div>
      </div>
    </header>
  `;
}

export function renderMobileNav({ user, cartCount, path }) {
  const item = (href, iconName, label, active, action = "") => {
    if (action) {
      return `<button type="button" class="mobile-nav-item ${active ? "is-active" : ""}" data-action="${action}" aria-label="${label}">
        ${icon(iconName, 21)}
        <span>${label}</span>
        ${action === "open-cart" ? `<span class="mobile-nav-badge" data-cart-count ${cartCount ? "" : "hidden"}>${cartCount || 0}</span>` : ""}
      </button>`;
    }
    return `<a href="${href}" class="mobile-nav-item ${active ? "is-active" : ""}" ${href.startsWith("/") ? "data-link" : ""}>
      ${icon(iconName, 21)}
      <span>${label}</span>
    </a>`;
  };

  return `
    ${item("/", "home", "Home", path === "", "")}
    ${item("/shop", "sprout", "Shop", path.startsWith("/shop"), "")}
    ${item("", "cart", "Cart", false, "open-cart")}
    ${item("/orders", "package", "Orders", path.startsWith("/orders"), "")}
    ${item("/account", "user", user ? firstName(user.name) : "Account", path.startsWith("/account"), "")}
  `;
}

export function renderFooter({ config }) {
  const year = new Date().getFullYear();
  const demo = config?.payments?.demoEnabled;
  return `
    <div class="container footer-grid">
      <div class="footer-brand">
        <a class="brand brand-footer" href="/" data-link aria-label="Organic Vegetables home">
          <img src="/assets/logo.svg" alt="" width="46" height="46">
          <span class="brand-copy">
            <span class="brand-name">Organic</span>
            <span class="brand-sub">Vegetables</span>
          </span>
        </a>
        <p>Seasonal produce, chosen with care and delivered to your neighbourhood.</p>
        <div class="footer-payment">
          <span class="footer-label">Payments</span>
          <span class="payment-pill">${icon("lock", 13)} UPI</span>
          <span class="payment-pill">${demo ? "Test mode" : "Razorpay"}</span>
        </div>
      </div>

      <div class="footer-col">
        <h3>Explore</h3>
        <a href="/shop" data-link>Shop vegetables</a>
        <a href="/#promise" data-link>Our promise</a>
        <a href="/orders" data-link>Track an order</a>
        <a href="/account" data-link>My account</a>
        <button type="button" class="footer-action" data-action="open-policy">Delivery &amp; refunds</button>
      </div>

      <div class="footer-col">
        <h3>Visit &amp; call</h3>
        <p>${escapeHtml(config?.store?.address || "")}</p>
        <a href="tel:${escapeHtml(telHref(config?.store?.phone))}">${icon("phone", 15)} ${escapeHtml(config?.store?.phone || "")}</a>
        <a href="mailto:${escapeHtml(config?.store?.email || "")}">${icon("mail", 15)} ${escapeHtml(config?.store?.email || "")}</a>
      </div>

      <div class="footer-col">
        <h3>Delivery</h3>
        <p>Fresh deliveries within ${config?.delivery?.radiusKm || 15} km of our store.</p>
        <span class="footer-chip">${icon("clock", 15)} Same-day local delivery</span>
        <span class="footer-chip">${icon("shield-check", 15)} Secure UPI checkout</span>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>&copy; ${year} Organic Vegetables.</span>
      <span>Photography sourced from Unsplash.</span>
      ${demo ? `<span class="footer-demo">Demo UPI active — no real charges</span>` : ""}
    </div>
  `;
}

function sortByName(products) {
  return [...products].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );
}

function priceListRow(product, canEdit) {
  if (!canEdit) {
    return `
      <a class="price-list-row" href="/shop" data-link>
        <span class="price-list-name">
          <img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy">
          <span>
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(product.category)}</small>
          </span>
        </span>
        <span class="price-list-price">
          <strong>${formatMoney(product.pricePaise)}</strong>
          <small>${escapeHtml(product.unit)}</small>
        </span>
      </a>`;
  }
  return `
    <div class="price-list-row">
      <span class="price-list-name">
        <img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy">
        <span>
          <a class="price-list-name-link" href="/shop" data-link>${escapeHtml(product.name)}</a>
          <small>${escapeHtml(product.category)}</small>
        </span>
      </span>
      <span class="price-list-price">
        <strong>${formatMoney(product.pricePaise)}</strong>
        <small>${escapeHtml(product.unit)}</small>
        <button type="button" class="price-edit-button" data-action="admin-edit-price" data-id="${product.id}" aria-label="Change price for ${escapeHtml(product.name)}">${icon("edit-3", 14)} Price</button>
      </span>
    </div>`;
}

function productCard(product) {
  const stockLabel =
    product.stock <= 0
      ? `<span class="stock-note is-out">Sold out</span>`
      : product.stock <= 5
        ? `<span class="stock-note">Only ${product.stock} left</span>`
        : "";

  return `
    <article class="product-card" data-product-card data-name="${escapeHtml(product.name)}" data-category="${escapeHtml(product.category)}" data-price="${product.pricePaise}" data-featured="${product.isFeatured ? "1" : "0"}" data-search="${escapeHtml(`${product.name} ${product.category} ${product.description}`.toLowerCase())}">
      <button type="button" class="product-media" data-action="view-product" data-slug="${escapeHtml(product.slug)}" aria-label="View ${escapeHtml(product.name)}">
        <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">
        <span class="product-category-tag">${escapeHtml(product.category)}</span>
        ${stockLabel}
      </button>
      <div class="product-body">
        <h3 class="product-title">
          <button type="button" data-action="view-product" data-slug="${escapeHtml(product.slug)}">${escapeHtml(product.name)}</button>
        </h3>
        <p class="product-desc">${escapeHtml(productDescription(product.description, 96))}</p>
        <div class="product-footer">
          <div class="product-price">
            <strong>${formatMoney(product.pricePaise)}</strong>
            <span>${escapeHtml(product.unit)}</span>
          </div>
          <button type="button" class="add-button" data-action="add-to-cart" data-id="${product.id}" aria-label="Add ${escapeHtml(product.name)} to cart" ${product.stock <= 0 ? "disabled" : ""}>
            ${icon("plus", 20)}
          </button>
        </div>
      </div>
    </article>
  `;
}

function emptyState({ iconName = "sprout", title, text, action = "" }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName, 30)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${action}
    </div>
  `;
}

export function signInGate({ title, text, actionLabel = "Sign in to continue" }) {
  return `
    <section class="section">
      <div class="container narrow">
        <div class="gate-card">
          <div class="gate-art">${icon("user", 34)}</div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> Your account</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(text)}</p>
          <button type="button" class="btn btn-primary" data-action="open-auth">${escapeHtml(actionLabel)}</button>
          <div class="gate-points">
            <span>${icon("shield-check", 17)} Secure account</span>
            <span>${icon("map-pin", 17)} Saved details</span>
            <span>${icon("clock", 17)} Order history</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderHome({ products, categories, config, user }) {
  const featured = (products.filter((product) => product.isFeatured).length
    ? products.filter((product) => product.isFeatured)
    : products
  ).slice(0, 4);
  const sortedProducts = sortByName(products);
  const leafyProducts = sortedProducts.filter((product) => /leaf/i.test(product.category));
  const vegetableProducts = sortedProducts.filter((product) => !/leaf/i.test(product.category));
  const canEditPrices = user?.role === "admin";
  const categoryCards = categories.slice(0, 4).map((category, index) => {
    const product = products.find((item) => item.category === category);
    const count = products.filter((item) => item.category === category).length;
    return `
      <a class="category-card category-${index + 1}" href="/shop?category=${encodeURIComponent(category)}" data-link>
        <img src="${escapeHtml(product?.imageUrl || "/images/market.jpg")}" alt="" loading="lazy">
        <span class="category-overlay"></span>
        <span class="category-copy">
          <span>${plural(count, "fresh pick")}</span>
          <strong>${escapeHtml(category)}</strong>
        </span>
        <span class="category-arrow">${icon("arrow-right", 18)}</span>
      </a>
    `;
  });

  return `
    <section class="hero-section">
      <div class="container hero-grid">
        <div class="hero-copy">
          <span class="eyebrow"><span class="eyebrow-dot"></span> From nearby farms to your kitchen</span>
          <h1>Good food,<br><em>grown the slow way.</em></h1>
          <p class="hero-lead">Seasonal vegetables picked at their best, brought to your door with care. Skip the long aisles and let the good stuff come to you.</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="/shop" data-link>${icon("sprout", 19)} Shop the harvest</a>
            <a class="btn btn-ghost btn-lg" href="/#promise" data-link>Our promise ${icon("arrow-right", 18)}</a>
          </div>
          <div class="hero-meta">
            <div><strong>Same-day</strong><span>local delivery</span></div>
            <div><strong>UPI</strong><span>secure checkout</span></div>
            <div><strong>${config.delivery.radiusKm} km</strong><span>delivery zone</span></div>
          </div>
        </div>

        <div class="hero-art">
          <div class="hero-blob"></div>
          <div class="hero-leaf hero-leaf-one">${icon("leaf", 74)}</div>
          <div class="hero-leaf hero-leaf-two">${icon("leaf", 52)}</div>
          <figure class="hero-photo hero-photo-main">
            <img src="/images/tomatoes.jpg" alt="Fresh vine tomatoes with water droplets" fetchpriority="high">
          </figure>
          <figure class="hero-photo hero-photo-carrots">
            <img src="/images/carrots.jpg" alt="Fresh carrots with green tops" fetchpriority="high">
          </figure>
          <figure class="hero-photo hero-photo-greens">
            <img src="/images/spinach.jpg" alt="A bundle of fresh leafy greens" fetchpriority="high">
          </figure>
          <div class="hero-seal">
            <span>${icon("leaf", 22)}</span>
            <strong>Grown</strong>
            <em>with care</em>
          </div>
          <div class="hero-badge hero-badge-top">
            ${icon("shield-check", 19)}
            <span><strong>Secure UPI</strong>payments</span>
          </div>
          <div class="hero-badge hero-badge-bottom">
            ${icon("truck", 19)}
            <span><strong>Same-day</strong>delivery</span>
          </div>
        </div>
      </div>
    </section>

    <section class="benefit-strip">
      <div class="container benefit-grid">
        <div class="benefit-item">${icon("leaf", 22)}<div><strong>Picked at its best</strong><span>Fresh, seasonal produce</span></div></div>
        <div class="benefit-item">${icon("truck", 22)}<div><strong>Local delivery</strong><span>Within ${config.delivery.radiusKm} km</span></div></div>
        <div class="benefit-item">${icon("shield-check", 22)}<div><strong>UPI checkout</strong><span>Simple and secure</span></div></div>
        <div class="benefit-item">${icon("phone", 22)}<div><strong>Real support</strong><span>We're a call away</span></div></div>
      </div>
    </section>

    <section class="section categories-section">
      <div class="container">
        <div class="section-heading">
          <div>
            <span class="eyebrow"><span class="eyebrow-dot"></span> Find your favourites</span>
            <h2>What's in season</h2>
          </div>
          <a class="text-link" href="/shop" data-link>Browse everything ${icon("arrow-right", 17)}</a>
        </div>
        <div class="category-grid">${categoryCards}</div>
      </div>
    </section>

    <section class="section price-list-section" id="price-list">
      <div class="container">
        <div class="section-heading">
          <div>
            <span class="eyebrow"><span class="eyebrow-dot"></span> Full harvest, A to Z</span>
            <h2>Vegetable price list</h2>
            <p>Every vegetable on our shelf, listed alphabetically with today's price.</p>
          </div>
          <a class="text-link" href="/shop" data-link>Shop everything ${icon("arrow-right", 17)}</a>
        </div>
        <div class="price-list">
          <div class="price-list-row price-list-head">
            <span>Vegetables</span>
            <span>A–Z</span>
          </div>
          ${vegetableProducts.map((product) => priceListRow(product, canEditPrices)).join("")}
          ${
            leafyProducts.length
              ? `<div class="price-list-row price-list-head price-list-head-group">
                  <span>Leafy vegetables</span>
                  <span>A–Z</span>
                </div>
                ${leafyProducts.map((product) => priceListRow(product, canEditPrices)).join("")}`
              : ""
          }
        </div>
        <p class="price-list-note">${icon("shield-check", 15)} Prices are set by the store admin and update on the storefront immediately.${canEditPrices ? " Use the Price buttons above to update today's rate." : ""}</p>
      </div>
    </section>

    <section class="section featured-section">
      <div class="container">
        <div class="section-heading">
          <div>
            <span class="eyebrow"><span class="eyebrow-dot"></span> This week's pick</span>
            <h2>Fresh from the crate</h2>
            <p>Simple, honest vegetables for the meals you make every day.</p>
          </div>
          <a class="text-link" href="/shop" data-link>Shop all ${icon("arrow-right", 17)}</a>
        </div>
        <div class="product-grid">${featured.map(productCard).join("")}</div>
      </div>
    </section>

    <section class="promise-section" id="promise">
      <div class="container promise-grid">
        <div class="promise-intro">
          <span class="eyebrow eyebrow-light"><span class="eyebrow-dot"></span> The Organic promise</span>
          <h2>Good produce shouldn't be complicated.</h2>
          <p>We keep the journey short and the standards high. That means fewer surprises in your basket and more time enjoying the food you bring home.</p>
          <a class="btn btn-cream" href="/shop" data-link>See today's harvest ${icon("arrow-right", 18)}</a>
          <div class="promise-seal">
            <span class="promise-seal-ring">${icon("leaf", 30)}</span>
            <span><strong>Short journey</strong><small>farm → basket → door</small></span>
          </div>
        </div>
        <div class="promise-cards">
          <article class="promise-card">
            <span class="promise-number">01</span>
            <div class="promise-icon">${icon("sprout", 24)}</div>
            <h3>Chosen, not just stocked</h3>
            <p>We look for produce that is fresh, full of flavour and ready for your kitchen — never the tired last pick.</p>
          </article>
          <article class="promise-card">
            <span class="promise-number">02</span>
            <div class="promise-icon">${icon("package", 24)}</div>
            <h3>Handled gently</h3>
            <p>From sorting to packing, your vegetables are treated like food, not freight. Less bruising, more crunch.</p>
          </article>
          <article class="promise-card">
            <span class="promise-number">03</span>
            <div class="promise-icon">${icon("heart", 24)}</div>
            <h3>Neighbourhood first</h3>
            <p>Local delivery keeps the journey short and the produce fresher. We deliver within ${config.delivery.radiusKm} km of our store.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="section how-section">
      <div class="container">
        <div class="centered-heading">
          <span class="eyebrow"><span class="eyebrow-dot"></span> How it works</span>
          <h2>From our shelves to your supper.</h2>
        </div>
        <div class="steps-grid">
          <article class="step-card">
            <span class="step-number">01</span>
            <div class="step-icon">${icon("sprout", 26)}</div>
            <h3>Pick your vegetables</h3>
            <p>Choose what looks good. Every item has a real photo, clear price and the exact quantity you'll receive.</p>
          </article>
          <article class="step-card">
            <span class="step-number">02</span>
            <div class="step-icon">${icon("map-pin", 26)}</div>
            <h3>Pin your door</h3>
            <p>Set your delivery location on the map and tell us where to leave your basket. We'll confirm we deliver there.</p>
          </article>
          <article class="step-card">
            <span class="step-number">03</span>
            <div class="step-icon">${icon("smartphone", 26)}</div>
            <h3>Pay by UPI</h3>
            <p>Check out securely, pay with your favourite UPI app, then follow your order from packing to your door.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="section cta-section">
      <div class="container">
        <div class="cta-banner">
          <img src="/images/market.jpg" alt="" loading="lazy">
          <div class="cta-overlay"></div>
          <div class="cta-copy">
            <span class="eyebrow eyebrow-light"><span class="eyebrow-dot"></span> Tonight's dinner starts here</span>
            <h2>Your next good meal is a few clicks away.</h2>
            <p>Fresh vegetables, a trusted local store and secure UPI checkout. Simple as it should be.</p>
            <a class="btn btn-cream" href="/shop" data-link>Start your basket ${icon("arrow-right", 18)}</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderShop({ products, categories, config, initialCategory = "", initialSearch = "" }) {
  const activeCategory = categories.includes(initialCategory) ? initialCategory : "";
  return `
    <section class="page-hero page-hero-shop">
      <div class="container">
        <span class="eyebrow"><span class="eyebrow-dot"></span> Today at the store</span>
        <div class="page-hero-row">
          <div>
            <h1>Fresh picks for your kitchen.</h1>
            <p>Every vegetable below is available now. Choose what you need — we'll take care of the rest.</p>
          </div>
          <div class="delivery-note">
            ${icon("truck", 22)}
            <span><strong>Delivering within ${config.delivery.radiusKm} km</strong>Free over ${formatMoney(config.delivery.freeOverPaise)}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section shop-section">
      <div class="container">
        <div class="shop-toolbar">
          <label class="search-field">
            ${icon("search", 19)}
            <input type="search" id="shop-search" placeholder="Search spinach, carrots, tomatoes…" value="${escapeHtml(initialSearch)}" autocomplete="off" aria-label="Search vegetables">
          </label>
          <div class="shop-toolbar-row">
            <div class="category-chips" id="shop-categories" role="group" aria-label="Filter by category">
              <button type="button" class="chip ${activeCategory ? "" : "is-active"}" data-shop-category="">All</button>
              ${categories
                .map(
                  (category) =>
                    `<button type="button" class="chip ${activeCategory === category ? "is-active" : ""}" data-shop-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
                )
                .join("")}
            </div>
            <label class="sort-field">
              <span>Sort</span>
              <select id="shop-sort">
                <option value="name" selected>Name A–Z</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="featured">Featured</option>
              </select>
            </label>
          </div>
        </div>

        <div class="shop-meta">
          <span id="shop-count">${plural(products.length, "fresh pick")}</span>
          <span class="shop-meta-note">${icon("leaf", 15)} Photos are of the actual produce type</span>
        </div>

        <div class="product-grid" id="shop-grid">${products.map(productCard).join("")}</div>
        <div id="shop-empty" class="empty-state" hidden>
          <div class="empty-icon">${icon("search", 30)}</div>
          <h3>No vegetables found</h3>
          <p>Try a different search or category.</p>
          <button type="button" class="btn btn-outline" data-action="clear-shop-filters">Clear filters</button>
        </div>
      </div>
    </section>
  `;
}

function cartLineItem(line) {
  const { product, quantity } = line;
  return `
    <div class="cart-line" data-cart-line="${product.id}">
      <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy">
      <div class="cart-line-copy">
        <div class="cart-line-top">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <span>${escapeHtml(product.unit)}</span>
          </div>
          <button type="button" class="icon-button subtle" data-action="cart-remove" data-id="${product.id}" aria-label="Remove ${escapeHtml(product.name)}">${icon("trash-2", 17)}</button>
        </div>
        <div class="cart-line-bottom">
          <div class="qty-stepper">
            <button type="button" data-action="cart-decrease" data-id="${product.id}" aria-label="Decrease quantity">${icon("minus", 15)}</button>
            <span>${quantity}</span>
            <button type="button" data-action="cart-increase" data-id="${product.id}" aria-label="Increase quantity" ${quantity >= Math.min(product.stock, 20) ? "disabled" : ""}>${icon("plus", 15)}</button>
          </div>
          <strong>${formatMoney(product.pricePaise * quantity)}</strong>
        </div>
      </div>
    </div>
  `;
}

export function renderCartDrawer({ cartLines, products, cartCount, config }) {
  const subtotal = cartLines.reduce((total, line) => total + line.product.pricePaise * line.quantity, 0);
  const remaining = Math.max(0, config.delivery.freeOverPaise - subtotal);
  const progress = Math.min(100, Math.round((subtotal / config.delivery.freeOverPaise) * 100));
  const delivery = subtotal >= config.delivery.freeOverPaise || subtotal === 0 ? 0 : config.delivery.feePaise;

  return `
    <div class="drawer cart-drawer">
      <header class="drawer-header">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> Your basket</span>
          <h2>${cartCount ? plural(cartCount, "item") : "An empty basket"}</h2>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close cart">${icon("x", 22)}</button>
      </header>

      ${
        cartLines.length
          ? `<div class="free-delivery-meter">
              <div class="free-delivery-copy">
                ${remaining > 0
                  ? `<span>Add <strong>${formatMoney(remaining)}</strong> more for free delivery</span>`
                  : `<span><strong>You've unlocked free delivery</strong></span>`}
                ${icon("truck", 19)}
              </div>
              <div class="progress-track"><span style="width:${progress}%"></span></div>
            </div>
            <div class="drawer-body cart-lines">${cartLines.map(cartLineItem).join("")}</div>
            <footer class="drawer-footer">
              <div class="cart-total-row"><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
              <div class="cart-total-row muted"><span>Delivery</span><span>${delivery ? formatMoney(delivery) : "Calculated at checkout"}</span></div>
              <button type="button" class="btn btn-primary btn-block btn-lg" data-action="go-checkout">
                ${icon("lock", 18)} Checkout ${icon("arrow-right", 18)}
              </button>
              <button type="button" class="text-button" data-action="close-modal">Continue shopping</button>
              <p class="drawer-note">${icon("shield-check", 15)} Secure UPI checkout. Your details stay private.</p>
            </footer>`
          : `<div class="drawer-body">
              ${emptyState({
                iconName: "cart",
                title: "Nothing in here yet",
                text: "Your basket is waiting for something fresh.",
                action: `<a class="btn btn-primary" href="/shop" data-link data-action="close-modal">Browse vegetables</a>`
              })}
            </div>`
      }
    </div>
  `;
}

export function renderCheckout({ user, cartLines, config, savedAddress, paymentsAvailable }) {
  if (!user) {
    return signInGate({
      title: "Sign in to check out.",
      text: "Your account keeps your order history and makes checkout quicker. Payment is still completed securely by UPI."
    });
  }

  if (!cartLines.length) {
    return `
      <section class="section">
        <div class="container narrow">
          ${emptyState({
            iconName: "cart",
            title: "Your basket is empty",
            text: "Add a few fresh vegetables before heading to checkout.",
            action: `<a class="btn btn-primary" href="/shop" data-link>Shop the harvest</a>`
          })}
        </div>
      </section>
    `;
  }

  const subtotal = cartLines.reduce((total, line) => total + line.product.pricePaise * line.quantity, 0);
  const delivery = subtotal >= config.delivery.freeOverPaise ? 0 : config.delivery.feePaise;
  const total = subtotal + delivery;
  const freeDeliveryRemaining = Math.max(0, config.delivery.freeOverPaise - subtotal);
  const label = savedAddress?.label || "Home";

  return `
    <section class="page-hero page-hero-checkout">
      <div class="container">
        <a class="back-link" href="/shop" data-link>${icon("arrow-left", 17)} Keep shopping</a>
        <span class="eyebrow"><span class="eyebrow-dot"></span> Secure checkout</span>
        <h1>Almost at your door.</h1>
        <p>Tell us where to bring your basket, then pay securely by UPI.</p>
      </div>
    </section>

    <section class="section checkout-section">
      <div class="container checkout-layout">
        <form class="checkout-form" id="checkout-form" novalidate>
          <div class="form-error" data-form-error role="alert" hidden></div>

          <section class="form-panel">
            <div class="panel-heading">
              <span class="panel-step">01</span>
              <div><h2>Contact details</h2><p>For delivery updates about this order.</p></div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>Full name</span>
                <input type="text" name="recipientName" value="${escapeHtml(savedAddress?.recipientName || user.name)}" autocomplete="name" required minlength="2" maxlength="80">
              </label>
              <label class="field">
                <span>Mobile number</span>
                <input type="tel" name="contactPhone" value="${escapeHtml(savedAddress?.contactPhone || user.phone)}" autocomplete="tel" required placeholder="10-digit mobile number">
              </label>
            </div>
          </section>

          <section class="form-panel">
            <div class="panel-heading">
              <span class="panel-step">02</span>
              <div><h2>Delivery address</h2><p>Drop a pin so we can confirm the delivery zone.</p></div>
            </div>

            <div class="address-label-row" role="group" aria-label="Address label">
              ${["Home", "Work", "Other"]
                .map(
                  (item) =>
                    `<label class="address-label-option"><input type="radio" name="addressLabel" value="${item}" ${label === item ? "checked" : ""}><span>${item}</span></label>`
                )
                .join("")}
            </div>

            <div class="map-shell">
              <div class="map-canvas" id="checkout-map" aria-label="Delivery location map" data-lat="${savedAddress?.lat ?? ""}" data-lng="${savedAddress?.lng ?? ""}"></div>
              <div class="map-overlay">
                <button type="button" class="btn btn-cream btn-sm" id="use-my-location">${icon("navigation", 17)} Use my location</button>
                <button type="button" class="btn btn-cream btn-sm" id="find-address" disabled>${icon("search", 17)} Find address</button>
              </div>
            </div>
            <div class="location-status is-neutral" id="location-status" role="status">
              ${icon("map-pin", 18)}
              <span>Click the map to drop your delivery pin, or use your current location.</span>
            </div>

            <label class="field">
              <span>Full address</span>
              <textarea name="line" rows="3" required minlength="10" maxlength="400" placeholder="Flat / house no., building, street, area, city, PIN code" autocomplete="street-address">${escapeHtml(savedAddress?.line || "")}</textarea>
            </label>
            <label class="field">
              <span>Delivery notes <small>optional</small></span>
              <textarea name="notes" rows="2" maxlength="300" placeholder="Gate code, landmark or where to leave the basket">${escapeHtml(savedAddress?.notes || "")}</textarea>
            </label>
          </section>

          <section class="form-panel">
            <div class="panel-heading">
              <span class="panel-step">03</span>
              <div><h2>Payment</h2><p>Pay securely with any UPI app.</p></div>
            </div>
            ${
              paymentsAvailable
                ? `<div class="payment-choice">
                    <span class="upi-mark">UPI</span>
                    <div class="payment-choice-copy">
                      <strong>UPI payment</strong>
                      <span>Google Pay, PhonePe, Paytm and other UPI apps</span>
                    </div>
                    <span class="radio-mark" aria-hidden="true">${icon("check", 14)}</span>
                  </div>
                  ${
                    config.payments.demoEnabled
                      ? `<div class="inline-notice is-warning">${icon("info", 18)} <span><strong>Test UPI is active.</strong> This checkout will not charge real money. Add Razorpay keys to go live.</span></div>`
                      : `<p class="payment-security">${icon("lock", 15)} Payments are processed securely by Razorpay. We never see your UPI PIN.</p>`
                  }`
                : `<div class="inline-notice is-error">${icon("alert-circle", 18)} <span>Online payments are temporarily unavailable. Please call the store to order.</span></div>`
            }
          </section>

          <div class="checkout-mobile-total">
            <div><span>Total</span><strong>${formatMoney(total)}</strong></div>
            <button type="submit" class="btn btn-primary btn-lg" id="checkout-mobile-submit" ${!paymentsAvailable ? "disabled" : ""}>Pay by UPI</button>
          </div>
        </form>

        <aside class="checkout-summary">
          <div class="summary-panel">
            <div class="summary-head">
              <h2>Your basket</h2>
              <span>${plural(cartLines.reduce((sum, line) => sum + line.quantity, 0), "item")}</span>
            </div>
            <div class="summary-lines">
              ${cartLines
                .map(
                  (line) => `
                <div class="summary-line">
                  <div class="summary-thumb">
                    <img src="${escapeHtml(line.product.imageUrl)}" alt="" loading="lazy">
                    <span>${line.quantity}</span>
                  </div>
                  <div class="summary-line-copy">
                    <strong>${escapeHtml(line.product.name)}</strong>
                    <span>${escapeHtml(line.product.unit)}</span>
                  </div>
                  <span>${formatMoney(line.product.pricePaise * line.quantity)}</span>
                </div>`
                )
                .join("")}
            </div>
            ${
              freeDeliveryRemaining > 0
                ? `<div class="summary-delivery-hint">${icon("truck", 17)} Add ${formatMoney(freeDeliveryRemaining)} more for free delivery</div>`
                : `<div class="summary-delivery-hint is-success">${icon("check-circle", 17)} Free delivery unlocked</div>`
            }
            <div class="summary-totals">
              <div><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
              <div><span>Delivery</span><span>${delivery ? formatMoney(delivery) : "Free"}</span></div>
              <div class="summary-grand-total"><span>Total</span><strong>${formatMoney(total)}</strong></div>
            </div>
            <button type="submit" form="checkout-form" class="btn btn-primary btn-block btn-lg summary-submit" id="place-order-button" ${!paymentsAvailable ? "disabled" : ""}>
              ${icon("lock", 18)} Pay ${formatMoney(total)} by UPI
            </button>
            <p class="summary-security">${icon("shield-check", 16)} Secure UPI checkout · ${config.delivery.radiusKm} km delivery zone</p>
          </div>
          <div class="summary-help">
            <div class="summary-help-icon">${icon("phone", 20)}</div>
            <div>
              <strong>Need a hand?</strong>
              <a href="tel:${escapeHtml(telHref(config.store.phone))}">${escapeHtml(config.store.phone)}</a>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function orderStatusChip(status) {
  const meta = statusMeta(status);
  return `<span class="status-chip status-${meta.tone}">${icon(meta.icon, 14)} ${escapeHtml(meta.label)}</span>`;
}

function paymentStatusChip(status) {
  const meta = paymentMeta(status);
  return `<span class="payment-chip payment-${meta.tone}">${escapeHtml(meta.label)}</span>`;
}

function orderThumbs(order) {
  const visible = order.items.slice(0, 3);
  return `<div class="order-thumbs">
    ${visible.map((item) => `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">`).join("")}
    ${order.items.length > 3 ? `<span>+${order.items.length - 3}</span>` : ""}
  </div>`;
}

function orderCard(order) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const active = ["placed", "confirmed", "packed", "out_for_delivery"].includes(order.status);
  const latestEvent = order.events[order.events.length - 1];
  return `
    <article class="order-card" data-order-card data-order-status="${order.status}" data-active="${active ? "1" : "0"}">
      <div class="order-card-head">
        <div>
          <span class="order-code">${escapeHtml(order.code)}</span>
          <span class="order-date">${formatDateTime(order.createdAt)}</span>
        </div>
        ${orderStatusChip(order.status)}
      </div>
      <div class="order-card-main">
        ${orderThumbs(order)}
        <div class="order-card-copy">
          <h3>${order.status === "delivered" ? "Delivered fresh" : escapeHtml(statusMeta(order.status).short)}</h3>
          <p>${plural(itemCount, "item")} · ${formatMoney(order.totalPaise)} · ${escapeHtml(latestEvent?.note || statusMeta(order.status).description)}</p>
          <span class="order-address">${icon("map-pin", 14)} ${escapeHtml(firstLine(order.address.line))}</span>
        </div>
      </div>
      <div class="order-card-actions">
        <a class="btn btn-outline btn-sm" href="/orders/${encodeURIComponent(order.code)}" data-link>View details</a>
        ${
          order.canPay
            ? `<button type="button" class="btn btn-primary btn-sm" data-action="pay-order" data-code="${escapeHtml(order.code)}">${icon("lock", 15)} Pay now</button>`
            : ""
        }
        ${
          order.canCancel
            ? `<button type="button" class="btn btn-ghost btn-sm text-danger" data-action="cancel-order" data-code="${escapeHtml(order.code)}">Cancel</button>`
            : ""
        }
        ${order.paymentStatus === "paid" ? `<span class="order-paid">${icon("check-circle", 15)} ${paymentStatusChip(order.paymentStatus)}</span>` : ""}
      </div>
    </article>
  `;
}

export function renderOrders({ user, orders }) {
  if (!user) {
    return signInGate({
      title: "Your orders live here.",
      text: "Sign in to see past deliveries, track a live order or finish a pending UPI payment."
    });
  }

  return `
    <section class="page-hero page-hero-orders">
      <div class="container">
        <span class="eyebrow"><span class="eyebrow-dot"></span> From our store to your door</span>
        <h1>My orders</h1>
        <p>Track your basket, check delivery updates and keep your payment details in one place.</p>
      </div>
    </section>

    <section class="section orders-section">
      <div class="container">
        ${
          orders.length
            ? `<div class="filter-tabs" id="order-tabs" role="tablist" aria-label="Filter orders">
                <button type="button" class="filter-tab is-active" data-order-filter="all" role="tab" aria-selected="true">All <span>${orders.length}</span></button>
                <button type="button" class="filter-tab" data-order-filter="active" role="tab" aria-selected="false">In progress <span>${orders.filter((order) => ["placed", "confirmed", "packed", "out_for_delivery"].includes(order.status)).length}</span></button>
                <button type="button" class="filter-tab" data-order-filter="delivered" role="tab" aria-selected="false">Delivered <span>${orders.filter((order) => order.status === "delivered").length}</span></button>
                <button type="button" class="filter-tab" data-order-filter="cancelled" role="tab" aria-selected="false">Cancelled <span>${orders.filter((order) => order.status === "cancelled").length}</span></button>
              </div>
              <div class="orders-list" id="orders-list">${orders.map(orderCard).join("")}</div>
              <div class="empty-state" id="orders-filter-empty" hidden>
                <div class="empty-icon">${icon("package", 30)}</div>
                <h3>No orders in this view</h3>
                <p>Try another filter to see your other orders.</p>
              </div>`
            : emptyState({
                iconName: "package",
                title: "Your first basket is waiting",
                text: "When you place an order, you'll be able to follow it here from confirmation to delivery.",
                action: `<a class="btn btn-primary" href="/shop" data-link>Shop fresh vegetables</a>`
              })
        }
      </div>
    </section>
  `;
}

function progressSteps(order) {
  if (order.status === "cancelled") {
    return `<div class="order-cancelled-banner">${icon("alert-circle", 19)} <span>${escapeHtml(order.cancelReason || "This order was cancelled.")}</span></div>`;
  }
  const currentIndex = TRACK_STEPS.indexOf(order.status);
  return `
    <div class="order-progress">
      ${TRACK_STEPS.map((step, index) => {
        const meta = statusMeta(step);
        const state = index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : "";
        return `<div class="progress-step ${state}">
          <span class="progress-dot">${index < currentIndex ? icon("check", 14) : icon(meta.icon, 15)}</span>
          <span class="progress-label">${escapeHtml(step === "out_for_delivery" ? "On the way" : step === "placed" ? "Placed" : meta.short)}</span>
        </div>`;
      }).join("")}
    </div>
  `;
}

export function renderOrderDetail({ order, config, success = false }) {
  const meta = statusMeta(order.status);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const active = ["placed", "confirmed", "packed", "out_for_delivery"].includes(order.status);
  const canReorder = ["delivered", "cancelled"].includes(order.status);

  return `
    <section class="order-detail-section">
      <div class="container">
        <a class="back-link" href="/orders" data-link>${icon("arrow-left", 17)} All orders</a>

        ${success ? `<div class="success-banner">${icon("check-circle", 24)} <div><strong>Payment received.</strong><span>Your order is confirmed and our team is on it.</span></div></div>` : ""}

        <div class="order-detail-head">
          <div class="order-detail-title">
            <span class="eyebrow"><span class="eyebrow-dot"></span> Order ${escapeHtml(order.code)}</span>
            <h1>${escapeHtml(meta.label)}</h1>
            <p>${escapeHtml(meta.description)}</p>
            <div class="order-detail-meta">
              ${orderStatusChip(order.status)}
              ${paymentStatusChip(order.paymentStatus)}
              <span>${icon("clock", 15)} Placed ${formatDateTime(order.createdAt)}</span>
            </div>
          </div>
          <div class="order-head-actions">
            ${order.canPay ? `<button type="button" class="btn btn-primary" data-action="pay-order" data-code="${escapeHtml(order.code)}">${icon("lock", 17)} Pay now</button>` : ""}
            ${order.canCancel ? `<button type="button" class="btn btn-ghost text-danger" data-action="cancel-order" data-code="${escapeHtml(order.code)}">Cancel order</button>` : ""}
            <button type="button" class="btn btn-outline" data-action="print-order">${icon("printer", 17)} Receipt</button>
          </div>
        </div>

        ${active ? `<div class="live-status-bar">${icon("refresh-cw", 16)} <span>Live order status</span><em>Refreshes automatically</em></div>` : ""}
        ${progressSteps(order)}

        <div class="order-detail-grid">
          <div class="order-detail-main">
            <section class="detail-panel">
              <div class="detail-panel-head">
                <h2>Order timeline</h2>
                <span>${plural(itemCount, "item")}</span>
              </div>
              <div class="timeline">
                ${order.events
                  .map(
                    (event) => `
                  <div class="timeline-item ${event === order.events[order.events.length - 1] ? "is-latest" : ""}">
                    <span class="timeline-dot">${icon(statusMeta(event.status).icon, 14)}</span>
                    <div>
                      <strong>${escapeHtml(statusMeta(event.status).label)}</strong>
                      <p>${escapeHtml(event.note || statusMeta(event.status).description)}</p>
                      <time>${formatDateTime(event.createdAt)}</time>
                    </div>
                  </div>`
                  )
                  .join("")}
              </div>
            </section>

            <section class="detail-panel">
              <div class="detail-panel-head">
                <h2>In your basket</h2>
                <span>${formatMoney(order.subtotalPaise)}</span>
              </div>
              <div class="order-item-list">
                ${order.items
                  .map(
                    (item) => `
                  <div class="order-item">
                    <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">
                    <div>
                      <strong>${escapeHtml(item.name)}</strong>
                      <span>${escapeHtml(item.unit)} · Qty ${item.quantity}</span>
                    </div>
                    <span>${formatMoney(item.pricePaise * item.quantity)}</span>
                  </div>`
                  )
                  .join("")}
              </div>
            </section>

            <section class="detail-panel">
              <div class="detail-panel-head">
                <h2>Delivery address</h2>
                <span>${formatDistance(order.address.distanceKm)} away</span>
              </div>
              <div class="map-shell map-shell-order">
                <div class="map-canvas" id="order-map"
                  data-order-lat="${order.address.lat}" data-order-lng="${order.address.lng}"
                  data-store-lat="${config.store.lat}" data-store-lng="${config.store.lng}"
                  aria-label="Delivery location map"></div>
              </div>
              <div class="address-card">
                <div class="address-card-icon">${icon("map-pin", 20)}</div>
                <div>
                  <strong>${escapeHtml(order.address.recipientName)} · ${escapeHtml(order.address.label)}</strong>
                  <p>${escapeHtml(order.address.line)}</p>
                  ${order.address.notes ? `<span>Note: ${escapeHtml(order.address.notes)}</span>` : ""}
                  <a href="tel:${escapeHtml(telHref(order.address.contactPhone))}">${icon("phone", 14)} ${escapeHtml(order.address.contactPhone)}</a>
                </div>
              </div>
            </section>
          </div>

          <aside class="order-detail-aside">
            <section class="summary-panel">
              <div class="summary-head"><h2>Payment summary</h2>${paymentStatusChip(order.paymentStatus)}</div>
              <div class="summary-totals">
                <div><span>Subtotal</span><span>${formatMoney(order.subtotalPaise)}</span></div>
                <div><span>Delivery</span><span>${order.deliveryFeePaise ? formatMoney(order.deliveryFeePaise) : "Free"}</span></div>
                <div class="summary-grand-total"><span>Total</span><strong>${formatMoney(order.totalPaise)}</strong></div>
              </div>
              <div class="payment-method-line">
                <span class="upi-mini">UPI</span>
                <div><strong>${escapeHtml(order.paymentMethod || "UPI payment")}</strong><span>${order.paymentStatus === "paid" ? "Payment received" : order.paymentStatus === "refund_pending" ? "Refund being processed" : order.paymentStatus === "refunded" ? "Refund completed" : "Payment not completed"}</span></div>
              </div>
              <p class="summary-security">${icon("shield-check", 16)} ${config.payments.demoEnabled ? "Test mode — no real money is charged." : "Payments are securely processed by Razorpay."}</p>
              ${canReorder ? `<button type="button" class="btn btn-outline btn-block" data-action="reorder" data-code="${escapeHtml(order.code)}">${icon("refresh", 17)} Order these again</button>` : ""}
            </section>

            <section class="help-panel">
              <div class="help-panel-icon">${icon("phone", 22)}</div>
              <h3>Something on your mind?</h3>
              <p>Call the store and a real person will help with your delivery.</p>
              <a class="btn btn-cream btn-block" href="tel:${escapeHtml(telHref(config.store.phone))}">${escapeHtml(config.store.phone)}</a>
            </section>

            <section class="detail-panel compact">
              <div class="detail-panel-head"><h2>Order info</h2></div>
              <dl class="order-info-list">
                <div><dt>Order number</dt><dd>${escapeHtml(order.code)}</dd></div>
                <div><dt>Placed on</dt><dd>${formatDate(order.createdAt, { hour: "numeric", minute: "2-digit" })}</dd></div>
                ${order.paidAt ? `<div><dt>Paid on</dt><dd>${formatDateTime(order.paidAt)}</dd></div>` : ""}
                ${order.deliveredAt ? `<div><dt>Delivered on</dt><dd>${formatDateTime(order.deliveredAt)}</dd></div>` : ""}
                <div><dt>Delivery zone</dt><dd>Within ${config.delivery.radiusKm} km</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </section>
  `;
}

export function renderAccount({ user, config }) {
  if (!user) {
    return signInGate({
      title: "Your account, all in one place.",
      text: "Sign in to manage your details, see your order history and check out faster next time."
    });
  }

  return `
    <section class="page-hero page-hero-account">
      <div class="container">
        <span class="eyebrow"><span class="eyebrow-dot"></span> Your account</span>
        <h1>Hello, ${escapeHtml(firstName(user.name))}.</h1>
        <p>Keep your contact details fresh so we can reach you about deliveries.</p>
      </div>
    </section>

    <section class="section account-section">
      <div class="container account-layout">
        <aside class="account-sidebar">
          <div class="profile-card">
            <span class="profile-avatar">${escapeHtml(initials(user.name))}</span>
            <h2>${escapeHtml(user.name)}</h2>
            <span class="profile-username">@${escapeHtml(user.username)}</span>
            ${user.role === "admin" ? `<span class="role-badge">${icon("badge-check", 14)} Store admin</span>` : `<span class="role-badge">${icon("user", 14)} Customer</span>`}
            <div class="profile-contact">
              <span>${icon("mail", 15)} ${escapeHtml(user.email)}</span>
              <span>${icon("phone", 15)} ${escapeHtml(user.phone)}</span>
            </div>
          </div>

          <div class="side-card">
            <span class="side-card-icon">${icon("store", 20)}</span>
            <h3>Need help?</h3>
            <p>${escapeHtml(config.store.name)}<br>${escapeHtml(config.store.address)}</p>
            <a href="tel:${escapeHtml(telHref(config.store.phone))}">${escapeHtml(config.store.phone)}</a>
          </div>

          <div class="side-card">
            <span class="side-card-icon">${icon("smartphone", 20)}</span>
            <h3>Install the app</h3>
            <p>Add Organic Vegetables to your home screen for quicker reorders.</p>
            <button type="button" class="btn btn-outline btn-block" data-action="install-app">${icon("smartphone", 16)} Install app</button>
          </div>

          ${user.role === "admin" ? `<a class="admin-shortcut" href="/admin" data-link><span>${icon("sliders", 20)}</span><div><strong>Store dashboard</strong><span>Manage orders &amp; stock</span></div>${icon("arrow-right", 17)}</a>` : ""}

          <button type="button" class="btn btn-ghost btn-block signout-button" data-action="logout">${icon("log-out", 17)} Sign out</button>
        </aside>

        <div class="account-main">
          <section class="form-panel">
            <div class="panel-heading">
              <span class="panel-step">01</span>
              <div><h2>Personal details</h2><p>Used for delivery updates and receipts.</p></div>
            </div>
            <form data-form="profile" novalidate>
              <div class="form-error" data-form-error role="alert" hidden></div>
              <div class="field-grid">
                <label class="field"><span>Full name</span><input name="name" value="${escapeHtml(user.name)}" required minlength="2" maxlength="80" autocomplete="name"></label>
                <label class="field"><span>Username</span><input name="username" value="${escapeHtml(user.username)}" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9._\\-]+" autocomplete="username"></label>
                <label class="field"><span>Email address</span><input type="email" name="email" value="${escapeHtml(user.email)}" required autocomplete="email"></label>
                <label class="field"><span>Mobile number</span><input type="tel" name="phone" value="${escapeHtml(user.phone)}" required autocomplete="tel"></label>
              </div>
              <button type="submit" class="btn btn-primary">Save changes</button>
            </form>
          </section>

          <section class="form-panel">
            <div class="panel-heading">
              <span class="panel-step">02</span>
              <div><h2>Password &amp; security</h2><p>Use at least 8 characters with a letter and a number.</p></div>
            </div>
            <form data-form="password" novalidate>
              <div class="form-error" data-form-error role="alert" hidden></div>
              <div class="field-grid">
                <label class="field"><span>Current password</span><input type="password" name="currentPassword" required autocomplete="current-password"></label>
                <label class="field"><span>New password</span><input type="password" name="newPassword" required minlength="8" autocomplete="new-password"></label>
              </div>
              <button type="submit" class="btn btn-outline">Update password</button>
            </form>
          </section>

          <section class="form-panel compact-panel">
            <div class="panel-heading">
              <span class="panel-step">03</span>
              <div><h2>Delivery zone</h2><p>Orders are delivered within ${config.delivery.radiusKm} km of the store.</p></div>
            </div>
            <div class="delivery-zone-info">
              <span>${icon("map-pin", 19)} ${escapeHtml(config.store.address)}</span>
              <span>${icon("truck", 19)} Free delivery over ${formatMoney(config.delivery.freeOverPaise)}</span>
              <span>${icon("clock", 19)} Payment window: ${config.delivery.paymentWindowMinutes} minutes</span>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

export function renderAuthModal(tab = "login") {
  const isLogin = tab !== "register";
  return `
    <div class="auth-modal-grid">
      <div class="auth-visual">
        <img src="/images/market.jpg" alt="A market display of fresh vegetables">
        <div class="auth-visual-shade"></div>
        <div class="auth-visual-content">
          <img class="auth-logo" src="/assets/logo.svg" alt="" width="52" height="52">
          <div>
            <strong>Good food,<br>delivered simply.</strong>
            <span>Fresh vegetables · Secure UPI</span>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <button type="button" class="icon-button auth-close" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
        <div class="auth-tabs" role="tablist" aria-label="Account">
          <button type="button" class="auth-tab ${isLogin ? "is-active" : ""}" data-action="auth-tab" data-tab="login" role="tab" aria-selected="${isLogin}">Sign in</button>
          <button type="button" class="auth-tab ${!isLogin ? "is-active" : ""}" data-action="auth-tab" data-tab="register" role="tab" aria-selected="${!isLogin}">Create account</button>
        </div>
        <div class="auth-heading">
          <span class="eyebrow"><span class="eyebrow-dot"></span> ${isLogin ? "Welcome back" : "Join the harvest"}</span>
          <h2>${isLogin ? "Your basket missed you." : "Make checkout simpler."}</h2>
          <p>${isLogin ? "Sign in with your email, username or phone number." : "Create an account with your name, username, email and phone."}</p>
        </div>
        ${
          isLogin
            ? `<form data-form="login" novalidate>
                <div class="form-error" data-form-error role="alert" hidden></div>
                <label class="field"><span>Email, username or phone</span><input name="identifier" required autocomplete="username" placeholder="you@example.com" data-autofocus></label>
                <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password" placeholder="Your password"></label>
                <button type="submit" class="btn btn-primary btn-block btn-lg">Sign in ${icon("arrow-right", 17)}</button>
                <p class="auth-footnote">Sessions last 30 days on this device. <button type="button" class="text-link" data-action="forgot-password">Forgot password?</button></p>
              </form>`
            : `<form data-form="register" novalidate>
                <div class="form-error" data-form-error role="alert" hidden></div>
                <div class="field-grid">
                  <label class="field"><span>Full name</span><input name="name" required minlength="2" maxlength="80" autocomplete="name" data-autofocus></label>
                  <label class="field"><span>Username</span><input name="username" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9._\\-]+" autocomplete="username" placeholder="e.g. navya.grows"></label>
                  <label class="field"><span>Email address</span><input type="email" name="email" required autocomplete="email"></label>
                  <label class="field"><span>Mobile number</span><input type="tel" name="phone" required autocomplete="tel" placeholder="10-digit mobile number"></label>
                  <label class="field"><span>Password</span><input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="Letter + number, min. 8 chars"></label>
                  <label class="field"><span>Confirm password</span><input type="password" name="confirmPassword" required minlength="8" autocomplete="new-password"></label>
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-lg">Create my account ${icon("arrow-right", 17)}</button>
                <p class="auth-footnote">By continuing you agree to our delivery and refund terms. Your details are stored securely and never sold.</p>
              </form>`
        }
      </div>
    </div>
  `;
}

export function renderProductModal(product, config) {
  return `
    <div class="product-modal-grid">
      <div class="product-modal-media">
        <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}">
        <button type="button" class="icon-button product-modal-close" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
        <span class="product-modal-category">${escapeHtml(product.category)}</span>
      </div>
      <div class="product-modal-copy">
        <span class="eyebrow"><span class="eyebrow-dot"></span> Fresh at the store</span>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="product-modal-price"><strong>${formatMoney(product.pricePaise)}</strong><span>${escapeHtml(product.unit)}</span></div>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-modal-tags">
          <span>${icon("leaf", 15)} Seasonal</span>
          <span>${icon("truck", 15)} Same-day local delivery</span>
          ${product.stock <= 5 && product.stock > 0 ? `<span class="is-amber">${icon("clock", 15)} Only ${product.stock} left</span>` : ""}
        </div>
        ${
          product.stock > 0
            ? `<form data-form="product-add" data-product-id="${product.id}">
                <div class="product-add-row">
                  <div class="qty-stepper qty-stepper-large">
                    <button type="button" data-action="qty-change" data-delta="-1" aria-label="Decrease quantity">${icon("minus", 16)}</button>
                    <input type="number" name="quantity" id="product-quantity" value="1" min="1" max="${Math.min(product.stock, 20)}" inputmode="numeric" aria-label="Quantity">
                    <button type="button" data-action="qty-change" data-delta="1" aria-label="Increase quantity">${icon("plus", 16)}</button>
                  </div>
                  <button type="submit" class="btn btn-primary btn-lg">Add to basket · ${formatMoney(product.pricePaise)}</button>
                </div>
              </form>`
            : `<div class="inline-notice is-error">${icon("alert-circle", 18)} <span>This one is sold out right now. Try another fresh pick.</span></div>`
        }
        <p class="product-modal-note">${icon("shield-check", 15)} Pay by UPI at checkout · Delivery within ${config.delivery.radiusKm} km</p>
      </div>
    </div>
  `;
}

export function renderPolicyModal() {
  return `
    <div class="policy-modal">
      <header class="policy-head">
        <span class="eyebrow"><span class="eyebrow-dot"></span> The details</span>
        <h2>Delivery, payment &amp; refunds</h2>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
      </header>
      <div class="policy-body">
        <h3>Delivery</h3>
        <p>We deliver within the local delivery zone shown at checkout. Orders are typically prepared the same day. Please provide a complete address and a reachable phone number.</p>
        <h3>UPI payments</h3>
        <p>Payments are processed securely by our payment provider. We never see or store your UPI PIN. Your order is confirmed only after payment is verified.</p>
        <h3>Cancellations</h3>
        <p>Unpaid orders can be cancelled from My orders. Once an order is paid, please call the store as soon as possible. We may be unable to cancel an order after it is packed or out for delivery.</p>
        <h3>Refunds</h3>
        <p>If a paid order is cancelled by the store, any eligible refund is sent to the original payment method. Refund timelines depend on your bank and UPI app, typically 5–7 business days.</p>
        <h3>Questions</h3>
        <p>Call the store using the number in the footer. We're happy to help.</p>
      </div>
    </div>
  `;
}

function statsCard(label, value, iconName, note = "") {
  return `<div class="admin-stat">
    <span class="admin-stat-icon">${icon(iconName, 20)}</span>
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>
  </div>`;
}

function adminOrdersTable(orders) {
  if (!orders.length) {
    return `<div class="admin-empty">${icon("package", 26)} <p>No orders yet. New orders will appear here.</p></div>`;
  }
  return `
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th></th></tr></thead>
        <tbody>
          ${orders
            .map(
              (order) => `<tr data-admin-order-row data-status="${order.status}" data-code="${escapeHtml(order.code)}">
                <td><strong>${escapeHtml(order.code)}</strong><span>${plural(order.items.reduce((sum, item) => sum + item.quantity, 0), "item")}</span></td>
                <td><strong>${escapeHtml(order.admin.customer.name)}</strong><span>${escapeHtml(order.admin.customer.phone)}</span></td>
                <td><strong>${formatMoney(order.totalPaise)}</strong><span>${escapeHtml(order.paymentStatus)}</span></td>
                <td>${paymentStatusChip(order.paymentStatus)}</td>
                <td>${orderStatusChip(order.status)}</td>
                <td>${formatDateTime(order.createdAt)}</td>
                <td><button type="button" class="btn btn-outline btn-sm" data-action="admin-manage-order" data-code="${escapeHtml(order.code)}">Manage</button></td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adminInventoryTable(products) {
  return `
    <div class="table-wrap">
      <table class="admin-table inventory-table">
        <thead><tr><th>Vegetable</th><th>Price (₹)</th><th>Stock</th><th>Active</th><th>Featured</th><th></th></tr></thead>
        <tbody>
          ${products
            .map(
              (product) => `<tr>
                <td>
                  <div class="inventory-product">
                    <img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy">
                    <div>
                      <input class="table-input table-input-name" type="text" name="name" value="${escapeHtml(product.name)}" maxlength="100" aria-label="Name for ${escapeHtml(product.name)}">
                      <span>${escapeHtml(product.category)} · ${escapeHtml(product.unit)}</span>
                    </div>
                  </div>
                </td>
                <td><input class="table-input" type="number" min="1" step="0.01" name="priceRupees" value="${(product.pricePaise / 100).toFixed(2)}" aria-label="Price for ${escapeHtml(product.name)}"></td>
                <td><input class="table-input table-input-small" type="number" min="0" step="1" name="stock" value="${product.stock}" aria-label="Stock for ${escapeHtml(product.name)}">${product.stock <= 5 ? `<span class="low-stock">Low</span>` : ""}</td>
                <td><label class="switch"><input type="checkbox" name="isActive" ${product.isActive ? "checked" : ""} aria-label="Available"><span></span></label></td>
                <td><label class="switch"><input type="checkbox" name="isFeatured" ${product.isFeatured ? "checked" : ""} aria-label="Featured"><span></span></label></td>
                <td><form data-form="admin-product" data-product-id="${product.id}"><button type="submit" class="btn btn-ghost btn-sm">Save</button></form></td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderAdmin({ user, stats, orders, products, activeTab = "orders", config }) {
  if (!user) {
    return signInGate({
      title: "Store dashboard.",
      text: "Sign in with a store administrator account to manage orders and stock."
    });
  }
  if (user.role !== "admin") {
    return `
      <section class="section">
        <div class="container narrow">
          <div class="gate-card">
            <div class="gate-art is-error">${icon("lock", 32)}</div>
            <span class="eyebrow"><span class="eyebrow-dot"></span> Restricted area</span>
            <h1>Store admins only.</h1>
            <p>Your account doesn't have access to the store dashboard. If you believe this is a mistake, contact the store owner.</p>
            <a class="btn btn-primary" href="/" data-link>Back to the store</a>
          </div>
        </div>
      </section>
    `;
  }

  const statusOptions = config.orderStatuses;
  return `
    <section class="admin-section">
      <div class="container admin-container">
        <div class="admin-head">
          <div>
            <span class="eyebrow"><span class="eyebrow-dot"></span> Store operations</span>
            <h1>Dashboard</h1>
            <p>Keep an eye on orders, payments and the shelf.</p>
          </div>
          <div class="admin-head-actions">
            <span class="admin-user">${icon("shield-check", 16)} ${escapeHtml(user.name)}</span>
            <a class="btn btn-outline btn-sm" href="/shop" data-link>View storefront</a>
          </div>
        </div>

        <div class="admin-stats">
          ${statsCard("Active orders", String(stats.activeOrders), "truck", "Confirmed and in progress")}
          ${statsCard("Today's orders", String(stats.todayOrders), "package", "All orders placed today")}
          ${statsCard("Today's revenue", formatMoney(stats.todayRevenuePaise), "credit-card", "Paid and not cancelled")}
          ${statsCard("Awaiting payment", String(stats.awaitingPayment), "clock", "Reserved stock")}
          ${statsCard("Low stock", String(stats.lowStock), "alert-circle", "5 or fewer remaining")}
          ${statsCard("Refunds pending", String(stats.refundPending), "refresh-cw", "Manual attention needed")}
        </div>

        <div class="admin-tabs" role="tablist" aria-label="Dashboard sections">
          <button type="button" class="admin-tab ${activeTab === "orders" ? "is-active" : ""}" data-action="admin-tab" data-tab="orders" role="tab" aria-selected="${activeTab === "orders"}">${icon("receipt", 18)} Orders <span>${orders.length}</span></button>
          <button type="button" class="admin-tab ${activeTab === "inventory" ? "is-active" : ""}" data-action="admin-tab" data-tab="inventory" role="tab" aria-selected="${activeTab === "inventory"}">${icon("package", 18)} Inventory <span>${products.length}</span></button>
        </div>

        <section class="admin-panel ${activeTab === "orders" ? "is-active" : ""}" data-admin-panel="orders">
          <div class="admin-panel-head">
            <div><h2>Recent orders</h2><p>Update status, check payments and issue refunds.</p></div>
            <label class="admin-filter">Status
              <select id="admin-order-filter">
                <option value="">All statuses</option>
                ${statusOptions.map((status) => `<option value="${status}">${escapeHtml(statusMeta(status).label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div id="admin-orders-table">${adminOrdersTable(orders)}</div>
          <div class="admin-note">${icon("info", 16)} Refunds only appear for cancelled paid orders. Razorpay refunds are sent to the original payment method.</div>
        </section>

        <section class="admin-panel ${activeTab === "inventory" ? "is-active" : ""}" data-admin-panel="inventory">
          <div class="admin-panel-head">
            <div><h2>Inventory</h2><p>Update the name, price and stock instantly, or pause an item.</p></div>
            <button type="button" class="btn btn-primary btn-sm" data-action="admin-add-product">${icon("plus", 17)} Add vegetable</button>
          </div>
          ${adminInventoryTable(products)}
          <div class="admin-note">${icon("info", 16)} Changes go live on the storefront immediately. Only store admins can edit names and prices. Existing orders keep the price at the time of purchase.</div>
        </section>
      </div>
    </section>
  `;
}

export function renderAdminOrderModal(order) {
  const transitions = order.admin.allowedTransitions || [];
  return `
    <div class="admin-order-modal">
      <header class="admin-modal-head">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> ${escapeHtml(order.code)}</span>
          <h2>Manage order</h2>
          <div class="admin-order-meta">${orderStatusChip(order.status)} ${paymentStatusChip(order.paymentStatus)}</div>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
      </header>
      <div class="admin-order-grid">
        <div class="admin-order-main">
          <section class="admin-modal-section">
            <h3>Customer</h3>
            <div class="customer-info">
              <div><strong>${escapeHtml(order.admin.customer.name)}</strong><span>@${escapeHtml(order.admin.customer.username)}</span></div>
              <a href="tel:${escapeHtml(telHref(order.admin.customer.phone))}">${icon("phone", 15)} ${escapeHtml(order.admin.customer.phone)}</a>
              <a href="mailto:${escapeHtml(order.admin.customer.email)}">${icon("mail", 15)} ${escapeHtml(order.admin.customer.email)}</a>
            </div>
          </section>
          <section class="admin-modal-section">
            <h3>Items</h3>
            <div class="order-item-list compact-list">
              ${order.items
                .map(
                  (item) => `<div class="order-item"><span class="admin-item-qty">${item.quantity}×</span><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.unit)} · ${formatMoney(item.pricePaise)}</span></div><span>${formatMoney(item.pricePaise * item.quantity)}</span></div>`
                )
                .join("")}
            </div>
            <div class="admin-total"><span>Total</span><strong>${formatMoney(order.totalPaise)}</strong></div>
          </section>
          <section class="admin-modal-section">
            <h3>Delivery</h3>
            <div class="customer-info">
              <div><strong>${escapeHtml(order.address.recipientName)}</strong><span>${formatDistance(order.address.distanceKm)} from store</span></div>
              <p>${escapeHtml(order.address.line)}</p>
              <span>${escapeHtml(order.address.notes || "No delivery notes")}</span>
            </div>
          </section>
        </div>
        <aside class="admin-order-side">
          <section class="admin-modal-section">
            <h3>Order status</h3>
            ${
              transitions.length
                ? `<form data-form="admin-order-status" data-code="${escapeHtml(order.code)}">
                    <label class="field"><span>New status</span>
                      <select name="status">${transitions.map((status) => `<option value="${status}">${escapeHtml(statusMeta(status).label)}</option>`).join("")}</select>
                    </label>
                    <label class="field"><span>Note for customer <small>optional</small></span><textarea name="note" rows="2" maxlength="300" placeholder="e.g. Packed and ready"></textarea></label>
                    <button type="submit" class="btn btn-primary btn-block">Update order</button>
                  </form>`
                : `<div class="inline-notice is-neutral">${icon("info", 17)} <span>No further status changes are available.</span></div>`
            }
          </section>
          <section class="admin-modal-section">
            <h3>Payment</h3>
            <div class="payment-admin-info">
              <span>Status</span><strong>${paymentStatusChip(order.paymentStatus)}</strong>
              <span>Method</span><strong>${escapeHtml(order.paymentMethod || "—")}</strong>
              ${order.admin.paymentReference ? `<span>Reference</span><code>${escapeHtml(order.admin.paymentReference)}</code>` : ""}
            </div>
            ${
              order.paymentStatus === "refund_pending"
                ? `<button type="button" class="btn btn-danger btn-block" data-action="admin-refund" data-code="${escapeHtml(order.code)}">${icon("refresh-cw", 16)} Process refund</button>`
                : ""
            }
          </section>
          <section class="admin-modal-section">
            <h3>Timeline</h3>
            <div class="admin-timeline">
              ${order.events.map((event) => `<div><span></span><div><strong>${escapeHtml(statusMeta(event.status).label)}</strong><small>${formatDateTime(event.createdAt)} · ${escapeHtml(event.note || "")}</small></div></div>`).join("")}
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

export function renderAddProductModal() {
  return `
    <div class="admin-add-modal">
      <header class="admin-modal-head">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> New shelf item</span>
          <h2>Add a vegetable</h2>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
      </header>
      <form data-form="admin-add-product" novalidate>
        <div class="form-error" data-form-error role="alert" hidden></div>
        <div class="field-grid">
          <label class="field"><span>Name</span><input name="name" required maxlength="100" data-autofocus></label>
          <label class="field"><span>Category</span><input name="category" required maxlength="50" placeholder="Fresh Vegetables"></label>
          <label class="field"><span>Price (₹)</span><input name="priceRupees" type="number" min="1" step="0.01" required></label>
          <label class="field"><span>Unit</span><input name="unit" required maxlength="40" placeholder="500 g"></label>
          <label class="field"><span>Stock</span><input name="stock" type="number" min="0" step="1" required value="20"></label>
          <label class="field"><span>Image URL</span><input name="imageUrl" required maxlength="500" placeholder="/images/tomatoes.jpg"></label>
        </div>
        <label class="field"><span>Description</span><textarea name="description" rows="3" required minlength="10" maxlength="800"></textarea></label>
        <div class="image-presets">
          <span>Use one of our photos</span>
          <div>
            ${productImages.map((url) => `<button type="button" data-action="pick-product-image" data-url="${url}" aria-label="Use photo ${url}"><img src="${url}" alt="" loading="lazy"></button>`).join("")}
          </div>
        </div>
        <div class="check-row">
          <label class="check-label"><input type="checkbox" name="isActive" checked> Available on storefront</label>
          <label class="check-label"><input type="checkbox" name="isFeatured"> Feature on home page</label>
        </div>
        <div class="admin-modal-actions">
          <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${icon("plus", 17)} Add vegetable</button>
        </div>
      </form>
    </div>
  `;
}

export function renderPriceEditor(product) {
  return `
    <div class="admin-add-modal">
      <header class="admin-modal-head">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> Admin only</span>
          <h2>Change today's rate</h2>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close">${icon("x", 22)}</button>
      </header>
      <form data-form="admin-price" data-product-id="${product.id}" novalidate>
        <div class="form-error" data-form-error role="alert" hidden></div>
        <div class="price-editor-product">
          <img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.category)} · ${escapeHtml(product.unit)}</span>
          </div>
          <span class="price-editor-current">Now ${formatMoney(product.pricePaise)}</span>
        </div>
        <label class="field"><span>New price (₹)</span><input name="priceRupees" type="number" min="1" step="0.01" value="${(product.pricePaise / 100).toFixed(2)}" required data-autofocus></label>
        <div class="admin-modal-actions">
          <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${icon("check", 17)} Update price</button>
        </div>
      </form>
    </div>
  `;
}

export function renderNotFound() {
  return `
    <section class="section">
      <div class="container narrow">
        <div class="gate-card not-found">
          <span class="eyebrow"><span class="eyebrow-dot"></span> 404</span>
          <h1>This row is empty.</h1>
          <p>We couldn't find that page. The vegetables, however, are right where they should be.</p>
          <div class="gate-actions">
            <a class="btn btn-primary" href="/" data-link>Back home</a>
            <a class="btn btn-outline" href="/shop" data-link>Shop vegetables</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderPageLoading() {
  return `
    <section class="section">
      <div class="container">
        <div class="page-loading">
          <span class="page-loading-mark">${icon("leaf", 30)}</span>
          <p>Gathering something fresh…</p>
        </div>
      </div>
    </section>
  `;
}

export function renderAppError(message) {
  return `
    <section class="section">
      <div class="container narrow">
        <div class="gate-card">
          <div class="gate-art is-error">${icon("alert-circle", 32)}</div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> A small hiccup</span>
          <h1>We hit a snag.</h1>
          <p>${escapeHtml(message)}</p>
          <button type="button" class="btn btn-primary" data-action="reload-page">Try again</button>
        </div>
      </div>
    </section>
  `;
}

export function renderNavAnnouncementOnly(config) {
  return renderHeader({ config, user: null, cartCount: 0, path: "/" });
}
