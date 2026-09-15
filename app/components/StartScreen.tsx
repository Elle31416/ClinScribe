"use client";

export function StartScreen({
  error,
  onStart,
}: {
  error: string;
  onStart: () => void;
}) {
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
          This is not a diagnostic tool and does not provide medical advice. All
          output is AI-drafted and requires clinician review.
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary large" type="button" onClick={onStart}>
          Start conversation
        </button>
        <p className="fine">
          Your browser will request microphone permission. Use scripted, synthetic
          information only.
        </p>
      </section>
    </main>
  );
}
