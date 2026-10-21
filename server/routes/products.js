import { Router } from "express";
import { mapProduct, listPublicProducts } from "../services/catalog.js";
import { notFound } from "../lib/errors.js";

export function createProductsRouter({ db }) {
  const router = Router();

  router.get("/", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 80) : "";
    const category = typeof req.query.category === "string" ? req.query.category.slice(0, 60) : "";
    res.json(listPublicProducts(db, { q, category }));
  });

  router.get("/:slug", (req, res) => {
    const row = db.prepare("SELECT * FROM products WHERE slug = ? AND is_active = 1").get(req.params.slug);
    if (!row) throw notFound("That vegetable is not available.");
    res.json({ product: mapProduct(row) });
  });

  return router;
}
