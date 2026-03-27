import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      pseudonym: user.pseudonym,
      isAdmin: user.isAdmin,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching user");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch user" });
  }
});

router.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    res.status(400).json({ error: "validation_error", message: "Email, password and display name are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "validation_error", message: "Password must be at least 8 characters" });
    return;
  }

  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      isAdmin: false,
      status: "active",
    }).returning();

    req.session.userId = user.id;
    req.session.isAdmin = user.isAdmin;

    res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      pseudonym: user.pseudonym,
      isAdmin: user.isAdmin,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error registering user");
    res.status(500).json({ error: "internal_error", message: "Failed to register" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "validation_error", message: "Email and password are required" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

    if (!user) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ error: "forbidden", message: "Account is not active" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
      return;
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.isAdmin;

    req.session.save((err) => {
      if (err) {
        req.log.error({ err }, "Error saving session");
        res.status(500).json({ error: "internal_error", message: "Failed to create session" });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        pseudonym: user.pseudonym,
        isAdmin: user.isAdmin,
        status: user.status,
        createdAt: user.createdAt,
      });
    });
  } catch (err) {
    req.log.error({ err }, "Error logging in");
    res.status(500).json({ error: "internal_error", message: "Failed to login" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out successfully" });
  });
});

export default router;
