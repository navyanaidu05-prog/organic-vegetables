import { z } from "zod";
import { ApiError } from "./errors.js";

export function parseBody(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message
    }));
    throw new ApiError(400, "VALIDATION_ERROR", fields[0]?.message || "Please check the details you entered.", { fields });
  }
  return result.data;
}

export function normalizePhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  throw new ApiError(400, "INVALID_PHONE", "Enter a valid 10-digit Indian mobile number.");
}

export function tryNormalizePhone(value) {
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores for the username.")
  .transform((value) => value.toLowerCase());

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(160, "Email address is too long.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[A-Za-z]/, "Password must include a letter.")
  .regex(/\d/, "Password must include a number.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your name.")
  .max(80, "Name must be 80 characters or fewer.");

const latitudeSchema = z.coerce.number().finite().min(-90).max(90);
const longitudeSchema = z.coerce.number().finite().min(-180).max(180);

export const registerSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  phone: z.string().trim().min(10, "Enter your mobile number."),
  password: passwordSchema
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email, username or phone number.").max(160),
  password: z.string().min(1, "Enter your password.").max(128)
});

export const profileUpdateSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  phone: z.string().trim().min(10, "Enter your mobile number.")
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(128),
  newPassword: passwordSchema
});

export const orderCreateSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(20)
      })
    )
    .min(1, "Your cart is empty.")
    .max(30, "Too many different items in one order."),
  address: z.object({
    label: z.enum(["Home", "Work", "Other"]).default("Home"),
    recipientName: nameSchema,
    contactPhone: z.string().trim().min(10, "Enter a contact number for delivery."),
    line: z.string().trim().min(10, "Enter your full delivery address.").max(400, "Address is too long."),
    notes: z.string().trim().max(300, "Delivery notes must be 300 characters or fewer.").optional().default(""),
    lat: latitudeSchema,
    lng: longitudeSchema
  })
});

export const adminOrderStatusSchema = z.object({
  status: z.enum(["confirmed", "packed", "out_for_delivery", "delivered", "cancelled"]),
  note: z.string().trim().max(300, "Note must be 300 characters or fewer.").optional().default("")
});

export const productInputSchema = z.object({
  name: z.string().trim().min(2, "Product name is required.").max(100),
  description: z.string().trim().min(10, "Add a short product description.").max(800),
  category: z.string().trim().min(2, "Category is required.").max(50),
  pricePaise: z.coerce.number().int().min(100, "Price must be at least ₹1.").max(10000000),
  unit: z.string().trim().min(1, "Add a unit such as 500 g.").max(40),
  imageUrl: z
    .string()
    .trim()
    .min(1, "Add an image URL.")
    .max(500)
    .refine((value) => value.startsWith("/") || /^https:\/\//i.test(value), "Image URL must be a local path or an HTTPS URL."),
  stock: z.coerce.number().int().min(0).max(100000),
  isFeatured: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true)
});

export const productPatchSchema = productInputSchema.partial().extend({
  stock: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional()
});

export const geoSchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema
});
