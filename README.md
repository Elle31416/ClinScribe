# ClinScribe — AI Voice Intake Scribe

**Browser-only clinical intake that listens, flags, and drafts — for clinician review.**

ClinScribe is a real-time voice agent built for the AssemblyAI Voice Agent Hackathon. A patient opens a browser tab, talks to an AI voice agent about their reason for visit, symptoms, medications, and allergies. While talking, the agent flags medications/conditions and logs follow-up items. At the end it drafts a structured SOAP note. Everything is shown on a clinician review screen with transcript, editable SOAP, and checklist — exportable as TXT or JSON, generated entirely client-side.

> **Not a diagnostic tool.** No medical advice, no diagnosis, no dosage guidance. All AI output is labeled **"AI-drafted — review before use"** and requires clinician review. Synthetic demo encounters only.

---

## ✨ Features (MVP)

- 🎙️ **Live voice conversation** — Browser mic → AssemblyAI Voice Agent API (STT + LLM + TTS + turn-taking) over WebSocket
- 📝 **Live captions** for both patient and agent
- 🚩 **Flagged mentions** — medications, conditions, injuries detected in real-time via `flag_medical_entity` tool
- ✅ **Suggested actions** — follow-up items via `add_followup_item`
- 📋 **Auto SOAP note** — drafted at end of call via `generate_soap_note`
- 🔒 **Client-side tools** — no webhook correlation problem, no DB needed for demo; state lives in browser memory
- 📦 **One-click export** — TXT and JSON encounter packet, no server round-trip
- 🧹 **Clean session end** — explicit `session.end` before teardown, pagehide handling

## 🧱 Tech Stack

- **Frontend:** Next.js 15.5 + React 19 + TypeScript
- **Backend:** Next.js API Routes (Node.js runtime)
- **Voice:** AssemblyAI Voice Agent API — called directly over its REST and WebSocket endpoints, no SDK in the client bundle
- **Audio:** Web Audio API + AudioWorklet (`pcm-processor.js`) — PCM16 mono 24kHz, resampled and batched in the audio thread
- **Hosting:** Vercel-ready (or Render for long-lived processes)

## 🏗️ Architecture

```
Browser (mic + speaker + UI)
   |  wss://agents.assemblyai.com/v1/ws?token=...
   v
AssemblyAI Voice Agent API (STT + LLM + TTS)
   |  tool.call events (client-side function tools)
   v
Browser state (transcript, entities, SOAP, actions)
   |
   +--> /api/voice-token (server) mints short-lived token
```

- `GET /api/voice-token` → mints a token (120 s redemption window, 1800 s max session) using `ASSEMBLYAI_API_KEY` server-side. The browser never sees the API key. Requests are rate-limited per IP (5/min, in-memory — swap for a real limiter before this is public).
- Stored agent config lives on the AssemblyAI side, created via `publish-agent.ts`.
- No database for MVP — in-memory browser state, exported locally.

## 📁 Project Structure

```
.
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Screen state + session wiring (<200 lines)
│   ├── globals.css                # Styles
│   ├── components/                # Presentational, memoised screen pieces
│   │   ├── StartScreen.tsx
│   │   ├── LiveScreen.tsx         # Captions + flags + actions + call controls
│   │   ├── SummaryScreen.tsx      # Tabs with ARIA tab semantics
│   │   ├── LiveCaptions.tsx       # role="log" live region, pinned autoscroll
│   │   ├── TranscriptView.tsx     # Finalised transcript only
│   │   ├── SoapEditor.tsx         # Editable S/O/A/P
│   │   ├── ActionChecklist.tsx    # Tick / edit / remove
│   │   ├── FlaggedMentions.tsx
│   │   ├── SuggestedActions.tsx
│   │   ├── CaptionRow.tsx
│   │   ├── StatusPill.tsx
│   │   └── usePinnedScroll.ts     # Follow-the-end scroll, yields to the user
│   └── api/
│       └── voice-token/
│           └── route.ts           # GET /api/voice-token (mints short-lived token)
├── lib/
│   ├── types.ts                   # Shared types
│   ├── session-state.ts           # Pure reducers: caption merge, dedupe, packet
│   ├── audio.ts                   # PCM16/base64 helpers, frame + backpressure constants
│   ├── export.ts                  # Packet builders + TXT/JSON download
│   ├── rate-limit.ts              # Fixed-window IP limiter for the token route
│   └── voice-session.ts           # VoiceSession class - WS + audio pipeline
├── public/
│   └── pcm-processor.js           # AudioWorklet: resample + 50 ms batching
├── scripts/
│   └── publish-agent.ts           # One-time agent publish script
├── tests/                         # node:test suites (npm test)
├── .github/workflows/ci.yml       # verify + build on every push/PR
├── next.config.ts
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── HANDOFF.md                     # Full spec + conversation handoff
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18.18+ (22 recommended)
- AssemblyAI account with **credit card on file** (required for Voice Agent API)
- Chrome/Edge recommended (Firefox/Safari tested)

### 1. Clone & Install

```bash
git clone https://github.com/Elle31416/ClinScribe.git
cd ClinScribe
npm ci
```

### 2. Environment

Create `.env` from example:

```bash
cp .env.example .env
```

Edit `.env`:

```env
ASSEMBLYAI_API_KEY=your_key_here
AGENT_ID=agent_b0aca15004de4ab2b39bbfc1ce360956
```

Get your API key from https://www.assemblyai.com/dashboard

### 3. Publish the Voice Agent (one-time)

This creates/updates the stored agent on AssemblyAI with system prompt, voice, and 3 function tools.

```bash
# loads .env automatically, then creates or updates the stored agent
npm run agent:publish

# or directly
npx tsx scripts/publish-agent.ts
```

Copy the printed `agent_...` ID into `.env` as `AGENT_ID`.

**Agent config highlights:**
- Voice: `alba` (verify current list in dashboard; alternatives: `eve`, `jane`, `mary`, `anna`)
- Greeting: *"Hi, I'm going to ask a few quick questions before your visit..."*
- Tools:
  - `flag_medical_entity` — drug / medical_condition / injury
  - `add_followup_item` — neutral clinician-review item only
  - `generate_soap_note` — subjective, objective, assessment, plan (once)

System prompt enforces: one question at a time, no diagnosis, no medical advice, call tools immediately.

### 4. Run Dev Server

```bash
npm run dev
```

Open http://localhost:3000 — localhost is a secure context, so mic permission works.

### 5. Demo Flow

1. Click **Start conversation** → allow mic
2. Agent greets and asks reason for visit
3. Speak naturally (use synthetic data only):
   - *"I have had a headache for 3 days, taking 20mg Lisinopril and Ibuprofen, allergic to penicillin"*
4. Watch live captions + flagged mentions + action items appear
5. After 4 areas covered (reason, symptoms, meds, allergies), agent calls `generate_soap_note`, thanks patient
6. Click **End call** → Summary screen
7. Review 3 tabs: Transcript / SOAP Note (editable) / Action Items (checkable, editable)
8. **Download** TXT or JSON — generated client-side

## 🔧 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `npm test` | Unit + component + protocol tests via `node:test` |
| `npm run verify` | typecheck + lint + test (run before pushing; CI runs it too) |
| `npm run agent:publish` | Publish/update stored agent on AssemblyAI |

## 🧪 Testing

No browser or network is needed: the suite runs on Node's built-in test runner.

- `tests/session-state.test.ts` — caption merge semantics (cumulative user deltas vs. word-level agent deltas), entity/action de-duplication
- `tests/audio.test.ts` — PCM16 ⇄ base64 round-trips, backpressure threshold
- `tests/pcm-processor.test.ts` — runs the real AudioWorklet file inside `node:vm`: 48/44.1/32 kHz resampling, tone fidelity, frame batching, clipping
- `tests/voice-session.test.ts` — drives `VoiceSession` against fake WebSocket/Web Audio/fetch: token binding, tool-result timing, barge-in, teardown
- `tests/export.test.ts` — TXT/JSON packet shape, no partial captions in exports
- `tests/rate-limit.test.ts` — limiter windows and bounded memory
- `tests/screens.test.tsx` — server-renders each screen to catch markup/ARIA regressions

## 🔐 Environment Variables

| Var | Required | Description |
|-----|----------|-------------|
| `ASSEMBLYAI_API_KEY` | Yes | Your AssemblyAI API key (raw key for agent REST; Bearer for the token route) |
| `AGENT_ID` | Yes | Stored agent ID (`agent_b0aca15004de4ab2b39bbfc1ce360956`) |
| `PUBLIC_BASE_URL` | No (stretch) | Public HTTPS URL for HTTP tool webhooks — not needed for client-side tool MVP |

All `.env*` files are gitignored. Only `.env.example` is committed.

## 🎤 Audio Pipeline Details

- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true }})`
- The AudioWorklet resamples from the device rate to 24 kHz PCM16 mono with a phase-continuous interpolator (no drift, no click at block boundaries) and posts **50 ms frames** instead of one message per 128-frame render quantum — ~20 sends/s instead of ~375.
- Base64-encoded PCM sent as `{ type: "input.audio", audio: b64 }`
- If the socket backs up (`bufferedAmount` over 256 kB), frames are dropped rather than queued: the server discards audio delivered faster than real time, so buffering only makes captions late.
- Playback: `reply.audio` (base64 PCM16) → Float32 → AudioBuffer → scheduled back-to-back on the audio clock
- Interruption: `input.speech.started` / `reply.done: interrupted` stops every scheduled source immediately
- End: `session.end` sent explicitly, never just `ws.close()` (avoids the 30 s billable resume window), with a 5 s local fallback if `session.ended` never arrives

## 📤 Export Format

**TXT:**
```
AI VOICE INTAKE SCRIBE — ENCOUNTER PACKET
=== TRANSCRIPT ===
Patient: ...
Agent: ...
=== FLAGGED MENTIONS (SUGGESTED) ===
- Drug: 20 mg Lisinopril — takes daily
=== SOAP NOTE (AI-DRAFTED — REVIEW BEFORE USE) ===
Subjective: ...
...
=== ACTION ITEMS (SUGGESTED) ===
- [ ] Review requested prescription renewal
```

**JSON:**
```json
{
  "notice": "Synthetic/demo use only...",
  "session_id": "...",
  "transcript": [{ "role": "user", "text": "..." }],
  "flagged_entities": [{ "entity_type": "drug", "text": "...", "note": "..." }],
  "soap_note": { "subjective": "", "objective": "", "assessment": "", "plan": "" },
  "action_items": [{ "item": "", "done": false }]
}
```

## ⚠️ Safety & Compliance

- **Synthetic data only** — no real PHI in testing/demo
- All outputs labeled draft/suggested
- Agent never gives diagnosis, advice, or dosage guidance (enforced in system prompt)
- Session artifacts (audio OGG/Opus, timeline JSON) are stored by AssemblyAI until deleted via `DELETE /v1/sessions/{id}` — so do not claim zero-retention unless you add deletion
- Responses carry `X-Content-Type-Options`, `Referrer-Policy`, and a `Permissions-Policy` that allows only the microphone (required: the app is often embedded in a cross-origin preview frame)
- The token endpoint is rate-limited per IP in memory; anyone who can reach a deployed instance can still spend your AssemblyAI credit, so add real edge protection before making it public
- Production with real PHI requires AssemblyAI BAA + retention/deletion policy (out of scope for hackathon)

## 🗺️ Roadmap / Stretch

- [ ] Safety-net pass: fetch timeline artifact → LLM Gateway (Claude Sonnet) with strict `json_schema` response_format → reconcile with live SOAP
- [ ] Show flagged mentions on the summary screen (currently only in the live view and the export)
- [ ] Multi-language: `input.language_codes` (18 langs) + output voice per language
- [ ] Phone via Twilio
- [ ] Bluejay simulated-caller QA
- [ ] Real DB + auth for multi-session
- [ ] Next.js 16 upgrade (Turbopack builds, clears the remaining transitive `postcss` advisories in `npm audit`)

## 🧪 Verified Gotchas (from live docs check)

- HTTP tools receive only model-generated args — no injected `session_id`. That's why MVP uses client-side function tools.
- `ivy` voice ID not in current list — use `alba`, `eve`, etc.
- Token route uses `Authorization: Bearer <key>`, agent REST uses raw key.
- User deltas are cumulative, agent deltas are word-level append.
- `tool.result` may only be sent while `reply.done` is the most recent event; results are held otherwise.
- Browser cannot guarantee final WS frame on tab close — `pagehide` is best-effort, End button is reliable.

## 📄 License

Private for hackathon — add license before public release.

---

Built with AssemblyAI Voice Agent API for lablab.ai Hackathon Sep 2026.
