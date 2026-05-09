import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import Datastore from "nedb-promises";
import { WebSocketServer } from "ws";
import { questions } from "./questions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
fs.mkdirSync(dataDir, { recursive: true });

const submissionsDb = Datastore.create({
  filename: path.join(dataDir, "iq-platform-submissions.db"),
  autoload: true,
  timestampData: true
});

await submissionsDb.ensureIndex({ fieldName: "id", unique: true });
await submissionsDb.ensureIndex({ fieldName: "createdAt" });

const existingSubmissions = await submissionsDb.find({});
let lastSubmissionId = existingSubmissions.reduce(
  (highest, row) => Math.max(highest, Number(row.id) || 0),
  0
);

function nextSubmissionId() {
  lastSubmissionId += 1;
  return lastSubmissionId;
}

function toPublicSubmission(row) {
  return {
    id: row.id,
    username: row.username,
    answers: row.answers,
    status: row.status,
    resultTitle: row.resultTitle || "",
    iqScore: row.iqScore || "",
    resultNotes: row.resultNotes || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function getSubmission(id) {
  const row = await submissionsDb.findOne({ id: Number(id) });
  return row ? toPublicSubmission(row) : null;
}

async function listSubmissions() {
  const rows = await submissionsDb.find({}).sort({ createdAt: -1, id: -1 });
  return rows.map(toPublicSubmission);
}

async function createSubmission(username, answers) {
  const now = new Date();
  const inserted = await submissionsDb.insert({
    id: nextSubmissionId(),
    username,
    answers,
    status: "pending",
    resultTitle: "",
    iqScore: "",
    resultNotes: "",
    createdAt: now,
    updatedAt: now
  });
  return toPublicSubmission(inserted);
}

async function saveResult(id, result) {
  await submissionsDb.update(
    { id: Number(id) },
    {
      $set: {
        status: "reviewed",
        resultTitle: result.resultTitle,
        iqScore: result.iqScore,
        resultNotes: result.resultNotes,
        updatedAt: new Date()
      }
    }
  );
  return getSubmission(id);
}

const app = express();
const port = Number(process.env.PORT || 5000);
const adminId = process.env.ADMIN_ID || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const sessions = new Set();
const sockets = new Set();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Admin login required." });
  }
  return next();
}

function broadcast(predicate, payload) {
  const message = JSON.stringify(payload);
  for (const client of sockets) {
    if (client.readyState === client.OPEN && predicate(client)) {
      client.send(message);
    }
  }
}

function notifyAdmins(payload) {
  broadcast((client) => client.role === "admin", payload);
}

function notifyUser(submissionId, payload) {
  broadcast((client) => client.submissionId === Number(submissionId), payload);
}

app.get("/api/questions", (_req, res) => {
  res.json({ questions });
});

app.post("/api/submissions", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const answers = req.body.answers || {};

  if (!username || username.length < 2) {
    return res.status(400).json({ error: "Username must be at least 2 characters." });
  }

  const questionIds = new Set(questions.map((question) => String(question.id)));
  const answeredIds = Object.keys(answers);
  if (answeredIds.length !== questions.length || answeredIds.some((id) => !questionIds.has(id))) {
    return res.status(400).json({ error: "Please answer all 10 questions." });
  }

  const submission = await createSubmission(username, answers);

  notifyAdmins({ type: "submission:new", submission });
  res.status(201).json({ submission });
});

app.get("/api/submissions/:id", async (req, res) => {
  const submission = await getSubmission(req.params.id);
  if (!submission) {
    return res.status(404).json({ error: "Submission not found." });
  }

  res.json({ submission });
});

app.post("/api/admin/login", (req, res) => {
  if (req.body.adminId !== adminId || req.body.password !== adminPassword) {
    return res.status(401).json({ error: "Invalid admin ID or password." });
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.add(token);
  res.json({ token, adminId });
});

app.get("/api/admin/submissions", requireAdmin, async (_req, res) => {
  res.json({ submissions: await listSubmissions() });
});

app.patch("/api/admin/submissions/:id/result", requireAdmin, async (req, res) => {
  const existing = await getSubmission(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Submission not found." });
  }

  const resultTitle = String(req.body.resultTitle || "").trim();
  const iqScore = String(req.body.iqScore || "").trim();
  const resultNotes = String(req.body.resultNotes || "").trim();

  if (!resultTitle || !iqScore) {
    return res.status(400).json({ error: "Result title and IQ score are required." });
  }

  const submission = await saveResult(req.params.id, { resultTitle, iqScore, resultNotes });
  notifyAdmins({ type: "submission:updated", submission });
  notifyUser(req.params.id, { type: "result:ready", submission });
  res.json({ submission });
});

const clientDist = path.join(rootDir, "dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

const server = app.listen(port, () => {
  console.log(`IQ platform server running on http://localhost:${port}`);
  console.log(`Admin login: ${adminId} / ${adminPassword}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  sockets.add(socket);
  socket.role = "guest";

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === "subscribe:admin" && sessions.has(message.token)) {
      socket.role = "admin";
      socket.send(JSON.stringify({ type: "connected", role: "admin" }));
    }

    if (message.type === "subscribe:user" && message.submissionId) {
      socket.role = "user";
      socket.submissionId = Number(message.submissionId);
      socket.send(JSON.stringify({ type: "connected", role: "user" }));
    }
  });

  socket.on("close", () => sockets.delete(socket));
});
