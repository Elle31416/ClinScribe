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