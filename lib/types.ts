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