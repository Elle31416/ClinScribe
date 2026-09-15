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

      this.ws.addEventListener("close", (event) => {
        const wasClean = this.cleanEnded || this.ending;
        void this.releaseResources();
        if (!wasClean) {
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