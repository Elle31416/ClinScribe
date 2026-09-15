"use client";

import { useCallback, useRef, useState } from "react";
import { ActionChecklist } from "./ActionChecklist";
import { SoapEditor } from "./SoapEditor";
import { TranscriptView } from "./TranscriptView";
import type { ActionItem, Caption, SoapNote } from "../../lib/types";

const TABS = [
  { id: "transcript", label: "Transcript" },
  { id: "soap", label: "SOAP note" },
  { id: "actions", label: "Action items" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SummaryScreen({
  sessionId,
  captions,
  soapNote,
  actionItems,
  onSoapChange,
  onToggleAction,
  onEditAction,
  onRemoveAction,
  onDownloadText,
  onDownloadJson,
  onReset,
}: {
  sessionId: string | null;
  captions: Caption[];
  soapNote: SoapNote;
  actionItems: ActionItem[];
  onSoapChange: (section: keyof SoapNote, value: string) => void;
  onToggleAction: (id: string) => void;
  onEditAction: (id: string, value: string) => void;
  onRemoveAction: (id: string) => void;
  onDownloadText: () => void;
  onDownloadJson: () => void;
  onReset: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("transcript");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    transcript: null,
    soap: null,
    actions: null,
  });

  /** Roving focus: left/right arrows move between tabs, as the ARIA pattern expects. */
  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const index = TABS.findIndex((tab) => tab.id === activeTab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = TABS[(index + offset + TABS.length) % TABS.length];
      setActiveTab(next.id);
      tabRefs.current[next.id]?.focus();
    },
    [activeTab],
  );

  return (
    <main className="shell">
      <header className="topbar summaryHeader">
        <div>
          <div className="eyebrow">Clinician review</div>
          <h1>Encounter summary</h1>
          <p>AI-drafted — review and edit before use.</p>
        </div>
        <div className="downloadGroup">
          <button className="secondary" type="button" onClick={onDownloadJson}>
            Download JSON
          </button>
          <button className="primary" type="button" onClick={onDownloadText}>
            Download text
          </button>
        </div>
      </header>

      <div className="warning">
        Suggested content only. This is not a finalized clinical record.
      </div>

      <nav className="tabs" role="tablist" aria-label="Summary sections">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "active" : ""}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={onTabKeyDown}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        className="card summaryCard"
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "transcript" && <TranscriptView captions={captions} />}

        {activeTab === "soap" && (
          <SoapEditor note={soapNote} onChange={onSoapChange} />
        )}

        {activeTab === "actions" && (
          <ActionChecklist
            items={actionItems}
            onToggle={onToggleAction}
            onEdit={onEditAction}
            onRemove={onRemoveAction}
          />
        )}
      </section>

      <footer className="summaryFooter">
        <small>Session: {sessionId ?? "not available"}</small>
        <button className="secondary" type="button" onClick={onReset}>
          Start new synthetic intake
        </button>
      </footer>
    </main>
  );
}
