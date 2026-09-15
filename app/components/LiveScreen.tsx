"use client";

import { FlaggedMentions } from "./FlaggedMentions";
import { LiveCaptions } from "./LiveCaptions";
import { StatusPill } from "./StatusPill";
import { SuggestedActions } from "./SuggestedActions";
import type { ActionItem, Caption, Entity, Status } from "../../lib/types";

export function LiveScreen({
  status,
  error,
  captions,
  entities,
  actionItems,
  onEnd,
}: {
  status: Status;
  error: string;
  captions: Caption[];
  entities: Entity[];
  actionItems: ActionItem[];
  onEnd: () => void;
}) {
  const ending = status === "ending" || status === "ended";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Live intake</div>
          <h1>AI Voice Intake Scribe</h1>
        </div>
        <StatusPill status={status} />
      </header>

      {error && (
        <div className="error banner" role="alert">
          {error}
        </div>
      )}

      <div className="liveGrid">
        <section className="card transcriptPanel">
          <div className="sectionTitle">
            <h2>Live captions</h2>
            <span>AI-drafted</span>
          </div>
          <LiveCaptions captions={captions} />
        </section>

        <aside className="sidebar">
          <FlaggedMentions entities={entities} />
          <SuggestedActions items={actionItems} />
        </aside>
      </div>

      <div className="callControls">
        <p>End the call after the agent confirms the intake is complete.</p>
        <button className="danger" type="button" onClick={onEnd} disabled={ending}>
          {ending ? "Ending…" : "End call"}
        </button>
      </div>
    </main>
  );
}
