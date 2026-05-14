/**
 * MANIEDUHUB API — Express + SQLite.
 * Config: copy .env.example → .env (project root). Set ADMIN_KEY for production.
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { initStore, readState, writeState, dbPath } = require("./state-store");

initStore();

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const IS_PROD = process.env.NODE_ENV === "production";

function sanitizeStudent(s) {
  const { passHash, pass, ...rest } = s;
  return rest;
}

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid or missing admin key" });
  }
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));

app.use((req, _res, next) => {
  req._t0 = Date.now();
  next();
});

app.get("/api", (_req, res) => {
  res.json({
    ok: true,
    service: "manieduhub-api",
    endpoints: [
      "GET  /api/health",
      "GET  /api",
      "GET  /api/config",
      "POST /api/register",
      "POST /api/login",
      "POST /api/leaderboard/submit",
      "PUT  /api/admin/content  (header: X-Admin-Key)",
      "PATCH /api/admin/student",
      "DELETE /api/admin/student/:email",
      "POST /api/admin/reset-password",
    ],
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "manieduhub-api",
    storage: "sqlite",
    dbPath,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get("/api/config", (_req, res) => {
  const state = readState();
  res.json({
    students: state.students.map(sanitizeStudent),
    ...state.content,
  });
});

app.post(
  "/api/register",
  asyncHandler(async (req, res) => {
    const { name, email, pass, profileImage } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: "Name is required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Valid email is required" });
    }
    if (!pass || String(pass).length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }
    const state = readState();
    const em = String(email).trim().toLowerCase();
    if (state.students.some((s) => s.email === em)) {
      return res.status(409).json({ ok: false, error: "Account already exists" });
    }
    const passHash = await bcrypt.hash(String(pass), 10);
    const student = {
      name: String(name).trim(),
      email: em,
      passHash,
      profileImage: typeof profileImage === "string" ? profileImage.slice(0, 2000) : "",
      blocked: false,
    };
    state.students.push(student);
    writeState(state);
    res.status(201).json({ ok: true, user: sanitizeStudent(student) });
  })
);

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const { email, pass } = req.body || {};
    if (!email || !pass) {
      return res.status(400).json({ ok: false, error: "Email and password required" });
    }
    const state = readState();
    const em = String(email).trim().toLowerCase();
    const student = state.students.find((s) => s.email === em);
    if (!student) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(String(pass), student.passHash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }
    if (student.blocked) {
      return res.status(403).json({ ok: false, error: "Account blocked" });
    }
    res.json({ ok: true, user: sanitizeStudent(student) });
  })
);

const MAX_LEADERBOARD_ROWS = 50;

app.post("/api/leaderboard/submit", (req, res) => {
  const { lid, leaderboard } = req.body || {};
  if (!lid || typeof lid !== "string" || lid.length > 200) {
    return res.status(400).json({ ok: false, error: "lid must be a non-empty string (max 200 chars)" });
  }
  if (!Array.isArray(leaderboard)) {
    return res.status(400).json({ ok: false, error: "leaderboard must be an array" });
  }
  const trimmed = leaderboard.slice(0, MAX_LEADERBOARD_ROWS);
  const state = readState();
  const next = { ...state.content.leaderboards, [lid]: trimmed };
  state.content.leaderboards = next;
  writeState(state);
  res.json({ ok: true, leaderboards: next });
});

app.put(
  "/api/admin/content",
  adminAuth,
  asyncHandler(async (req, res) => {
    const state = readState();
    const body = req.body || {};
    const keys = ["library", "quizzes", "leaderboards", "notifications", "videoLink", "aboutData", "aiLinks", "subjects"];
    for (const k of keys) {
      if (body[k] !== undefined) state.content[k] = body[k];
    }
    writeState(state);
    res.json({ ok: true, content: state.content });
  })
);

app.patch(
  "/api/admin/student",
  adminAuth,
  asyncHandler(async (req, res) => {
    const { email, blocked } = req.body || {};
    if (!email) {
      return res.status(400).json({ ok: false, error: "email required" });
    }
    const state = readState();
    const em = String(email).trim().toLowerCase();
    const idx = state.students.findIndex((s) => s.email === em);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Student not found" });
    }
    if (typeof blocked === "boolean") state.students[idx].blocked = blocked;
    writeState(state);
    res.json({ ok: true, students: state.students.map(sanitizeStudent) });
  })
);

app.delete(
  "/api/admin/student/:email",
  adminAuth,
  asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email || "");
    const state = readState();
    const em = email.trim().toLowerCase();
    state.students = state.students.filter((s) => s.email !== em);
    writeState(state);
    res.json({ ok: true, students: state.students.map(sanitizeStudent) });
  })
);

app.post(
  "/api/admin/reset-password",
  adminAuth,
  asyncHandler(async (req, res) => {
    const { email, newPass } = req.body || {};
    if (!email || !newPass) {
      return res.status(400).json({ ok: false, error: "email and newPass required" });
    }
    if (String(newPass).length < 6) {
      return res.status(400).json({ ok: false, error: "newPass must be at least 6 characters" });
    }
    const state = readState();
    const em = String(email).trim().toLowerCase();
    const idx = state.students.findIndex((s) => s.email === em);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Student not found" });
    }
    state.students[idx].passHash = await bcrypt.hash(String(newPass), 10);
    writeState(state);
    res.json({ ok: true });
  })
);

/** Unknown /api/* → JSON 404 (do not send index.html for bad API paths). */
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ ok: false, error: "API route not found", path: req.originalUrl });
  }
  next();
});

app.use(express.static(ROOT));

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "Server error", message: IS_PROD ? undefined : String(err.message) });
});

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MANIEDUHUB API  http://localhost:${PORT}`);
    console.log(`SQLite          ${dbPath}`);
    console.log(`API index       http://localhost:${PORT}/api`);
    if (IS_PROD && ADMIN_KEY === "admin123") {
      console.warn("WARNING: ADMIN_KEY is still default. Set ADMIN_KEY in .env or host environment.");
    }
  });
}

module.exports = app;
