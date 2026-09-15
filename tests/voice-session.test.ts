import assert from "node:assert/strict";
import test from "node:test";
import type { ActionItem, Caption, Entity, SoapNote, Status } from "../lib/types";
import { VoiceSession } from "../lib/voice-session";

/* ------------------------------------------------------------------ *
 * Browser doubles: enough of WebSocket, Web Audio, and fetch to drive
 * the session state machine from Node.
 * ------------------------------------------------------------------ */

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(public url: URL) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code: 1000, reason: "" });
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  deliver(payload: Record<string, unknown>) {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  fail(code = 1006, reason = "network") {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  /** Messages the client sent, parsed. */
  commands(type?: string) {
    return this.sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((message) => !type || message.type === type);
  }
}

class FakeWorkletNode {
  static instances: FakeWorkletNode[] = [];
  port = {
    onmessage: null as null | ((event: { data: ArrayBuffer }) => void),
    postMessage: () => {},
  };
  connected = false;

  constructor() {
    FakeWorkletNode.instances.push(this);
  }

  connect() {
    this.connected = true;
    return this;
  }

  disconnect() {
    this.connected = false;
  }

  emitAudio(samples = 2400) {
    this.port.onmessage?.({ data: new ArrayBuffer(samples * 2) });
  }
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  audioWorklet = { addModule: async () => {} };
  closed = false;
  playbackStarts: number[] = [];
  stopped = 0;

  async resume() {}
  async close() {
    this.closed = true;
    this.state = "closed";
  }
  createMediaStreamSource() {
    return { connect: () => {}, disconnect: () => {} };
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
  }
  createBuffer(channels: number, length: number, rate: number) {
    return { duration: length / rate, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      onended: null as null | (() => void),
      connect: () => {},
      disconnect: () => {},
      start: (at: number) => {
        this.playbackStarts.push(at);
      },
      stop: () => {
        this.stopped += 1;
      },
    };
  }
}

function createFakeWindow() {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  return {
    pending,
    window: {
      setTimeout(fn: () => void) {
        const id = nextId++;
        pending.set(id, fn);
        return id;
      },
      clearTimeout(id: number) {
        pending.delete(id);
      },
    },
    runPending() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
  };
}

function setGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

type Harness = {
  socket: FakeWebSocket;
  worklet: FakeWorkletNode;
  audio: FakeAudioContext;
  timers: ReturnType<typeof createFakeWindow>;
  events: {
    statuses: Status[];
    captions: Caption[];
    entities: Entity[];
    actions: ActionItem[];
    soapNotes: SoapNote[];
    errors: string[];
    sessionIds: string[];
    ended: number;
  };
  session: VoiceSession;
};

function createHarness(options: { tokenStatus?: number } = {}): Harness {
  FakeWebSocket.instances = [];
  FakeWorkletNode.instances = [];
  const timers = createFakeWindow();
  const contexts: FakeAudioContext[] = [];
  const trackStops = { count: 0 };

  setGlobal("WebSocket", FakeWebSocket);
  setGlobal("AudioWorkletNode", FakeWorkletNode);
  setGlobal("window", timers.window);
  setGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => (trackStops.count += 1) }],
      }),
    },
  });
  setGlobal(
    "AudioContext",
    class extends FakeAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
  setGlobal(
    "fetch",
    async () =>
      new Response(
        options.tokenStatus && options.tokenStatus !== 200
          ? JSON.stringify({ error: "Could not mint a voice token." })
          : JSON.stringify({ token: "temp-token", agentId: "agent_test" }),
        { status: options.tokenStatus ?? 200 },
      ),
  );

  const events: Harness["events"] = {
    statuses: [],
    captions: [],
    entities: [],
    actions: [],
    soapNotes: [],
    errors: [],
    sessionIds: [],
    ended: 0,
  };

  const session = new VoiceSession({
    onStatus: (status) => events.statuses.push(status),
    onSessionId: (id) => events.sessionIds.push(id),
    onCaption: (caption) => events.captions.push(caption),
    onEntity: (entity) => events.entities.push(entity),
    onActionItem: (item) => events.actions.push(item),
    onSoapNote: (note) => events.soapNotes.push(note),
    onError: (message) => events.errors.push(message),
    onEnded: () => (events.ended += 1),
  });

  return {
    get socket() {
      return FakeWebSocket.instances[0];
    },
    get worklet() {
      return FakeWorkletNode.instances[0];
    },
    get audio() {
      return contexts[0];
    },
    timers,
    events,
    session,
  } as Harness;
}

async function connect(harness: Harness) {
  await harness.session.start();
  harness.socket.open();
  harness.socket.deliver({ type: "session.ready", session_id: "sess_test" });
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test("binds to the stored agent with a token-minted agent id", async () => {
  const harness = createHarness();
  await connect(harness);

  assert.equal(harness.socket.url.searchParams.get("token"), "temp-token");
  assert.deepEqual(harness.socket.commands("session.update"), [
    { type: "session.update", session: { agent_id: "agent_test" } },
  ]);
  assert.deepEqual(harness.events.sessionIds, ["sess_test"]);
  assert.equal(harness.events.statuses.at(-1), "ready");
});

test("a failed token request reports the reason and does not open a socket", async () => {
  const harness = createHarness({ tokenStatus: 502 });

  await assert.rejects(() => harness.session.start(), /Could not mint a voice token\./);

  assert.equal(harness.socket, undefined, "no socket is opened without a token");
  assert.match(harness.events.errors.at(-1) ?? "", /Could not mint a voice token\./);
  assert.equal(harness.audio.closed, true, "the microphone is released again");
});

test("microphone frames are withheld until session.ready", async () => {
  const harness = createHarness();
  await harness.session.start();

  harness.socket.open();
  harness.worklet.emitAudio();
  assert.equal(harness.socket.commands("input.audio").length, 0);

  harness.socket.deliver({ type: "session.ready", session_id: "sess_test" });
  harness.worklet.emitAudio(2400);
  const audio = harness.socket.commands("input.audio");
  assert.equal(audio.length, 1);
  assert.equal(typeof audio[0].audio, "string");
});

test("tool results are held until reply.done is the latest event", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.socket.deliver({
    type: "tool.call",
    call_id: "call_1",
    name: "flag_medical_entity",
    arguments: { entity_type: "drug", text: "20 mg Lisinopril", note: "daily" },
  });

  assert.equal(harness.events.entities.length, 1);
  assert.equal(harness.socket.commands("tool.result").length, 0, "held while the turn is open");

  harness.socket.deliver({ type: "reply.done", reply_id: "reply_1", status: "completed" });

  const results = harness.socket.commands("tool.result");
  assert.equal(results.length, 1);
  assert.equal(results[0].call_id, "call_1");
  assert.equal(results[0].is_error, false);
  assert.deepEqual(JSON.parse(String(results[0].result)), {
    ok: true,
    recorded: "20 mg Lisinopril",
  });
});

test("an interrupted turn drops queued tool results instead of replaying them", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.socket.deliver({
    type: "tool.call",
    call_id: "call_2",
    name: "add_followup_item",
    arguments: { item: "Review requested renewal" },
  });
  harness.socket.deliver({ type: "reply.done", reply_id: "reply_2", status: "interrupted" });

  assert.equal(harness.events.actions.length, 1, "the CLI list still shows the item");
  assert.equal(harness.socket.commands("tool.result").length, 0);
});

test("an unknown tool answers with an error result so the agent can recover", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.socket.deliver({
    type: "tool.call",
    call_id: "call_3",
    name: "not_a_tool",
    arguments: {},
  });
  harness.socket.deliver({ type: "reply.done", reply_id: "reply_3", status: "completed" });

  const [result] = harness.socket.commands("tool.result");
  assert.equal(result.is_error, true);
  assert.match(String(result.result), /Unknown tool: not_a_tool/);
});

test("soap notes and captions map onto the documented event fields", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.socket.deliver({ type: "transcript.user.delta", item_id: "item_1", text: "I have" });
  harness.socket.deliver({ type: "transcript.user", item_id: "item_1", text: "I have a headache" });
  harness.socket.deliver({ type: "transcript.agent.delta", reply_id: "reply_1", delta: "Okay" });
  harness.socket.deliver({ type: "transcript.agent", reply_id: "reply_1", text: "Okay." });
  harness.socket.deliver({
    type: "tool.call",
    call_id: "call_4",
    name: "generate_soap_note",
    arguments: { subjective: "Headache", objective: "", assessment: "", plan: "" },
  });

  assert.deepEqual(
    harness.events.captions.map((caption) => [caption.role, caption.text, caption.final]),
    [
      ["user", "I have", false],
      ["user", "I have a headache", true],
      ["agent", "Okay", false],
      ["agent", "Okay.", true],
    ],
  );
  assert.equal(harness.events.soapNotes[0].subjective, "Headache");
});

test("session.end finishes on session.ended and releases the audio graph once", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.session.end();
  assert.deepEqual(harness.socket.commands("session.end"), [{ type: "session.end" }]);
  assert.equal(harness.events.statuses.at(-1), "ending");
  assert.equal(harness.timers.pending.size, 1, "a fallback timer guards a silent server");

  harness.socket.deliver({ type: "session.ended", session_duration_seconds: 12.5 });

  assert.equal(harness.events.ended, 1);
  assert.equal(harness.events.statuses.at(-1), "ended");
  assert.equal(harness.audio.closed, true);
  assert.equal(harness.timers.pending.size, 0, "the fallback timer is cleared");
  assert.equal(harness.worklet.connected, false);
});

test("a dropped connection without session.ended still ends locally", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.session.end();
  harness.timers.runPending(); // the server never answers

  assert.equal(harness.events.ended, 1);
  assert.equal(harness.events.statuses.at(-1), "ended");
});

test("an unexpected close surfaces an error and leaves the call endable", async () => {
  const harness = createHarness();
  await connect(harness);

  harness.socket.fail(1006, "network");

  assert.equal(harness.events.ended, 0, "the clinician decides when to leave the live view");
  assert.equal(harness.events.statuses.at(-1), "error");
  assert.match(harness.events.errors.at(-1) ?? "", /code 1006/);

  harness.session.end();
  assert.equal(harness.events.ended, 1);
  assert.equal(harness.audio.closed, true);
});

test("barge-in flushes queued playback so stale speech is not heard", async () => {
  const harness = createHarness();
  await connect(harness);

  // 20 ms of PCM16 silence at 24 kHz.
  const payload = Buffer.alloc(960).toString("base64");
  harness.socket.deliver({ type: "reply.audio", data: payload });
  harness.socket.deliver({ type: "reply.audio", data: payload });
  assert.equal(harness.audio.playbackStarts.length, 2);

  harness.socket.deliver({ type: "input.speech.started" });

  assert.equal(harness.audio.stopped, 2, "every scheduled source is stopped");
});
