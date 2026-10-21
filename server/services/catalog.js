function asBoolean(value) {
  return value === 1 || value === true || value === "1";
}

export function mapProduct(row, includeAdminFields = false) {
  const product = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    pricePaise: row.price_paise,
    unit: row.unit,
    imageUrl: row.image_url,
    stock: row.stock,
    inStock: row.stock > 0 && asBoolean(row.is_active),
    isFeatured: asBoolean(row.is_featured)
  };
  if (includeAdminFields) {
    product.isActive = asBoolean(row.is_active);
    product.createdAt = row.created_at;
    product.updatedAt = row.updated_at;
  }
  return product;
}

export function listPublicProducts(db, { q = "", category = "" } = {}) {
  const where = ["is_active = 1"];
  const params = [];
  if (q) {
    where.push("(name LIKE ? OR description LIKE ? OR category LIKE ?)");
    const term = `%${String(q).trim()}%`;
    params.push(term, term, term);
  }
  if (category) {
    where.push("category = ?");
    params.push(String(category).trim());
  }
  const rows = db
    .prepare(
      `SELECT * FROM products WHERE ${where.join(" AND ")}
       ORDER BY is_featured DESC, name COLLATE NOCASE ASC`
    )
    .all(...params);
  const categories = db
    .prepare("SELECT DISTINCT category FROM products WHERE is_active = 1 ORDER BY category COLLATE NOCASE")
    .all()
    .map((row) => row.category);
  return { products: rows.map((row) => mapProduct(row)), categories };
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function uniqueSlug(db, desired, excludeId = 0) {
  const base = slugify(desired) || "vegetable";
  let candidate = base;
  let suffix = 2;
  while (db.prepare("SELECT id FROM products WHERE slug = ? AND id != ?").get(candidate, excludeId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
