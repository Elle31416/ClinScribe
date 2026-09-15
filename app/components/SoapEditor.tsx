"use client";

import type { SoapNote } from "../../lib/types";

export const SOAP_SECTIONS: Array<{ key: keyof SoapNote; label: string; hint: string }> = [
  { key: "subjective", label: "Subjective", hint: "What the patient reported" },
  { key: "objective", label: "Objective", hint: "Observable or measured facts" },
  { key: "assessment", label: "Assessment", hint: "Non-diagnostic summary" },
  { key: "plan", label: "Plan", hint: "Reported plans and review items" },
];

export function SoapEditor({
  note,
  onChange,
}: {
  note: SoapNote;
  onChange: (section: keyof SoapNote, value: string) => void;
}) {
  return (
    <div className="soapGrid">
      {SOAP_SECTIONS.map(({ key, label, hint }) => (
        <label key={key}>
          <span>
            {label}
            <small className="fieldHint">{hint}</small>
          </span>
          <textarea
            value={note[key]}
            placeholder={`No ${label.toLowerCase()} draft was generated.`}
            onChange={(event) => onChange(key, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
