/**
 * "Step 1 of 2" plus a segmented bar.
 *
 * Both halves earn their place. The words are what a screen reader and a
 * glancing user actually read; the segments answer "how much more of this is
 * there" at a glance, which is the question a multi-step form has to answer
 * before someone decides whether to start it.
 *
 * The whole thing is one `aria-label` on a group rather than N labelled divs:
 * a screen reader announcing "step one, filled, filled, empty, empty" is worse
 * than silence. The segments are decorative once the label has said it.
 */
export function StepIndicator({
  step,
  total,
  className = "",
}: {
  /** 1-based. */
  step: number;
  total: number;
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label={`Step ${step} of ${total}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Step {step} of {total}
      </p>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => i + 1).map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-secondary"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
