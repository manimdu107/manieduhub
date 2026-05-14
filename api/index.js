/**
 * MANIEDUHUB - All-in-One Vercel API
 * This file contains the Express server and the in-memory state store.
 */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));

// --- IN-MEMORY STATE STORE ---
let state = {
  students: [],
  content: {
    library: null,
    quizzes: null,
    leaderboards: {},
    notifications: [],
    videoLink: null,
    aboutData: null,
    aiLinks: null,
    subjects: null,
  },
};

function sanitizeStudent(s) {
  const { passHash, pass, ...rest } = s;
  return rest;
}

const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid or missing admin key" });
  }
  next();
}

// --- API ROUTES ---

app.get("/api/config", (req, res) => {
  res.json({
    students: state.students.map(sanitizeStudent),
    ...state.content,
  });
});

app.post("/api/register", async (req, res) => {
  const { name, email, pass, profileImage } = req.body || {};
  if (!name || !email || !pass) return res.status(400).json({ ok: false, error: "Missing fields" });
  
  const em = String(email).trim().toLowerCase();
  if (state.students.some((s) => s.email === em)) {
    return res.status(409).json({ ok: false, error: "Account already exists" });
  }

  const passHash = await bcrypt.hash(String(pass), 10);
  const student = { name, email: em, passHash, profileImage, blocked: false };
  state.students.push(student);
  res.status(201).json({ ok: true, user: sanitizeStudent(student) });
});

app.post("/api/login", async (req, res) => {
  const { email, pass } = req.body || {};
  const em = String(email).trim().toLowerCase();
  const student = state.students.find((s) => s.email === em);
  if (!student) return res.status(401).json({ ok: false, error: "Invalid credentials" });

  const ok = await bcrypt.compare(String(pass), student.passHash);
  if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });
  
  res.json({ ok: true, user: sanitizeStudent(student) });
});

app.post("/api/leaderboard/submit", (req, res) => {
  const { lid, leaderboard } = req.body || {};
  if (lid && Array.isArray(leaderboard)) {
    state.content.leaderboards[lid] = leaderboard.slice(0, 50);
  }
  res.json({ ok: true, leaderboards: state.content.leaderboards });
});

app.put("/api/admin/content", adminAuth, (req, res) => {
  const body = req.body || {};
  const keys = ["library", "quizzes", "leaderboards", "notifications", "videoLink", "aboutData", "aiLinks", "subjects"];
  for (const k of keys) {
    if (body[k] !== undefined) state.content[k] = body[k];
  }
  res.json({ ok: true, content: state.content });
});

// Fallback for everything else
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ ok: false, error: "API route not found" });
  }
  // This part is handled by Vercel static serving if configured correctly
  res.status(404).send("Not found");
});

module.exports = app;
