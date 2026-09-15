# AssemblyAI integration — handoff from the AssemblyAI Agent

_Exported 2026-09-15. This folder contains a scoping conversation with AssemblyAI's onboarding agent and the starter code it produced._

## Instructions for the coding agent picking this up

1. Read the conversation below — it has the use case, the decisions already made, and working starter code (shipped as the files listed under **Files**).
2. Ground yourself in AssemblyAI's live docs before writing code — training data goes stale fast here:
   - Docs MCP server (streamable HTTP, no auth needed): `https://www.assemblyai.com/docs/mcp` — semantic docs search + full-page reads + OpenAPI queries.
   - Or install the official agent skill: `npx skills add AssemblyAI/assemblyai-skill`
3. Use the official SDKs (`pip install assemblyai==1.5.4` / `npm install assemblyai@4.41.1`). The API key comes from the `ASSEMBLYAI_API_KEY` environment variable (see `.env.example`). The auth header is the raw key — **no `Bearer` prefix** (except the Voice Agent API, which does use Bearer).
4. Continue from where the conversation leaves off.

## Files

- `package.json`
- `tsconfig.json`
- `next-env.d`
- `snippet-4.txt`
- `env.example`
- `route.ts`
- `publish-agent.ts`
- `pcm-processor.js`
- `types.ts`
- `export.ts`
- `voice-session.ts`
- `page.tsx`
- `layout.tsx`
- `globals.css`

## The conversation

### You

# AI Voice Intake Scribe — Build Specification

**Built for:** AssemblyAI Voice Agent Hackathon (lablab.ai), Sep 1–30, 2026
**Core tech:** AssemblyAI Voice Agent API (real-time, browser-based) + AssemblyAI LLM Gateway

---

## 0. How to use this document

You are building the application described below. Read this entire spec before writing any code.
Build the MVP scope (Section 2) completely and working end-to-end before touching any stretch goal.
Where a section says "confirm against live docs," treat the value given as a best-effort placeholder, not a guaranteed-correct constant — check AssemblyAI's current docs at `https://www.assemblyai.com/docs/voice-agents` before relying on it in production. Do not silently invent API fields not described here; if something is genuinely unclear, ask rather than guess.

---

## 1. Product summary

A browser-only web app where a patient has a short spoken conversation with an AI voice agent before a clinical visit. The agent asks about the reason for the visit, current symptoms, and current medications. While talking, it flags medications/conditions worth a clinician's attention and notes follow-up actions. At the end of the call it drafts a structured SOAP note. The clinician reviews and downloads the resulting transcript + note + checklist — nothing is stored outside the session unless explicitly exported.

This is **not** a diagnostic tool. The agent gathers information; it never gives medical advice, a diagnosis, or medication guidance. Every AI-drafted output (SOAP note, flagged entities, action items) is presented as a **suggestion for clinician review**, never as a finished clinical record.

---

## 2. Scope

### MVP (must work end-to-end, this is the demo)
- Patient opens a browser tab, clicks "Start," and has a live voice conversation with the agent.
- Agent speaks first with a greeting, asks intake questions one at a time, listens, responds.
- Live captions show on screen as both sides speak.
- Three tools fire during the call: flag a drug/condition mention, log a follow-up action item, generate the SOAP note at the end.
- Call ends cleanly (explicit end button + tab-close handling).
- Summary screen shows: full transcript, SOAP note (editable), action item checklist (checkable).
- One-click download of the whole thing as a file, generated client-side, no server round trip for that step.

### Stretch (only after MVP works)
- Post-call "safety net" pass: re-run the full session timeline through the LLM Gateway to catch anything the live tool calls missed, and reconcile it with the live-drafted note.
- Multi-language support (verify what's actually configurable at the Voice Agent layer before promising this).
- Phone deployment via Twilio (documented by AssemblyAI but out of scope unless MVP is solid with time to spare).
- Bluejay simulated-caller testing for pre-demo QA.

### Explicit non-goals (do not build these)
- No multichannel / dual-mic capture — that was relevant to a pre-recorded pipeline, not a live single-stream voice agent. Do not implement it.
- No real patient data. All testing uses synthetic/scripted encounters.
- No actual clinical decision support (drug interaction checking, dosage validation, diagnosis suggestions). The agent collects information; it does not evaluate it clinically.

---

## 3. End-to-end user flow

1. Patient opens the web app (desktop or mobile browser, Chrome/Edge recommended).
2. Clicks "Start conversation." Browser requests mic permission.
3. Backend mints a short-lived token; browser opens a WebSocket to AssemblyAI's Voice Agent API using that token.
4. Agent greets the patient and begins asking intake questions.
5. As the patient answers, live captions appear for both sides. When the patient mentions a medication/condition, a small "flagged" indicator appears in near-real time. When something implies a follow-up (a referral, a test, a prescription), it appears in a running checklist.
6. Near the end, the agent asks a final question or two, then calls the tool that produces a structured SOAP note, thanks the patient, and the call ends (agent-initiated or patient clicks "End call").
7. Summary screen renders: Transcript tab, SOAP Note tab (editable text areas for S/O/A/P), Action Items tab (checkboxes).
8. Clinician reviews, edits anything needed, and clicks "Download" — a file is generated in the browser and saved locally. No further server interaction required for the download itself.

---

## 4. Architecture

```
Browser (mic + speaker + UI)
   |  WebSocket wss://agents.assemblyai.com/v1/ws?token=...
   v
AssemblyAI Voice Agent API (STT + LLM + TTS + turn-taking, one connection)
   |  HTTP tool calls (server-to-server)
   v
Your backend (Node.js)
   - GET /api/voice-token       -> mints token from AssemblyAI
   - POST /api/tools/*          -> webhook targets AssemblyAI calls during the conversation
   - GET /api/sessions/:id      -> proxies session artifacts after the call (needs your API key server-side)
   - POST /api/sessions/:id/summarize (stretch) -> LLM Gateway safety-net pass
   - In-memory or lightweight DB session store, keyed by session id
```

Nothing here needs a database for the MVP — an in-memory object keyed by session id, held for the lifetime of the process, is sufficient for a hackathon demo. Persist to a real store only if you have time left over.

---

## 5. Tech stack

- **Frontend:** Plain HTML/JS or React — either is fine; React only buys you something if the UI has enough state to justify it (it does, given three tabs and live-updating lists, so React/Next.js is the default recommendation).
- **Backend:** Node.js 18+, Express or Next.js API routes in the same repo as the frontend.
- **Hosting:** Vercel (accepted by the hackathon's demo platform list, and Next.js deploys to it with no extra config). Render is the named alternative if you need long-lived server processes.
- **Language:** TypeScript preferred, plain JavaScript acceptable given the timeline.
- **No database required for MVP.** Add one only if you extend past the hackathon scope.

---

## 6. Environment & prerequisites

```bash
# .env
ASSEMBLYAI_API_KEY=your_key_here
AGENT_ID=          # filled in after you run the one-time agent-creation script (Section 9)
PUBLIC_BASE_URL=   # your deployed backend's public HTTPS URL, or an ngrok URL for local dev
```

Prerequisites to set up before writing any code:

1. An AssemblyAI account with a **credit card on file** — required for both the Voice Agent API and the LLM Gateway. Confirm this in the AssemblyAI dashboard before budgeting build time around it.
2. Node 18+ installed.
3. A tunneling tool (ngrok or equivalent) for local development. **AssemblyAI's HTTP tools require your webhook endpoints to be reachable over public HTTPS** — no localhost, no private/loopback IPs. You cannot test the tool-calling flow against `localhost:3000` directly; tunnel it first.

---

## 7. Backend spec

### 7.1 One-time setup script — create the stored agent

Not user-facing. Run once (or whenever you change the agent's config) to create/update the agent on AssemblyAI's side:

```bash
curl -X POST https://agents.assemblyai.com/v1/agents \
  -H "Authorization: $ASSEMBLYAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @agent-config.json
```

Save the returned `id` as `AGENT_ID` in your environment. To change the config later, `PUT https://agents.assemblyai.com/v1/agents/{id}` with only the fields that changed (this replaces `tools` and other array fields wholesale, not a merge — resend the full array).

The full `agent-config.json` body is in Section 9.

### 7.2 `GET /api/voice-token`

Mints a short-lived token so the browser never sees your API key.

```javascript
// server/routes/voice-token.js
import express from "express";
const router = express.Router();

router.get("/voice-token", async (_req, res) => {
  const url = new URL("https://agents.assemblyai.com/v1/token");
  url.searchParams.set("expires_in_seconds", "120");        // redemption window, not session length
  url.searchParams.set("max_session_duration_seconds", "1800"); // hard cap on call length, tune as needed

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
  });
  if (!response.ok) return res.status(response.status).send(await response.text());

  const { token } = await response.json();
  res.json({ token });
});

export default router;
```

Notes:
- `expires_in_seconds` must be 1–600 (this is how long the browser has to *open* the WebSocket after minting, not the call length).
- `max_session_duration_seconds` must be 60–10800 (this is the actual call length cap).
- Mint a fresh token for every connection attempt, including reconnects.

### 7.3 Tool webhooks — `POST /api/tools/flag-entity`, `/api/tools/add-followup`, `/api/tools/generate-soap`

These are the URLs you put in the `http.url` field of each tool definition (Section 10). AssemblyAI calls them directly when the model invokes the corresponding tool — your frontend never sees this exchange.

```javascript
// server/routes/tools.js
import express from "express";
const router = express.Router();

// naive in-memory store; replace with a real DB if you have time
const sessions = new Map();
function getSession(id) {
  if (!sessions.has(id)) sessions.set(id, { entities: [], actionItems: [], soapNote: null });
  return sessions.get(id);
}

router.post("/tools/flag-entity", (req, res) => {
  // CONFIRM AGAINST LIVE PAYLOAD: verify which field identifies the session
  // (session_id / call_id / similar) by inspecting an actual webhook request in testing,
  // and against AssemblyAI's HTTP tools reference before shipping.
  const { entity_type, text, note, session_id } = req.body;
  getSession(session_id).entities.push({ entity_type, text, note, at: new Date().toISOString() });
  res.json({ ok: true });
});

router.post("/tools/add-followup", (req, res) => {
  const { item, session_id } = req.body;
  getSession(session_id).actionItems.push({ item, done: false });
  res.json({ ok: true });
});

router.post("/tools/generate-soap", (req, res) => {
  const { subjective, objective, assessment, plan, session_id } = req.body;
  getSession(session_id).soapNote = { subjective, objective, assessment, plan };
  res.json({ ok: true });
});

router.get("/tools/session/:id", (req, res) => {
  res.json(getSession(req.params.id));
});

export default router;
```

**Open item, flagged deliberately:** the exact request shape AssemblyAI sends to an HTTP tool endpoint (specifically, which field identifies the originating call/session) is not confirmed in the research behind this spec. Before wiring the frontend to poll `/api/tools/session/:id`, make one real test call, log `req.body` in full, and adjust the field name accordingly. Don't guess past this point — verify it against a live payload.

A simpler fallback if that field turns out to be missing or unreliable: have the frontend hold entity/action-item state in memory from the tool-call side effects it can observe some other way (e.g., if you add a lightweight client-side tool purely for UI feedback, alongside the HTTP tool doing the actual persistence), or single-tenant the demo (one call at a time, one global session slot) for the hackathon, which sidesteps the correlation problem entirely and is a completely reasonable simplification for a demo.

### 7.4 `GET /api/sessions/:id` (stretch)

Proxies AssemblyAI's session lookup (needs your API key, so it can't be called from the browser directly):

```javascript
router.get("/sessions/:id", async (req, res) => {
  const response = await fetch(`https://agents.assemblyai.com/v1/sessions/${req.params.id}`, {
    headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
  });
  const data = await response.json();
  res.json(data); // includes artifacts: audio (OGG/Opus), timeline (JSON), metadata
});
```

### 7.5 `POST /api/sessions/:id/summarize` (stretch — safety net)

Fetches the session's `timeline` artifact, sends it to the LLM Gateway, and returns a reconciled SOAP note + entity list + action items as a backstop in case a live tool call was missed mid-conversation.

```javascript
router.post("/sessions/:id/summarize", async (req, res) => {
  const session = await fetch(`https://agents.assemblyai.com/v1/sessions/${req.params.id}`, {
    headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
  }).then(r => r.json());

  const timelineUrl = session.artifacts.find(a => a.type === "timeline")?.url;
  const timeline = await fetch(timelineUrl).then(r => r.json());

  const prompt = `Here is a clinical intake conversation timeline as JSON: ${JSON.stringify(timeline)}.
Return strict JSON only, no prose, with this shape:
{"soap_note": {"subjective": "", "objective": "", "assessment": "", "plan": ""},
 "flagged_entities": [{"entity_type": "drug|medical_condition|injury", "text": ""}],
 "action_items": [""]}`;

  const llmResponse = await fetch("https://llm-gateway.assemblyai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    }),
  }).then(r => r.json());

  const content = llmResponse.choices[0].message.content;
  res.json(JSON.parse(content.replace(/```json|```/g, "").trim()));
});
```

---

## 8. Frontend spec

### 8.1 Screens

- **Start screen** — app name, one-line description, "Start conversation" button, mic-permission prompt handled on click (must be inside a user-gesture handler; browsers block `getUserMedia`/`AudioContext` otherwise).
- **Live call screen** — connection status, running live-caption feed (`transcript.user` / `transcript.agent`), a small live list of flagged entities as they arrive, a small running action-item list, an "End call" button.
- **Summary screen** — three tabs:
  - *Transcript* — full call transcript, read-only.
  - *SOAP Note* — four editable text areas (Subjective/Objective/Assessment/Plan), pre-filled from the tool call (or the safety-net pass if enabled), clearly labeled "AI-drafted — review before use."
  - *Action Items* — checkboxes, editable/removable, labeled "Suggested by AI."
  - A persistent "Download" button, available from any tab.

### 8.2 Audio pipeline (browser)

Request the mic with echo cancellation on, noise suppression off (the server-side model already handles noise; a second denoising layer on top introduces artifacts that hurt accuracy):

```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: false },
});
```

Use an `AudioWorklet` to convert captured Float32 samples to PCM16 and send them as base64 over the WebSocket. Build for cross-browser correctness from the start rather than patching it in later:

```javascript
// pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { inputSampleRate, targetSampleRate } = options.processorOptions;
    this.ratio = inputSampleRate / targetSampleRate;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const outLength = Math.floor(input.length / this.ratio);
    const pcm16 = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const sample = input[Math.floor(i * this.ratio)] ?? 0;
      pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
```

```javascript
// browser/voice-agent.js
const audioCtx = new AudioContext(); // let the browser pick its default rate — do not force 24000
await audioCtx.audioWorklet.addModule("pcm-processor.js");

const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: false },
});
const source = audioCtx.createMediaStreamSource(stream);
const worklet = new AudioWorkletNode(audioCtx, "pcm-processor", {
  processorOptions: { inputSampleRate: audioCtx.sampleRate, targetSampleRate: 24000 },
});

const { token } = await fetch("/api/voice-token").then(r => r.json());
const wsUrl = new URL("wss://agents.assemblyai.com/v1/ws");
wsUrl.searchParams.set("token", token);
const ws = new WebSocket(wsUrl);

let ready = false;
let playbackTime = audioCtx.currentTime;

worklet.port.onmessage = (e) => {
  if (ready && ws.readyState === WebSocket.OPEN) {
    const b64 = btoa(String.fromCharCode(...new Uint8Array(e.data)));
    ws.send(JSON.stringify({ type: "input.audio", audio: b64 }));
  }
};
source.connect(worklet).connect(audioCtx.destination);

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "session.update", session: { agent_id: AGENT_ID } }));
});

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case "session.ready":
      ready = true;
      break;
    case "reply.audio": {
      const raw = atob(msg.data);
      const pcm16 = new Int16Array(raw.length / 2);
      for (let i = 0; i < pcm16.length; i++) {
        pcm16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
      }
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
      const buffer = audioCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      playbackTime = Math.max(playbackTime, now);
      src.start(playbackTime);
      playbackTime += buffer.duration;
      break;
    }
    case "reply.done":
      if (msg.status === "interrupted") playbackTime = audioCtx.currentTime;
      break;
    case "transcript.user":
      appendCaption("You", msg.text);
      break;
    case "transcript.agent":
      appendCaption("Agent", msg.text);
      break;
    case "session.error":
    case "error":
      showError(msg.message);
      break;
    case "session.ended":
      cleanup();
      break;
  }
});
```

This deliberately does **not** force `AudioContext({ sampleRate: 24000 })`. Forcing it is a Chromium-only shortcut that breaks Firefox's echo cancellation and produces garbled audio on Safari. Letting the context run at its default rate and resampling inside the worklet (as coded above) works correctly on all three.

### 8.3 Ending the session cleanly

```javascript
function endCall() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "session.end" }));
    // wait for session.ended, then cleanup()
  } else {
    cleanup();
  }
}
function cleanup() {
  ws?.close();
  stream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
}
window.addEventListener("pagehide", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "session.end" })); // must be synchronous, no awaited work here
  }
});
```

Never just call `ws.close()` on its own — it leaves a 30-second billable resume window open.

### 8.4 Export (client-side, no server round trip)

```javascript
function downloadEncounterPacket({ transcript, soapNote, actionItems }) {
  const lines = [
    "=== TRANSCRIPT ===", transcript,
    "\n=== SOAP NOTE (AI-drafted, review before use) ===",
    `Subjective: ${soapNote.subjective}`,
    `Objective: ${soapNote.objective}`,
    `Assessment: ${soapNote.assessment}`,
    `Plan: ${soapNote.plan}`,
    "\n=== ACTION ITEMS (suggested) ===",
    ...actionItems.map(i => `- [ ] ${i.item}`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "encounter-packet.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}
```

Offer `.json` as a second export option (the raw structured object) for anyone who wants to pipe it into another system.

---

## 9. Voice Agent configuration (`agent-config.json`)

```json
{
  "name": "Intake Scribe",
  "system_prompt": "You are a calm, efficient clinical intake assistant on a voice call. Your job is to gather information, not to give it. Ask one question at a time, in this order: reason for the visit, current symptoms and how long they've lasted, current medications and dosages, and any known allergies. Keep every reply to one or two short sentences. Never give a diagnosis, medical advice, or medication guidance — if the patient asks for any of that, say a clinician will address it at the visit. Whenever the patient mentions a medication, dosage, or a diagnosed condition, call flag_medical_entity immediately, before moving on. Whenever something implies a follow-up action — a test, a referral, a prescription, a callback — call add_followup_item immediately. Once you have reason for visit, symptoms, medications, and allergies, call generate_soap_note, thank the patient, and end the call.",
  "greeting": "Hi, I'm going to ask a few quick questions before your visit. What brings you in today?",
  "voice": { "voice_id": "ivy" },
  "input": {
    "keyterms": ["Lisinopril", "Metformin", "Ozempic", "Amoxicillin", "Ibuprofen"]
  },
  "tools": [
    { "$ref": "flag_medical_entity, see Section 10" },
    { "$ref": "add_followup_item, see Section 10" },
    { "$ref": "generate_soap_note, see Section 10" }
  ]
}
```

Replace the keyterms list with whatever medications/conditions are realistic for your demo script — this is a word-boost list, not a fixed schema, and can hold up to 100 entries. Pick a `voice_id` from AssemblyAI's current voice list in the dashboard; `ivy` and `anna` are documented examples, not necessarily the only or best options.

---

## 10. Tool definitions (drop into the `tools` array above)

```json
{
  "name": "flag_medical_entity",
  "description": "Call as soon as the patient mentions a medication, dosage, or diagnosed condition worth a clinician's attention. Do not wait until the end of the call.",
  "parameters": {
    "type": "object",
    "properties": {
      "entity_type": { "type": "string", "enum": ["drug", "medical_condition", "injury"] },
      "text": { "type": "string", "description": "Exactly what was said, e.g. '20mg of Lisinopril'" },
      "note": { "type": "string", "description": "Why this might warrant a second look, if anything" }
    },
    "required": ["entity_type", "text"]
  },
  "http": {
    "url": "https://YOUR_PUBLIC_BACKEND/api/tools/flag-entity",
    "http_method": "POST",
    "headers": [{ "name": "Authorization", "value": "Bearer YOUR_INTERNAL_SECRET" }]
  }
}
```

```json
{
  "name": "add_followup_item",
  "description": "Call whenever the conversation implies something needs to happen after the call: a test to order, a referral, a prescription, a follow-up appointment.",
  "parameters": {
    "type": "object",
    "properties": {
      "item": { "type": "string", "description": "A short, specific action, e.g. 'Order CBC panel'" }
    },
    "required": ["item"]
  },
  "http": {
    "url": "https://YOUR_PUBLIC_BACKEND/api/tools/add-followup",
    "http_method": "POST",
    "headers": [{ "name": "Authorization", "value": "Bearer YOUR_INTERNAL_SECRET" }]
  }
}
```

```json
{
  "name": "generate_soap_note",
  "description": "Call exactly once, near the end of the intake, once you have reason for visit, symptoms, medications, and allergies.",
  "parameters": {
    "type": "object",
    "properties": {
      "subjective": { "type": "string" },
      "objective": { "type": "string" },
      "assessment": { "type": "string" },
      "plan": { "type": "string" }
    },
    "required": ["subjective", "objective", "assessment", "plan"]
  },
  "http": {
    "url": "https://YOUR_PUBLIC_BACKEND/api/tools/generate-soap",
    "http_method": "POST",
    "headers": [{ "name": "Authorization", "value": "Bearer YOUR_INTERNAL_SECRET" }]
  }
}
```

Rules that apply to all three: replace `YOUR_PUBLIC_BACKEND` with your ngrok URL during local dev and your real deployment URL in production — AssemblyAI blocks localhost and private IPs outright. `parameters` isn't validated at agent-creation time; a malformed schema is accepted silently and breaks tool calling only when the agent tries to use it, so test each tool with a real call before assuming it works.

---

## 11. Non-functional requirements

- **No real PHI.** Use synthetic or scripted encounters for all testing and the demo. State this explicitly in the pitch.
- **Everything AI-drafted is labeled as a draft.** The SOAP note is editable, not a locked final document. Flagged entities are "suggested," not confirmed. Never present model output as if a clinician already reviewed it.
- **The agent never gives medical advice.** This is enforced in the system prompt (Section 9), not just a UI disclaimer — bake it into the model's instructions, not only into the label the user sees.
- **Session billing hygiene.** Short token expiry, an explicit session duration cap, and always sending `session.end` before closing — a demo left open accidentally is still billing.
- **Production note (say this in the pitch, don't build it this month):** handling real PHI in production would require an AssemblyAI Business Associate Agreement and a real data-retention policy. Out of scope for the hackathon build, but worth naming explicitly as the next step.

---

## 12. Open items to verify before/while building (do not treat these as settled facts)

1. **HTTP tool webhook payload shape** — confirm which field (if any) identifies the originating session/call before relying on it for multi-session correlation. Test with one real call and log the full request body.
2. **Medical-mode-equivalent accuracy tuning at the Voice Agent layer** — no confirmed `domain` parameter exists here (unlike Pre-recorded/Streaming STT); `input.keyterms` is the documented workaround. Re-check the dashboard/docs in case this has changed.
3. **Multilingual behavior** — not confirmed at this layer from available docs. If multilingual support matters for your demo, verify current capabilities directly rather than assuming code-switching carries over unchanged from the pre-recorded product line.
4. **Voice selection** — confirm the current list of available `voice_id` values in the AssemblyAI dashboard; do not assume `ivy`/`anna` are the only options.

---

## 13. Build order

1. **Day 1–2:** Run the one-time agent creation script with a minimal config (name, system_prompt, voice, greeting only — no tools yet). Get the browser talking to it and hearing a voice back. This is your walking skeleton.
2. **Day 3–4:** Add `input.keyterms`. Add the three tools with real webhook URLs (via ngrok locally). Confirm each tool fires and your backend receives it.
3. **Day 5–6:** Build the summary screen (three tabs) and wire it to the session store. Build the client-side export.
4. **Day 7+:** Cross-browser test (Chrome/Edge first, then Firefox and Safari — don't skip this, the resampling bug is silent and easy to miss). Add the safety-net LLM Gateway pass if time allows. Record the demo video, build the deck, submit before Sep 30, 2026, 15:00 UTC.

---

## 14. Definition of done (MVP)

- [ ] Patient can start a call, hear the agent's greeting, and have a full spoken back-and-forth in Chrome.
- [ ] Live captions appear for both sides during the call.
- [ ] At least one flagged entity and one action item appear during a realistic test conversation, without the demo operator prompting for them.
- [ ] A SOAP note is generated automatically before the call ends.
- [ ] The call can be ended cleanly from a button, and by closing the tab, without leaving a hanging billable session.
- [ ] The summary screen shows transcript, editable SOAP note, and checkable action items.
- [ ] Clicking "Download" produces a real file with all three components, generated entirely in the browser.
- [ ] Works on Firefox and Safari as well as Chrome, or the limitation is clearly known and stated in the pitch.

### AssemblyAI Agent

I read the full specification and checked its unsettled points against the current API behavior. The architecture is sound, but one issue blocks the proposed multi-session HTTP-tool store:

- An HTTP tool receives **only the model-generated arguments**. For `POST`, those arguments become the JSON body. We do not inject `session_id`.
- HTTP-tool calls are server-side, so the browser does not receive their `tool.call` events.
- Therefore, the backend cannot reliably correlate the three HTTP tool requests with the `session_id` received by the browser.

The clean MVP fix is to use **client-side function tools**. The browser receives `tool.call`, updates the live UI immediately, stores the results in session memory, and returns `tool.result` after the matching `reply.done`. This satisfies every MVP requirement while removing the webhook correlation and polling problem. It also means `PUBLIC_BASE_URL` and a tunnel are unnecessary for the MVP.

I would build this as a Next.js TypeScript app:

- Server route mints a single-use token.
- Stored agent contains three function tools without `http`.
- Browser captures/resamples PCM16 mono at 24 kHz.
- `session.ready.session_id` is retained for optional artifact retrieval.
- User deltas are cumulative and replace the prior partial; agent deltas are word-level and are appended.
- All scheduled playback nodes are tracked and stopped on interruption, rather than only resetting `playbackTime`.
- `session.end` is sent explicitly before teardown.
- Transcript, draft SOAP note, flags, and checklist stay in browser memory and export locally.

A few verified corrections to the supplied spec:

- `ivy` is not currently in the voice list. Use `alba`, `eve`, `jane`, `mary`, `anna`, or another current ID.
- The creation shape remains `voice: { "voice_id": "alba" }`; resolved session output uses `output.voice`.
- Multilingual input is now configurable with `input.language_codes`; input supports 18 languages with code-switching. Spoken output officially supports English, Italian, Spanish, German, Portuguese, and French, with an appropriate voice.
- Voice-Agent STT tuning now includes `transcription_mode`, `transcription_prompt`, `language_codes`, `voice_focus`, and `voice_focus_threshold`. There is still no documented `domain: "medical-v1"` field at this layer.
- Your HTTP header-list format is current. Some generated API material still describes a map, but the maintained interface uses `[{name, value}]`.
- Session REST calls accept the raw key in `Authorization`; the temporary-token route uses `Bearer`.
- The stretch Gateway call should use strict `response_format: {type: "json_schema", ...}` rather than stripping Markdown from model output.
- Session artifacts are generated after every call, so the claim that nothing is stored outside browser memory is inaccurate. The summary/export can remain local, but recordings and timelines are available through the Sessions API until deleted. For a strict retention claim, add server-side `DELETE /v1/sessions/{session_id}` after artifact processing.
- A browser cannot guarantee delivery of a final WebSocket frame when a tab is terminated. `pagehide` is the correct best effort, but the explicit End button is the only reliable immediate teardown; otherwise the 30-second resume grace window may occur.
- The one-tap Export control above this chat downloads the generated project and conversation as a zip. Put `ASSEMBLYAI_API_KEY` in `.env.local`, never in browser code.

The build is now unambiguous: MVP with client-side tools first; Sessions API and strict Gateway reconciliation only after that works.

### You

Build the complete Next.js MVP

### AssemblyAI Agent

Below is the complete Next.js MVP. It uses client-side function tools so flags, action items, and the SOAP draft appear immediately without a database or webhook correlation. The only server-side operations are creating/updating the stored agent and minting temporary browser tokens.

Copy the files from the canvas or use **Export** to download the project as a zip.

```json title="package.json"
{
  "name": "voice-intake-scribe",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "agent:publish": "tsx scripts/publish-agent.ts"
  },
  "dependencies": {
    "assemblyai": "4.41.1",
    "next": "15.5.3",
    "react": "19.1.1",
    "react-dom": "19.1.1"
  },
  "devDependencies": {
    "@types/node": "22.18.3",
    "@types/react": "19.1.13",
    "@types/react-dom": "19.1.9",
    "tsx": "4.20.5",
    "typescript": "5.9.2"
  }
}
```

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    ".next/types/**/*.ts",
    "**/*.ts",
    "**/*.tsx"
  ],
  "exclude": ["node_modules"]
}
```

```typescript title="next-env.d.ts"
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

```text title=".gitignore"
node_modules
.next
.env
.env.local
*.log
.DS_Store
```

```text title=".env.example"
ASSEMBLYAI_API_KEY=replace_with_your_key
AGENT_ID=
```

```typescript title="app/api/voice-token/route.ts"
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const agentId = process.env.AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY or AGENT_ID is missing." },
      { status: 500 },
    );
  }

  const url = new URL("https://agents.assemblyai.com/v1/token");
  url.searchParams.set("expires_in_seconds", "120");
  url.searchParams.set("max_session_duration_seconds", "1800");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const body = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not mint a voice token.", detail: body },
        { status: response.status },
      );
    }

    const { token } = JSON.parse(body) as { token: string };
    return NextResponse.json(
      { token, agentId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not reach the Voice Agent API.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
```

The publisher uses Node’s built-in `fetch` because the stored-agent REST surface is not covered by the maintained Node SDK yet. The browser token itself is still kept server-side.

```typescript title="scripts/publish-agent.ts"
import "node:process";

const apiKey = process.env.ASSEMBLYAI_API_KEY;
const existingAgentId = process.env.AGENT_ID;

if (!apiKey) {
  throw new Error("Set ASSEMBLYAI_API_KEY before publishing the agent.");
}

const systemPrompt = `
You are a calm clinical intake assistant. You gather information only.
Never diagnose, give medical advice, recommend treatment, evaluate drug
interactions, or tell the patient to change medication. If asked, say a
clinician will address that during the visit.

Ask one short question at a time. Gather, in order:
1. reason for the visit;
2. symptoms and duration;
3. current medications and dosages;
4. known allergies.

Call flag_medical_entity immediately whenever the patient mentions a
medication, dosage, diagnosed condition, or injury. Do not add clinical
interpretation; the note field should only explain the mention's context.

Call add_followup_item only when the patient explicitly reports an already
planned or requested follow-up, such as a clinician-requested test, referral,
prescription renewal, or callback. Never invent or recommend an action.

After all four intake areas are covered, call generate_soap_note exactly once.
Keep Objective limited to facts observable or reported during this intake.
Assessment must summarize reported concerns without diagnosing. Plan must only
record reported existing plans and clinician-review items, not new advice.
After the SOAP tool succeeds, thank the patient and tell them to click End call.
`.trim();

const tools = [
  {
    type: "function",
    name: "flag_medical_entity",
    description:
      "Record a medication, dosage, diagnosed condition, or injury immediately after the patient mentions it.",
    parameters: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: ["drug", "medical_condition", "injury"],
          description: "Choose the literal category of the mention.",
        },
        text: {
          type: "string",
          description:
            "Exact concise mention, for example '20 mg of Lisinopril'.",
        },
        note: {
          type: "string",
          description:
            "Neutral context from the patient's words; no diagnosis or advice.",
        },
      },
      required: ["entity_type", "text"],
    },
  },
  {
    type: "function",
    name: "add_followup_item",
    description:
      "Record an explicitly reported existing or requested follow-up. Never invent or recommend a clinical action.",
    parameters: {
      type: "object",
      properties: {
        item: {
          type: "string",
          description:
            "Neutral clinician-review item, for example 'Review requested prescription renewal'.",
        },
      },
      required: ["item"],
    },
  },
  {
    type: "function",
    name: "generate_soap_note",
    description:
      "Draft the four SOAP sections exactly once after reason, symptoms, medications, and allergies are known.",
    parameters: {
      type: "object",
      properties: {
        subjective: {
          type: "string",
          description: "Patient-reported reason, symptoms, duration, medicines, and allergies.",
        },
        objective: {
          type: "string",
          description: "Only observable or reported intake facts; no invented exam findings.",
        },
        assessment: {
          type: "string",
          description: "Non-diagnostic summary for clinician review.",
        },
        plan: {
          type: "string",
          description: "Existing reported plans and clinician-review items only; no new advice.",
        },
      },
      required: ["subjective", "objective", "assessment", "plan"],
    },
  },
];

const body = {
  name: "AI Voice Intake Scribe",
  system_prompt: systemPrompt,
  greeting:
    "Hi, I'm going to ask a few quick questions before your visit. I collect information for clinician review and cannot give medical advice. What brings you in today?",
  voice: { voice_id: "alba" },
  input: {
    format: { encoding: "audio/pcm", sample_rate: 24000 },
    keyterms: [
      "Lisinopril",
      "Metformin",
      "Ozempic",
      "Amoxicillin",
      "Ibuprofen",
    ],
    turn_detection: {
      vad_threshold: 0.5,
      min_silence: 1400,
      max_silence: 4000,
      interrupt_response: true,
    },
  },
  output: {
    voice: "alba",
    format: { encoding: "audio/pcm", sample_rate: 24000 },
    volume: 100,
  },
  tools,
};

const endpoint = existingAgentId
  ? `https://agents.assemblyai.com/v1/agents/${existingAgentId}`
  : "https://agents.assemblyai.com/v1/agents";

const response = await fetch(endpoint, {
  method: existingAgentId ? "PUT" : "POST",
  headers: {
    Authorization: apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`Agent publish failed (${response.status}): ${text}`);
}

const agent = JSON.parse(text) as { id: string };
console.log(
  existingAgentId
    ? `Updated agent ${agent.id}`
    : `Created agent ${agent.id}\nAdd AGENT_ID=${agent.id} to .env.local`,
);
```

```javascript title="public/pcm-processor.js"
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.inputRate = config.inputSampleRate || sampleRate;
    this.targetRate = config.targetSampleRate || 24000;
    this.ratio = this.inputRate / this.targetRate;
    this.pending = [];
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    const outputLength = Math.floor(input.length / this.ratio);
    if (outputLength < 1) return true;

    const pcm = new Int16Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const position = i * this.ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = position - left;
      const sample =
        (input[left] || 0) * (1 - fraction) +
        (input[right] || 0) * fraction;
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clipped < 0 ? clipped * 32768 : clipped * 32767;
    }

    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
```

```typescript title="lib/types.ts"
export type Screen = "start" | "live" | "summary";
export type Status =
  | "idle"
  | "requesting-mic"
  | "connecting"
  | "ready"
  | "ending"
  | "ended"
  | "error";

export type Caption = {
  id: string;
  role: "user" | "agent";
  text: string;
  final: boolean;
};

export type Entity = {
  id: string;
  entityType: "drug" | "medical_condition" | "injury";
  text: string;
  note: string;
};

export type ActionItem = {
  id: string;
  item: string;
  done: boolean;
};

export type SoapNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};
```

```typescript title="lib/export.ts"
import type { ActionItem, Caption, Entity, SoapNote } from "./types";

type Packet = {
  sessionId: string | null;
  captions: Caption[];
  entities: Entity[];
  soapNote: SoapNote;
  actionItems: ActionItem[];
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportText(packet: Packet) {
  const transcript = packet.captions
    .filter((caption) => caption.final)
    .map((caption) => `${caption.role === "user" ? "Patient" : "Agent"}: ${caption.text}`)
    .join("\n\n");

  const flagged = packet.entities.length
    ? packet.entities.map((entity) =>
        `- ${entity.entityType}: ${entity.text}${entity.note ? ` — ${entity.note}` : ""}`,
      )
    : ["- None recorded"];

  const actions = packet.actionItems.length
    ? packet.actionItems.map((item) => `- [${item.done ? "x" : " "}] ${item.item}`)
    : ["- None recorded"];

  const lines = [
    "AI VOICE INTAKE SCRIBE — ENCOUNTER PACKET",
    "Synthetic/demo use only. AI-drafted; clinician review required.",
    `Session: ${packet.sessionId ?? "not available"}`,
    "",
    "=== TRANSCRIPT ===",
    transcript || "No finalized transcript captured.",
    "",
    "=== FLAGGED MENTIONS (SUGGESTED) ===",
    ...flagged,
    "",
    "=== SOAP NOTE (AI-DRAFTED — REVIEW BEFORE USE) ===",
    `Subjective:\n${packet.soapNote.subjective}`,
    `\nObjective:\n${packet.soapNote.objective}`,
    `\nAssessment:\n${packet.soapNote.assessment}`,
    `\nPlan:\n${packet.soapNote.plan}`,
    "",
    "=== ACTION ITEMS (SUGGESTED) ===",
    ...actions,
  ];

  saveBlob(
    new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    "encounter-packet.txt",
  );
}

export function exportJson(packet: Packet) {
  const cleanPacket = {
    notice: "Synthetic/demo use only. AI-drafted; clinician review required.",
    session_id: packet.sessionId,
    transcript: packet.captions
      .filter((caption) => caption.final)
      .map(({ role, text }) => ({ role, text })),
    flagged_entities: packet.entities.map(({ entityType, text, note }) => ({
      entity_type: entityType,
      text,
      note,
    })),
    soap_note: packet.soapNote,
    action_items: packet.actionItems.map(({ item, done }) => ({ item, done })),
  };

  saveBlob(
    new Blob([JSON.stringify(cleanPacket, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    "encounter-packet.json",
  );
}
```

```typescript title="lib/voice-session.ts"
import type { ActionItem, Caption, Entity, SoapNote, Status } from "./types";

const OUTPUT_RATE = 24000;

type VoiceCallbacks = {
  onStatus: (status: Status) => void;
  onSessionId: (sessionId: string) => void;
  onCaption: (caption: Caption) => void;
  onEntity: (entity: Entity) => void;
  onActionItem: (item: ActionItem) => void;
  onSoapNote: (note: SoapNote) => void;
  onError: (message: string) => void;
  onEnded: () => void;
};

type ServerMessage = {
  type: string;
  [key: string]: unknown;
};

type PendingTool = {
  callId: string;
  result: Record<string, unknown>;
};

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export class VoiceSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private ready = false;
  private ending = false;
  private cleanEnded = false;
  private playbackTime = 0;
  private playbackSources = new Set<AudioBufferSourceNode>();
  private lastEvent: string | null = null;
  private pendingTools: PendingTool[] = [];
  private callbacks: VoiceCallbacks;

  constructor(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks;
  }

  async start() {
    try {
      this.callbacks.onStatus("requesting-mic");

      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      await this.audioContext.audioWorklet.addModule("/pcm-processor.js");

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor",
        {
          processorOptions: {
            inputSampleRate: this.audioContext.sampleRate,
            targetSampleRate: OUTPUT_RATE,
          },
        },
      );

      // Keep the capture graph active without echoing mic audio to speakers.
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      this.callbacks.onStatus("connecting");
      const tokenResponse = await fetch("/api/voice-token", {
        cache: "no-store",
      });
      const tokenData = (await tokenResponse.json()) as {
        token?: string;
        agentId?: string;
        error?: string;
        detail?: string;
      };

      if (!tokenResponse.ok || !tokenData.token || !tokenData.agentId) {
        throw new Error(
          tokenData.detail || tokenData.error || "Token request failed.",
        );
      }

      const wsUrl = new URL("wss://agents.assemblyai.com/v1/ws");
      wsUrl.searchParams.set("token", tokenData.token);
      this.ws = new WebSocket(wsUrl);

      this.workletNode.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: "input.audio",
              audio: bytesToBase64(data),
            }),
          );
        }
      };

      this.ws.addEventListener("open", () => {
        this.send({
          type: "session.update",
          session: { agent_id: tokenData.agentId },
        });
      });

      this.ws.addEventListener("message", (event) => {
        void this.handleMessage(JSON.parse(event.data) as ServerMessage);
      });

      this.ws.addEventListener("error", () => {
        this.callbacks.onError("The voice connection encountered an error.");
      });

      this.ws.addEventListener("close", () => {
        const wasClean = this.cleanEnded || this.ending;
        void this.releaseResources();
        if (!wasClean) {
          this.callbacks.onStatus("error");
          this.callbacks.onError(
            "The connection closed unexpectedly. Start a new conversation with a fresh token.",
          );
        }
      });
    } catch (error) {
      await this.releaseResources();
      this.callbacks.onStatus("error");
      this.callbacks.onError(
        error instanceof Error ? error.message : "Could not start the call.",
      );
      throw error;
    }
  }

  end() {
    if (this.ending) return;
    this.ending = true;
    this.ready = false;
    this.callbacks.onStatus("ending");
    this.stopCapture();
    this.flushPlayback();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "session.end" });

      // Fall back to local cleanup if the final event never arrives.
      window.setTimeout(() => {
        if (!this.cleanEnded) {
          void this.releaseResources();
          this.callbacks.onStatus("ended");
          this.callbacks.onEnded();
        }
      }, 5000);
    } else {
      void this.releaseResources();
      this.callbacks.onStatus("ended");
      this.callbacks.onEnded();
    }
  }

  endForPageHide() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "session.end" }));
    }
    this.stopCapture();
  }

  private send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private async handleMessage(message: ServerMessage) {
    const type = message.type;

    if (type === "session.ready") {
      this.ready = true;
      this.lastEvent = type;
      this.callbacks.onSessionId(String(message.session_id));
      this.callbacks.onStatus("ready");
      return;
    }

    if (type === "reply.audio") {
      this.playAudio(String(message.data));
      return;
    }

    if (type === "input.speech.started") {
      this.lastEvent = type;
      // Early flush makes interruption feel immediate.
      this.flushPlayback();
      return;
    }

    if (type === "reply.started") {
      this.lastEvent = type;
      return;
    }

    if (type === "transcript.user.delta") {
      this.callbacks.onCaption({
        id: String(message.item_id),
        role: "user",
        text: String(message.text),
        final: false,
      });
      return;
    }

    if (type === "transcript.user") {
      this.callbacks.onCaption({
        id: String(message.item_id),
        role: "user",
        text: String(message.text),
        final: true,
      });
      return;
    }

    if (type === "transcript.agent.delta") {
      const captionId = String(message.reply_id);
      this.callbacks.onCaption({
        id: captionId,
        role: "agent",
        text: String(message.delta),
        final: false,
      });
      return;
    }

    if (type === "transcript.agent") {
      this.callbacks.onCaption({
        id: String(message.reply_id),
        role: "agent",
        text: String(message.text),
        final: true,
      });
      return;
    }

    if (type === "tool.call") {
      this.handleToolCall(
        String(message.call_id),
        String(message.name),
        (message.arguments ?? {}) as Record<string, unknown>,
      );
      this.flushToolsIfIdle();
      return;
    }

    if (type === "reply.done") {
      this.lastEvent = type;
      if (message.status === "interrupted") {
        this.flushPlayback();
        this.pendingTools = [];
      } else {
        this.flushToolsIfIdle();
      }
      return;
    }

    if (type === "session.ended") {
      this.cleanEnded = true;
      this.ready = false;
      await this.releaseResources();
      this.callbacks.onStatus("ended");
      this.callbacks.onEnded();
      return;
    }

    if (type === "session.error" || type === "error") {
      this.callbacks.onStatus("error");
      this.callbacks.onError(
        `${String(message.code ?? "voice_error")}: ${String(
          message.message ?? "Unknown voice session error",
        )}`,
      );
    }
  }

  private handleToolCall(
    callId: string,
    name: string,
    args: Record<string, unknown>,
  ) {
    try {
      if (name === "flag_medical_entity") {
        const entity: Entity = {
          id: id("entity"),
          entityType: String(args.entity_type) as Entity["entityType"],
          text: String(args.text ?? ""),
          note: String(args.note ?? ""),
        };
        this.callbacks.onEntity(entity);
        this.pendingTools.push({
          callId,
          result: { ok: true, recorded: entity.text },
        });
        return;
      }

      if (name === "add_followup_item") {
        const action: ActionItem = {
          id: id("action"),
          item: String(args.item ?? ""),
          done: false,
        };
        this.callbacks.onActionItem(action);
        this.pendingTools.push({
          callId,
          result: { ok: true, recorded: action.item },
        });
        return;
      }

      if (name === "generate_soap_note") {
        const note: SoapNote = {
          subjective: String(args.subjective ?? ""),
          objective: String(args.objective ?? ""),
          assessment: String(args.assessment ?? ""),
          plan: String(args.plan ?? ""),
        };
        this.callbacks.onSoapNote(note);
        this.pendingTools.push({
          callId,
          result: {
            ok: true,
            message: "Draft recorded for clinician review.",
          },
        });
        return;
      }

      this.pendingTools.push({
        callId,
        result: { error: `Unknown tool: ${name}` },
      });
    } catch (error) {
      this.pendingTools.push({
        callId,
        result: {
          error: error instanceof Error ? error.message : "Tool failed.",
        },
      });
    }
  }

  private flushToolsIfIdle() {
    if (
      this.lastEvent !== "reply.done" ||
      !this.pendingTools.length ||
      this.ws?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    for (const pending of this.pendingTools) {
      this.send({
        type: "tool.result",
        call_id: pending.callId,
        result: JSON.stringify(pending.result),
        is_error: "error" in pending.result,
      });
    }
    this.pendingTools = [];
  }

  private playAudio(base64: string) {
    const context = this.audioContext;
    if (!context || context.state === "closed") return;

    const raw = atob(base64);
    const pcm = new Int16Array(Math.floor(raw.length / 2));
    for (let i = 0; i < pcm.length; i++) {
      const value =
        raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
      pcm[i] = value >= 0x8000 ? value - 0x10000 : value;
    }

    const buffer = context.createBuffer(1, pcm.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime, this.playbackTime);
    source.start(startAt);
    this.playbackTime = startAt + buffer.duration;
    this.playbackSources.add(source);
    source.onended = () => {
      this.playbackSources.delete(source);
      source.disconnect();
    };
  }

  private flushPlayback() {
    for (const source of this.playbackSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // A source may already have ended.
      }
    }
    this.playbackSources.clear();
    this.playbackTime = this.audioContext?.currentTime ?? 0;
  }

  private stopCapture() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.silentGain?.disconnect();
  }

  private async releaseResources() {
    this.ready = false;
    this.stopCapture();
    this.flushPlayback();

    if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
      this.ws.close();
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close().catch(() => undefined);
    }

    this.ws = null;
    this.stream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.silentGain = null;
    this.audioContext = null;
  }
}
```

```tsx title="app/page.tsx"
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { exportJson, exportText } from "../lib/export";
import type {
  ActionItem,
  Caption,
  Entity,
  Screen,
  SoapNote,
  Status,
} from "../lib/types";
import { VoiceSession } from "../lib/voice-session";

const emptySoap: SoapNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

function mergeCaption(current: Caption[], incoming: Caption) {
  const index = current.findIndex((caption) => caption.id === incoming.id);
  if (index < 0) return [...current, incoming];

  const previous = current[index];
  const text =
    incoming.role === "agent" && !incoming.final
      ? `${previous.text}${previous.text ? " " : ""}${incoming.text}`
      : incoming.text;

  return current.map((caption, position) =>
    position === index ? { ...incoming, text } : caption,
  );
}

function uniqueEntity(current: Entity[], incoming: Entity) {
  const duplicate = current.some(
    (item) =>
      item.entityType === incoming.entityType &&
      item.text.toLowerCase() === incoming.text.toLowerCase(),
  );
  return duplicate ? current : [...current, incoming];
}

function uniqueAction(current: ActionItem[], incoming: ActionItem) {
  const duplicate = current.some(
    (item) => item.item.toLowerCase() === incoming.item.toLowerCase(),
  );
  return duplicate ? current : [...current, incoming];
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("start");
  const [status, setStatus] = useState<Status>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [soapNote, setSoapNote] = useState<SoapNote>(emptySoap);
  const [activeTab, setActiveTab] = useState<"transcript" | "soap" | "actions">(
    "transcript",
  );
  const [error, setError] = useState("");
  const sessionRef = useRef<VoiceSession | null>(null);
  const captionEndRef = useRef<HTMLDivElement | null>(null);

  const finalizedCaptions = useMemo(
    () => captions.filter((caption) => caption.final),
    [captions],
  );

  useEffect(() => {
    captionEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [captions]);

  useEffect(() => {
    const onPageHide = () => sessionRef.current?.endForPageHide();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      sessionRef.current?.endForPageHide();
    };
  }, []);

  async function startCall() {
    setError("");
    setCaptions([]);
    setEntities([]);
    setActionItems([]);
    setSoapNote(emptySoap);
    setSessionId(null);
    setScreen("live");

    const session = new VoiceSession({
      onStatus: setStatus,
      onSessionId: setSessionId,
      onCaption: (caption) =>
        setCaptions((current) => mergeCaption(current, caption)),
      onEntity: (entity) =>
        setEntities((current) => uniqueEntity(current, entity)),
      onActionItem: (item) =>
        setActionItems((current) => uniqueAction(current, item)),
      onSoapNote: setSoapNote,
      onError: setError,
      onEnded: () => setScreen("summary"),
    });

    sessionRef.current = session;

    try {
      await session.start();
    } catch {
      setScreen("start");
    }
  }

  function endCall() {
    sessionRef.current?.end();
  }

  function reset() {
    sessionRef.current = null;
    setStatus("idle");
    setScreen("start");
    setError("");
  }

  const packet = {
    sessionId,
    captions,
    entities,
    soapNote,
    actionItems,
  };

  if (screen === "start") {
    return (
      <main className="shell center">
        <section className="hero card">
          <div className="eyebrow">Synthetic demo encounters only</div>
          <h1>AI Voice Intake Scribe</h1>
          <p className="lead">
            A short spoken intake that drafts a transcript, SOAP note, and
            clinician-review checklist.
          </p>
          <div className="warning">
            This is not a diagnostic tool and does not provide medical advice.
            All output is AI-drafted and requires clinician review.
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary large" onClick={startCall}>
            Start conversation
          </button>
          <p className="fine">
            Your browser will request microphone permission. Use scripted,
            synthetic information only.
          </p>
        </section>
      </main>
    );
  }

  if (screen === "live") {
    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">Live intake</div>
            <h1>AI Voice Intake Scribe</h1>
          </div>
          <div className={`status ${status}`}>
            <span />
            {status.replaceAll("-", " ")}
          </div>
        </header>

        {error && <div className="error banner">{error}</div>}

        <div className="liveGrid">
          <section className="card transcriptPanel">
            <div className="sectionTitle">
              <h2>Live captions</h2>
              <span>AI-drafted</span>
            </div>
            <div className="captions" aria-live="polite">
              {!captions.length && (
                <p className="placeholder">
                  Connecting. The agent will speak first.
                </p>
              )}
              {captions.map((caption) => (
                <article
                  className={`caption ${caption.role} ${
                    caption.final ? "" : "partial"
                  }`}
                  key={caption.id}
                >
                  <strong>
                    {caption.role === "user" ? "Patient" : "Agent"}
                  </strong>
                  <p>{caption.text}</p>
                </article>
              ))}
              <div ref={captionEndRef} />
            </div>
          </section>

          <aside className="sidebar">
            <section className="card compact">
              <div className="sectionTitle">
                <h2>Flagged mentions</h2>
                <span>{entities.length}</span>
              </div>
              {!entities.length ? (
                <p className="placeholder">No suggested flags yet.</p>
              ) : (
                <ul className="stackList">
                  {entities.map((entity) => (
                    <li key={entity.id}>
                      <span className="pill">
                        {entity.entityType.replace("_", " ")}
                      </span>
                      <strong>{entity.text}</strong>
                      {entity.note && <small>{entity.note}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card compact">
              <div className="sectionTitle">
                <h2>Suggested actions</h2>
                <span>{actionItems.length}</span>
              </div>
              {!actionItems.length ? (
                <p className="placeholder">No suggested actions yet.</p>
              ) : (
                <ul className="stackList">
                  {actionItems.map((item) => (
                    <li key={item.id}>{item.item}</li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

        <div className="callControls">
          <p>End the call after the agent confirms the intake is complete.</p>
          <button
            className="danger"
            onClick={endCall}
            disabled={status === "ending"}
          >
            {status === "ending" ? "Ending…" : "End call"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar summaryHeader">
        <div>
          <div className="eyebrow">Clinician review</div>
          <h1>Encounter summary</h1>
          <p>AI-drafted — review and edit before use.</p>
        </div>
        <div className="downloadGroup">
          <button className="secondary" onClick={() => exportJson(packet)}>
            Download JSON
          </button>
          <button className="primary" onClick={() => exportText(packet)}>
            Download text
          </button>
        </div>
      </header>

      <div className="warning">
        Suggested content only. This is not a finalized clinical record.
      </div>

      <nav className="tabs" aria-label="Summary sections">
        {(["transcript", "soap", "actions"] as const).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "soap" ? "SOAP note" : tab}
          </button>
        ))}
      </nav>

      <section className="card summaryCard">
        {activeTab === "transcript" && (
          <div className="reviewTranscript">
            {!finalizedCaptions.length ? (
              <p className="placeholder">No finalized transcript captured.</p>
            ) : (
              finalizedCaptions.map((caption) => (
                <article className={`caption ${caption.role}`} key={caption.id}>
                  <strong>
                    {caption.role === "user" ? "Patient" : "Agent"}
                  </strong>
                  <p>{caption.text}</p>
                </article>
              ))
            )}
          </div>
        )}

        {activeTab === "soap" && (
          <div className="soapGrid">
            {(Object.keys(soapNote) as Array<keyof SoapNote>).map((section) => (
              <label key={section}>
                <span>{section}</span>
                <textarea
                  value={soapNote[section]}
                  placeholder={`No ${section} draft was generated.`}
                  onChange={(event) =>
                    setSoapNote((current) => ({
                      ...current,
                      [section]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        {activeTab === "actions" && (
          <div>
            {!actionItems.length ? (
              <p className="placeholder">No suggested action items.</p>
            ) : (
              <ul className="checklist">
                {actionItems.map((item) => (
                  <li key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      aria-label={`Mark ${item.item} complete`}
                      onChange={() =>
                        setActionItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, done: !candidate.done }
                              : candidate,
                          ),
                        )
                      }
                    />
                    <input
                      value={item.item}
                      aria-label="Edit suggested action"
                      onChange={(event) =>
                        setActionItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, item: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                    <button
                      className="iconButton"
                      aria-label={`Remove ${item.item}`}
                      onClick={() =>
                        setActionItems((current) =>
                          current.filter(
                            (candidate) => candidate.id !== item.id,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <footer className="summaryFooter">
        <small>Session: {sessionId ?? "not available"}</small>
        <button className="secondary" onClick={reset}>
          Start new synthetic intake
        </button>
      </footer>
    </main>
  );
}
```

```tsx title="app/layout.tsx"
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Voice Intake Scribe",
  description: "Synthetic clinical voice intake demo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```css title="app/globals.css"
:root {
  color-scheme: light;
  --bg: #f4f7f6;
  --card: #ffffff;
  --ink: #14211d;
  --muted: #66736e;
  --line: #dce5e1;
  --brand: #126c54;
  --brand-dark: #0b4f3d;
  --soft: #e8f4ef;
  --danger: #a93636;
  --warning: #fff6dc;
  --warning-line: #e9cf78;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top left, #e4f2ed, transparent 30rem),
    var(--bg);
  color: var(--ink);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

button,
input,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.shell {
  width: min(1180px, calc(100% - 32px));
  min-height: 100vh;
  margin: 0 auto;
  padding: 36px 0;
}

.center {
  display: grid;
  place-items: center;
}

.card {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: color-mix(in srgb, var(--card) 96%, transparent);
  box-shadow: 0 18px 55px rgba(21, 62, 49, 0.08);
}

.hero {
  width: min(680px, 100%);
  padding: clamp(28px, 6vw, 56px);
  text-align: center;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 12px;
  font-size: clamp(2rem, 5vw, 3.4rem);
  line-height: 1.05;
}

h2 {
  margin-bottom: 0;
  font-size: 1.05rem;
}

.lead {
  color: var(--muted);
  font-size: 1.15rem;
  line-height: 1.65;
}

.eyebrow {
  margin-bottom: 10px;
  color: var(--brand);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.warning {
  padding: 14px 16px;
  border: 1px solid var(--warning-line);
  border-radius: 12px;
  background: var(--warning);
  line-height: 1.5;
}

.hero .warning {
  margin: 26px 0;
}

.error {
  color: var(--danger);
  font-weight: 700;
}

.banner {
  margin-bottom: 18px;
  padding: 12px 16px;
  border: 1px solid #e1aaaa;
  border-radius: 10px;
  background: #fff1f1;
}

.primary,
.secondary,
.danger,
.iconButton {
  min-height: 44px;
  border-radius: 10px;
  padding: 0 18px;
  font-weight: 750;
}

.primary {
  border: 1px solid var(--brand);
  background: var(--brand);
  color: white;
}

.primary:hover {
  background: var(--brand-dark);
}

.secondary {
  border: 1px solid var(--line);
  background: white;
  color: var(--ink);
}

.danger {
  border: 1px solid var(--danger);
  background: var(--danger);
  color: white;
}

.large {
  min-height: 54px;
  padding: 0 28px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.fine,
.placeholder,
small {
  color: var(--muted);
}

.fine {
  margin: 16px 0 0;
  font-size: 0.84rem;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.topbar h1 {
  margin-bottom: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  padding: 9px 14px;
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 700;
  text-transform: capitalize;
}

.status span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #cf9f38;
}

.status.ready span {
  background: #20a675;
  box-shadow: 0 0 0 5px #dff4ec;
}

.status.error span {
  background: var(--danger);
}

.liveGrid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(260px, 0.8fr);
  gap: 20px;
}

.transcriptPanel {
  min-height: 62vh;
  overflow: hidden;
}

.sectionTitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  padding: 18px 20px;
}

.sectionTitle span {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.captions,
.reviewTranscript {
  display: flex;
  flex-direction: column;
  gap: 13px;
  overflow-y: auto;
  padding: 20px;
}

.captions {
  height: calc(62vh - 61px);
}

.caption {
  max-width: 84%;
  border-radius: 14px;
  padding: 12px 14px;
}

.caption p {
  margin: 5px 0 0;
  line-height: 1.45;
}

.caption strong {
  font-size: 0.76rem;
  text-transform: uppercase;
}

.caption.agent {
  align-self: flex-start;
  background: var(--soft);
}

.caption.user {
  align-self: flex-end;
  background: #eef0f8;
}

.caption.partial {
  opacity: 0.62;
}

.sidebar {
  display: grid;
  align-content: start;
  gap: 20px;
}

.compact {
  overflow: hidden;
}

.stackList,
.checklist {
  margin: 0;
  padding: 14px 20px 20px;
  list-style: none;
}

.stackList {
  display: grid;
  gap: 13px;
}

.stackList li {
  display: grid;
  gap: 5px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
  line-height: 1.35;
}

.stackList li:last-child {
  border-bottom: 0;
}

.pill {
  width: max-content;
  border-radius: 999px;
  background: var(--soft);
  padding: 4px 8px;
  color: var(--brand);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.callControls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 20px;
  border-radius: 16px;
  background: #14211d;
  padding: 16px 18px;
  color: white;
}

.callControls p {
  margin: 0;
}

.summaryHeader p {
  margin-bottom: 0;
  color: var(--muted);
}

.downloadGroup {
  display: flex;
  gap: 10px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin: 26px 0 12px;
}

.tabs button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  padding: 10px 16px;
  color: var(--muted);
  font-weight: 750;
  text-transform: capitalize;
}

.tabs button.active {
  border-color: var(--brand);
  background: var(--brand);
  color: white;
}

.summaryCard {
  min-height: 52vh;
  padding: 22px;
}

.soapGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.soapGrid label {
  display: grid;
  gap: 8px;
  font-weight: 800;
  text-transform: capitalize;
}

.soapGrid textarea {
  min-height: 190px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  color: var(--ink);
  line-height: 1.5;
}

.soapGrid textarea:focus,
.checklist input:focus {
  outline: 3px solid #cceadf;
  border-color: var(--brand);
}

.checklist {
  display: grid;
  gap: 12px;
}

.checklist li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}

.checklist input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: var(--brand);
}

.checklist input[type="text"],
.checklist input:not([type]) {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0 12px;
}

.iconButton {
  min-height: 40px;
  border: 0;
  background: #f7eaea;
  color: var(--danger);
}

.summaryFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
}

@media (max-width: 820px) {
  .shell {
    width: min(100% - 20px, 1180px);
    padding: 20px 0;
  }

  .topbar,
  .summaryHeader,
  .callControls,
  .summaryFooter {
    align-items: stretch;
    flex-direction: column;
  }

  .liveGrid,
  .soapGrid {
    grid-template-columns: 1fr;
  }

  .captions {
    height: 50vh;
  }

  .downloadGroup {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .checklist li {
    grid-template-columns: auto 1fr;
  }

  .checklist .iconButton {
    grid-column: 2;
  }
}
```

Run it in this order:

```bash
cp .env.example .env.local
npm install
set -a && source .env.local && set +a
npm run agent:publish
```

Copy the printed agent ID into `.env.local`:

```text
ASSEMBLYAI_API_KEY=your_key
AGENT_ID=the_created_agent_id
```

Then start the app:

```bash
npm run dev
```

Open it on `localhost`, which browsers treat as a secure context for microphone access. For deployment, set the same two environment variables on the host.

A few operational notes:

- The three tools are intentionally client-side and omit `http`; adding HTTP definitions would prevent the browser from receiving `tool.call`.
- Tool results wait until `reply.done`, matching the current turn-taking contract.
- Agent transcript deltas are incremental words, while user deltas are cumulative. The state reducer treats them differently.
- The End button waits for `session.ended`; tab close sends `session.end` synchronously as a best effort.
- Voice sessions have server-side recordings/timelines. The exported review packet itself is generated locally, but this MVP should not be described as zero-retention.
- Use synthetic encounters only. Real PHI requires a signed BAA and a deliberate retention/deletion design.

### You

Prepare a scripted demo encounter
