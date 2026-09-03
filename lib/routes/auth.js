const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const { ADMIN_EMAIL } = require("../config");
const { ah } = require("../async-handler");

const router = express.Router();

// POST /api/auth/register
router.post(
  "/register",
  ah(async (req, res) => {
    const { email, password, full_name } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "נדרשים אימייל וסיסמה" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל לפחות 8 תווים" });
    }

    await db.ensureReady();

    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "כבר קיים משתמש עם אימייל זה" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const isAdminEmail = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const plan = isAdminEmail ? "enterprise" : "free";

    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, full_name, plan, is_admin) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, email, password_hash, full_name || null, plan, isAdminEmail ? 1 : 0);

    const user = { id, email, plan, is_admin: isAdminEmail };
    const token = signToken(user);

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), id, "user_registered", email);

    res.status(201).json({ token, user });
  })
);

// POST /api/auth/login
router.post(
  "/login",
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "נדרשים אימייל וסיסמה" });
    }

    await db.ensureReady();

    const row = await db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!row) {
      return res.status(401).json({ error: "אימייל או סיסמה שגויים" });
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "אימייל או סיסמה שגויים" });
    }

    const user = { id: row.id, email: row.email, plan: row.plan, is_admin: !!row.is_admin };
    const token = signToken(user);

    res.json({ token, user });
  })
);

module.exports = router;
