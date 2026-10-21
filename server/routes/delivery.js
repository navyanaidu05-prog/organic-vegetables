import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { geoSchema, parseBody } from "../lib/validation.js";
import { ApiError } from "../lib/errors.js";

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function deliveryQuote(config, lat, lng, subtotalPaise = 0) {
  const distanceKm = haversineKm(config.store.lat, config.store.lng, lat, lng);
  const serviceable = distanceKm <= config.delivery.radiusKm;
  const deliveryFeePaise =
    subtotalPaise >= config.delivery.freeOverPaise ? 0 : config.delivery.feePaise;
  return {
    serviceable,
    distanceKm: Math.round(distanceKm * 10) / 10,
    radiusKm: config.delivery.radiusKm,
    deliveryFeePaise,
    freeOverPaise: config.delivery.freeOverPaise,
    store: {
      name: config.store.name,
      address: config.store.address,
      lat: config.store.lat,
      lng: config.store.lng
    }
  };
}

function createGeoLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many location lookups. Please wait a few minutes." }
      });
    }
  });
}

function createReverseLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many address lookups. Please wait a few minutes." }
      });
    }
  });
}

function labelFromAddress(address = {}) {
  const parts = [
    address.house_number,
    address.road || address.pedestrian || address.footway,
    address.neighbourhood || address.suburb,
    address.city || address.town || address.village,
    address.state,
    address.postcode
  ].filter(Boolean);
  return parts.join(", ");
}

export function createDeliveryRouter({ config }) {
  const router = Router();
  const cache = new Map();

  router.get("/check", createGeoLimiter(), (req, res) => {
    const data = parseBody(geoSchema, req.query);
    res.json(deliveryQuote(config, data.lat, data.lng));
  });

  router.get("/reverse", createReverseLimiter(), async (req, res) => {
    const data = parseBody(geoSchema, req.query);
    const cacheKey = `${data.lat.toFixed(4)},${data.lng.toFixed(4)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return res.json(cached.data);
    }

    const url = new URL(config.geocode.url);
    url.searchParams.set("lat", String(data.lat));
    url.searchParams.set("lon", String(data.lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");

    let response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": `OrganicVegetables/1.0 (${config.geocode.contactEmail})`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw new ApiError(502, "GEOCODE_UNAVAILABLE", "Address lookup is unavailable. Please type your address.");
    }

    if (!response.ok) {
      throw new ApiError(502, "GEOCODE_UNAVAILABLE", "Address lookup is unavailable. Please type your address.");
    }

    const body = await response.json();
    if (!body?.display_name) {
      throw new ApiError(404, "ADDRESS_NOT_FOUND", "We could not find an address for that point. Please type it.");
    }

    const payload = {
      address: body.display_name,
      shortAddress: labelFromAddress(body.address) || body.display_name,
      lat: data.lat,
      lng: data.lng
    };

    if (cache.size >= 500) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, { data: payload, expires: Date.now() + 30 * 60 * 1000 });
    res.json(payload);
  });

  return router;
}
