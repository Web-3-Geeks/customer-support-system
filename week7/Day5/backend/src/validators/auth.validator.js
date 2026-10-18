const { z } = require("zod");

const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ error: "Name is required" })
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name must be at most 50 characters"),
    email: z
      .string({ error: "Email is required" })
      .trim()
      .toLowerCase()
      .pipe(z.email("Invalid email address")),
    password: z
      .string({ error: "Password is required" })
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ error: "Email is required" })
      .trim()
      .toLowerCase()
      .pipe(z.email("Invalid email address")),
    password: z.string({ error: "Password is required" }).min(1, "Password is required"),
  }),
});

module.exports = { registerSchema, loginSchema };
