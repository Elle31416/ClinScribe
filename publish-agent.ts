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