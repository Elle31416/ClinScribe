"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveScreen } from "./components/LiveScreen";
import { StartScreen } from "./components/StartScreen";
import { SummaryScreen } from "./components/SummaryScreen";
import { exportJson, exportText } from "../lib/export";
import {
  addActionItem,
  addEntity,
  buildPacket,
  EMPTY_SOAP,
  mergeCaption,
} from "../lib/session-state";
import type {
  ActionItem,
  Caption,
  Entity,
  Screen,
  SoapNote,
  Status,
} from "../lib/types";
import { VoiceSession } from "../lib/voice-session";

type Encounter = {
  sessionId: string | null;
  captions: Caption[];
  entities: Entity[];
  actionItems: ActionItem[];
  soapNote: SoapNote;
};

const EMPTY_ENCOUNTER: Encounter = {
  sessionId: null,
  captions: [],
  entities: [],
  actionItems: [],
  soapNote: EMPTY_SOAP,
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>("start");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [encounter, setEncounter] = useState<Encounter>(EMPTY_ENCOUNTER);
  const sessionRef = useRef<VoiceSession | null>(null);

  // One listener for the tab-close path; the End button is the reliable path.
  useEffect(() => {
    const onPageHide = () => sessionRef.current?.endForPageHide();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      onPageHide();
    };
  }, []);

  const startCall = useCallback(async () => {
    if (sessionRef.current) return; // ignore double clicks while connecting

    setError("");
    setEncounter(EMPTY_ENCOUNTER);
    setStatus("idle");
    setScreen("live");

    const session = new VoiceSession({
      onStatus: setStatus,
      onSessionId: (sessionId) =>
        setEncounter((current) => ({ ...current, sessionId })),
      onCaption: (caption) =>
        setEncounter((current) => ({
          ...current,
          captions: mergeCaption(current.captions, caption),
        })),
      onEntity: (entity) =>
        setEncounter((current) => ({
          ...current,
          entities: addEntity(current.entities, entity),
        })),
      onActionItem: (item) =>
        setEncounter((current) => ({
          ...current,
          actionItems: addActionItem(current.actionItems, item),
        })),
      onSoapNote: (soapNote) =>
        setEncounter((current) => ({ ...current, soapNote })),
      onError: setError,
      onEnded: () => setScreen("summary"),
    });

    sessionRef.current = session;

    try {
      await session.start();
    } catch {
      // start() already reported the reason through onError.
      sessionRef.current = null;
      setScreen("start");
    }
  }, []);

  const endCall = useCallback(() => {
    sessionRef.current?.end();
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = null;
    setStatus("idle");
    setError("");
    setEncounter(EMPTY_ENCOUNTER);
    setScreen("start");
  }, []);

  const onSoapChange = useCallback((section: keyof SoapNote, value: string) => {
    setEncounter((current) => ({
      ...current,
      soapNote: { ...current.soapNote, [section]: value },
    }));
  }, []);

  const onToggleAction = useCallback((id: string) => {
    setEncounter((current) => ({
      ...current,
      actionItems: current.actionItems.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    }));
  }, []);

  const onEditAction = useCallback((id: string, value: string) => {
    setEncounter((current) => ({
      ...current,
      actionItems: current.actionItems.map((item) =>
        item.id === id ? { ...item, item: value } : item,
      ),
    }));
  }, []);

  const onRemoveAction = useCallback((id: string) => {
    setEncounter((current) => ({
      ...current,
      actionItems: current.actionItems.filter((item) => item.id !== id),
    }));
  }, []);

  const packet = useMemo(
    () =>
      buildPacket(
        encounter.sessionId,
        encounter.captions,
        encounter.entities,
        encounter.soapNote,
        encounter.actionItems,
      ),
    [encounter],
  );

  const onDownloadText = useCallback(() => exportText(packet), [packet]);
  const onDownloadJson = useCallback(() => exportJson(packet), [packet]);

  if (screen === "start") {
    return <StartScreen error={error} onStart={startCall} />;
  }

  if (screen === "live") {
    return (
      <LiveScreen
        status={status}
        error={error}
        captions={encounter.captions}
        entities={encounter.entities}
        actionItems={encounter.actionItems}
        onEnd={endCall}
      />
    );
  }

  return (
    <SummaryScreen
      sessionId={encounter.sessionId}
      captions={encounter.captions}
      soapNote={encounter.soapNote}
      actionItems={encounter.actionItems}
      onSoapChange={onSoapChange}
      onToggleAction={onToggleAction}
      onEditAction={onEditAction}
      onRemoveAction={onRemoveAction}
      onDownloadText={onDownloadText}
      onDownloadJson={onDownloadJson}
      onReset={reset}
    />
  );
}
