import {
  base64ToPcm16,
  bytesToBase64,
  CAPTURE_FRAME_MS,
  hasSocketHeadroom,
  OUTPUT_RATE,
  pcm16ToFloat32,
} from "./audio";
import { createId } from "./session-state";
import type { ActionItem, Caption, Entity, SoapNote, Status } from "./types";

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

type SessionToken = {
  token: string;
  agentId: string;
};

const TOKEN_TIMEOUT_MS = 15_000;
const END_GRACE_MS = 5_000;

/**
 * Owns one Voice Agent session: the microphone capture graph, the WebSocket, the
 * playback queue, and the client-side tool calls. The UI only sees callbacks, so
 * nothing in here touches React state directly.
 */
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
  private finished = false;
  private disposed = false;
  private endTimer: number | null = null;
  private releasePromise: Promise<void> | null = null;
  private droppedFrames = 0;
  private warnedBackpressure = false;
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

      // Capture setup and token minting are independent, so they run together:
      // the mic permission prompt and the round trip to /api/voice-token overlap
      // instead of queueing up (~0.5 s off time-to-first-word).
      const [, session] = await Promise.all([
        this.setupCapture(),
        this.requestSession(),
      ]);

      if (this.disposed) return;

      this.callbacks.onStatus("connecting");

      const wsUrl = new URL("wss://agents.assemblyai.com/v1/ws");
      wsUrl.searchParams.set("token", session.token);
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.addEventListener("open", () => {
        if (this.disposed) return;
        this.send({ type: "session.update", session: { agent_id: session.agentId } });
      });

      ws.addEventListener("message", (event) => {
        if (this.disposed) return;
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return; // Ignore a malformed frame rather than tearing down the call.
        }
        void this.handleMessage(message);
      });

      ws.addEventListener("error", () => {
        if (this.disposed) return;
        this.callbacks.onError("The voice connection encountered an error.");
      });

      ws.addEventListener("close", (event) => {
        const wasClean = this.cleanEnded || this.ending;
        void this.releaseResources();

        if (wasClean) {
          // Defensive: normally session.ended already finished the call.
          this.finish();
        } else {
          this.callbacks.onStatus("error");
          this.callbacks.onError(
            `Connection closed unexpectedly (code ${event.code}${
              event.reason ? `: ${event.reason}` : ""
            }). Start a new conversation with a fresh token.`,
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
      // session.end stops the billable 30-second resume grace window; the server
      // answers with session.ended, and cleanup happens there.
      this.send({ type: "session.end" });
      this.endTimer = window.setTimeout(() => {
        if (this.finished) return;
        void this.releaseResources();
        this.finish();
      }, END_GRACE_MS);
    } else {
      void this.releaseResources();
      this.finish();
    }
  }

  /** pagehide must stay synchronous: anything awaited will not finish. */
  endForPageHide() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "session.end" }));
    }
    this.stopCapture();
  }

  private async setupCapture() {
    const audioContext = new AudioContext();
    // Held on the instance immediately, so teardown closes the context even if
    // the microphone prompt is still open (or was denied) when start() fails.
    this.audioContext = audioContext;
    await audioContext.resume();
    await audioContext.audioWorklet.addModule("/pcm-processor.js");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // required: without it the agent hears itself
        noiseSuppression: false, // the server denoises already
        autoGainControl: true,
      },
    });

    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close().catch(() => undefined);
      return;
    }

    const workletNode = new AudioWorkletNode(audioContext, "pcm-processor", {
      processorOptions: {
        inputSampleRate: audioContext.sampleRate,
        targetSampleRate: OUTPUT_RATE,
        frameMs: CAPTURE_FRAME_MS,
      },
    });

    // Keep the capture graph pulled without echoing mic audio to the speakers.
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(audioContext.destination);

    workletNode.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      this.sendAudio(data);
    };

    this.stream = stream;
    this.sourceNode = sourceNode;
    this.workletNode = workletNode;
    this.silentGain = silentGain;
    this.playbackTime = audioContext.currentTime;
  }

  private async requestSession(): Promise<SessionToken> {
    let response: Response;
    try {
      response = await fetch("/api/voice-token", {
        cache: "no-store",
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      throw new Error(
        "Could not reach the token endpoint. Check the network and try again.",
      );
    }

    const data = (await response.json().catch(() => ({}))) as Partial<SessionToken> & {
      error?: string;
      detail?: string;
    };

    if (!response.ok || !data.token || !data.agentId) {
      throw new Error(data.detail || data.error || "Token request failed.");
    }

    return { token: data.token, agentId: data.agentId };
  }

  private sendAudio(buffer: ArrayBuffer) {
    const ws = this.ws;
    if (!this.ready || ws?.readyState !== WebSocket.OPEN) return;

    if (!hasSocketHeadroom(ws.bufferedAmount)) {
      this.droppedFrames += 1;
      if (!this.warnedBackpressure) {
        this.warnedBackpressure = true;
        console.warn(
          `Audio uplink congested (dropped ${this.droppedFrames} frame(s)); ` +
            "dropping frames instead of queueing so captions stay real time.",
        );
      }
      return;
    }

    ws.send(
      JSON.stringify({
        type: "input.audio",
        audio: bytesToBase64(new Uint8Array(buffer)),
      }),
    );
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
      // Barge-in: drop queued agent audio so the interruption is immediate.
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
      this.callbacks.onCaption({
        id: String(message.reply_id),
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
      this.finish();
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

  private handleToolCall(callId: string, name: string, args: Record<string, unknown>) {
    try {
      if (name === "flag_medical_entity") {
        const entity: Entity = {
          id: createId("entity"),
          entityType: String(args.entity_type) as Entity["entityType"],
          text: String(args.text ?? ""),
          note: String(args.note ?? ""),
        };
        this.callbacks.onEntity(entity);
        this.pendingTools.push({ callId, result: { ok: true, recorded: entity.text } });
        return;
      }

      if (name === "add_followup_item") {
        const action: ActionItem = {
          id: createId("action"),
          item: String(args.item ?? ""),
          done: false,
        };
        this.callbacks.onActionItem(action);
        this.pendingTools.push({ callId, result: { ok: true, recorded: action.item } });
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
          result: { ok: true, message: "Draft recorded for clinician review." },
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
        result: { error: error instanceof Error ? error.message : "Tool failed." },
      });
    }
  }

  /**
   * Tool results may only be sent while `reply.done` is the latest event, so
   * anything queued earlier waits here (the server drives the turn-taking).
   */
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

    const samples = base64ToPcm16(base64);
    if (!samples.length) return;

    const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.getChannelData(0).set(pcm16ToFloat32(samples));

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    // Schedule back to back on the audio clock: no gaps, no drift.
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
    if (this.workletNode) this.workletNode.port.onmessage = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.silentGain?.disconnect();
  }

  /** Idempotent: every teardown path funnels through here. */
  private releaseResources(): Promise<void> {
    this.releasePromise ??= this.dispose();
    return this.releasePromise;
  }

  private async dispose() {
    this.ready = false;
    this.disposed = true;

    if (this.endTimer !== null) {
      window.clearTimeout(this.endTimer);
      this.endTimer = null;
    }

    this.stopCapture();
    this.flushPlayback();

    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close();

    const context = this.audioContext;
    this.audioContext = null;
    this.stream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.silentGain = null;

    if (context && context.state !== "closed") {
      await context.close().catch(() => undefined);
    }
  }

  /** Announce the end exactly once, whatever triggered it. */
  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.callbacks.onStatus("ended");
    this.callbacks.onEnded();
  }
}
