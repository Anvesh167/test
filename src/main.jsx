import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Brain,
  CheckCircle2,
  ClipboardList,
  Eye,
  Lock,
  LogIn,
  Send,
  ShieldCheck,
  UserRound,
  Wifi,
  Camera,
  AlertTriangle,
  Zap
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const WS_URL = API_URL.replace(/^http/, "ws");

function App() {
  const [view, setView] = useState("test");

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Brain size={26} />
          <div>
            <strong>IQ Review Platform</strong>
            <span>Admin-controlled professional assessment</span>
          </div>
        </div>
        {view === "test" && (
          <div className="camera-indicator">
            <div className="recording-dot" />
            <Camera size={14} />
            <span>Eye-tracking Active</span>
          </div>
        )}
        <nav className="nav-tabs" aria-label="Application flows">
          <button className={view === "test" ? "active" : ""} onClick={() => setView("test")}>
            <UserRound size={18} />
            Test taker
          </button>
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>
            <ShieldCheck size={18} />
            Admin
          </button>
        </nav>
      </header>
      {view === "test" ? <TestTakerFlow /> : <AdminFlow />}
    </div>
  );
}

function TestTakerFlow() {
  const [questions, setQuestions] = useState([]);
  const [username, setUsername] = useState("");
  const [answers, setAnswers] = useState({});
  const [submission, setSubmission] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/questions`)
      .then((response) => response.json())
      .then((data) => setQuestions(data.questions))
      .catch(() => setError("Could not load questions. Please check the server."));
  }, []);

  useEffect(() => {
    if (!submission || submission.status === "reviewed") return;

    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe:user", submissionId: submission.id }));
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "result:ready") {
        setSubmission(message.submission);
      }
    });
    return () => ws.close();
  }, [submission]);

  const [agreed, setAgreed] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const answeredCount = Object.keys(answers).length;
  const isComplete = username.trim().length >= 2 && answeredCount === questions.length && agreed;

  useEffect(() => {
    if (submission && submission.status !== "reviewed") {
      const interval = setInterval(() => {
        setLoadingStep((s) => (s < 3 ? s + 1 : s));
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [submission]);

  async function submitTest(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, answers })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmission(data.submission);
    } catch (err) {
      setError(err.message || "Could not submit test.");
    } finally {
      setLoading(false);
    }
  }

  if (submission?.status === "reviewed") {
    return <ResultScreen submission={submission} onRestart={() => {
      setUsername("");
      setAnswers({});
      setSubmission(null);
    }} />;
  }

  const loadingMessages = [
    "Analyzing cognitive response times...",
    "Processing facial micro-expressions...",
    "Correlating data with normative IQ models...",
    "Awaiting final professional sign-off..."
  ];

  if (submission) {
    return (
      <main className="center-grid">
        <section className="panel waiting-panel">
          <Wifi className="scanning-icon" size={34} />
          <h1>{loadingMessages[loadingStep]}</h1>
          <p>
            Your username <strong>{submission.username}</strong> is visible only in the admin page.
            <strong> Do not look away from the camera.</strong> The final result will appear here automatically.
          </p>
          <div className="pulse-row">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <section className="intro">
        <div className="eyebrow"><ClipboardList size={16} /> Professional 10-question IQ test</div>
        <h1>Answer the assessment, then wait for the admin result.</h1>
        <p>
          The app records your answers for admin review, but it does not calculate your result.
          Only the admin decides and publishes the final score.
        </p>
      </section>

      <form className="panel test-panel" onSubmit={submitTest}>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
            maxLength={40}
          />
        </label>

        <div className="progress">
          <span>{answeredCount} / {questions.length || 10} answered</span>
          <div><i style={{ width: `${(answeredCount / Math.max(questions.length, 1)) * 100}%` }} /></div>
        </div>

        <div className="disclaimer-box">
          <AlertTriangle size={18} />
          <label className="checkbox-field">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to continuous webcam facial micro-expression analysis and eye-tracking during this test.</span>
          </label>
        </div>

        <div className="question-list">
          {questions.map((question) => (
            <fieldset className="question" key={question.id}>
              <legend>{question.id}. {question.prompt}</legend>
              <div className="option-grid">
                {question.options.map((option) => (
                  <label className={answers[question.id] === option ? "option selected" : "option"} key={option}>
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={option}
                      checked={answers[question.id] === option}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {error && <div className="error">{error}</div>}
        <button className="primary-action" disabled={!isComplete || loading}>
          <Send size={18} />
          {loading ? "Submitting..." : "Submit for admin review"}
        </button>
      </form>
    </main>
  );
}

function ResultScreen({ submission, onRestart }) {
  return (
    <main className="center-grid">
      <section className="panel result-panel">
        <CheckCircle2 size={38} />
        <p className="kicker">Admin result published</p>
        <h1>{submission.resultTitle}</h1>
        <div className="score">{submission.iqScore}</div>
        {submission.resultNotes && <p>{submission.resultNotes}</p>}
        <button className="secondary-action" onClick={onRestart}>Take another test</button>
      </section>
    </main>
  );
}

function AdminFlow() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [credentials, setCredentials] = useState({ adminId: "", password: "" });
  const [submissions, setSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) || submissions[0],
    [submissions, selectedId]
  );

  useEffect(() => {
    if (!token) return;
    loadSubmissions(token).catch((err) => {
      if (err.status === 401) {
        localStorage.removeItem("adminToken");
        setToken("");
        setSubmissions([]);
        setSelectedId(null);
      }
      setError(err.message);
    });

    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe:admin", token }));
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "submission:new") {
        setSubmissions((current) => [message.submission, ...current]);
      }
      if (message.type === "submission:updated") {
        setSubmissions((current) =>
          current.map((submission) => submission.id === message.submission.id ? message.submission : submission)
        );
      }
    });
    return () => ws.close();
  }, [token]);

  async function loadSubmissions(activeToken = token) {
    const response = await fetch(`${API_URL}/api/admin/submissions`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error);
      error.status = response.status;
      throw error;
    }
    setSubmissions(data.submissions);
    setSelectedId((current) => current || data.submissions[0]?.id || null);
  }

  async function login(event) {
    event.preventDefault();
    setError("");
    const response = await fetch(`${API_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    localStorage.setItem("adminToken", data.token);
    setToken(data.token);
  }

  function logout() {
    localStorage.removeItem("adminToken");
    setToken("");
    setSubmissions([]);
    setSelectedId(null);
  }

  if (!token) {
    return (
      <main className="center-grid">
        <form className="panel login-panel" onSubmit={login}>
          <Lock size={34} />
          <h1>Admin sign in</h1>
          <label className="field">
            <span>Admin ID</span>
            <input value={credentials.adminId} onChange={(event) => setCredentials({ ...credentials, adminId: event.target.value })} placeholder="admin" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} placeholder="admin123" />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary-action">
            <LogIn size={18} />
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside className="panel queue">
        <div className="panel-head">
          <div>
            <h1>Review queue</h1>
            <span>{submissions.length} submissions</span>
          </div>
          <button className="icon-button" onClick={logout} title="Log out">
            <Lock size={18} />
          </button>
        </div>
        <div className="submission-list">
          {submissions.map((submission) => (
            <button
              key={submission.id}
              className={selected?.id === submission.id ? "submission active" : "submission"}
              onClick={() => setSelectedId(submission.id)}
            >
              <span>{submission.username}</span>
              <small>{submission.status === "reviewed" ? "Result sent" : "Pending"}</small>
            </button>
          ))}
          {!submissions.length && <p className="empty">No submissions yet.</p>}
        </div>
      </aside>

      <section className="panel review-panel">
        {selected ? (
          <ReviewSubmission token={token} submission={selected} onSaved={(updated) => {
            setSubmissions((current) => current.map((item) => item.id === updated.id ? updated : item));
          }} />
        ) : (
          <div className="empty-state">
            <Eye size={32} />
            <p>Waiting for test takers to submit.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ReviewSubmission({ token, submission, onSaved }) {
  const [form, setForm] = useState({
    resultTitle: submission.resultTitle || "Professional IQ Review",
    iqScore: submission.iqScore || "",
    resultNotes: submission.resultNotes || ""
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      resultTitle: submission.resultTitle || "Professional IQ Review",
      iqScore: submission.iqScore || "",
      resultNotes: submission.resultNotes || ""
    });
    setMessage("");
  }, [submission.id]);

  async function publishResult(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API_URL}/api/admin/submissions/${submission.id}/result`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    onSaved(data.submission);
    setMessage("Result published to the test taker.");
  }

  function applyPreset(title, score, notes) {
    setForm({ resultTitle: title, iqScore: score, resultNotes: notes });
  }

  return (
    <div className="review-grid">
      <div>
        <p className="kicker">Username visible to admin only</p>
        <h1>{submission.username}</h1>
        
        <div className="presets-container">
          <p className="kicker"><Zap size={14} /> Quick Prank Presets</p>
          <div className="presets-grid">
            <button type="button" className="preset-btn" onClick={() => applyPreset("Literal Potato", "IQ: 12", "Brain activity indistinguishable from a root vegetable. Synaptic response virtually non-existent.")}>🥔 Potato (12)</button>
            <button type="button" className="preset-btn" onClick={() => applyPreset("Sentient Goldfish", "IQ: 3", "Memory span < 2 seconds. Easily distracted by shiny objects.")}>🐟 Goldfish (3)</button>
            <button type="button" className="preset-btn" onClick={() => applyPreset("Neanderthal", "IQ: 35", "Unga bunga. Requires assistance tying shoes.")}>🦍 Caveman (35)</button>
            <button type="button" className="preset-btn" onClick={() => applyPreset("Room Temperature", "IQ: 72", "If your IQ were the weather, you'd need a light jacket.")}>🌡️ Room Temp (72)</button>
          </div>
        </div>

        <div className="answers">
          {Object.entries(submission.answers).map(([questionId, answer]) => (
            <div className="answer" key={questionId}>
              <span>Q{questionId}</span>
              <p>{answer}</p>
            </div>
          ))}
        </div>
      </div>
      <form className="result-form" onSubmit={publishResult}>
        <label className="field">
          <span>Result title</span>
          <input value={form.resultTitle} onChange={(event) => setForm({ ...form, resultTitle: event.target.value })} />
        </label>
        <label className="field">
          <span>Admin-determined IQ score</span>
          <input value={form.iqScore} onChange={(event) => setForm({ ...form, iqScore: event.target.value })} placeholder="Example: IQ 132" />
        </label>
        <label className="field">
          <span>Notes shown to user</span>
          <textarea value={form.resultNotes} onChange={(event) => setForm({ ...form, resultNotes: event.target.value })} placeholder="Optional result explanation" />
        </label>
        {message && <div className={message.includes("published") ? "success" : "error"}>{message}</div>}
        <button className="primary-action">
          <Send size={18} />
          Publish admin result
        </button>
      </form>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
