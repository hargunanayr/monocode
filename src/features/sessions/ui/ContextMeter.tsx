import { useRef, useState } from "react";
import {
  contextRatio,
  contextTooltip,
  type ContextUsage,
} from "../model/contextUsage";
import { Popover } from "../../../shared/ui/Popover";

const SIZE = 14;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring turns amber then red as the window fills. */
function ringClass(ratio: number): string {
  if (ratio >= 0.9) return "text-red-400";
  if (ratio >= 0.75) return "text-amber-400";
  return "text-content/45";
}

/**
 * Circular gauge for how full the model context window is.
 *
 * Renders nothing until the harness reports both halves — Cursor's ACP stream
 * carries no usage at all, and a ring guessing at a number is worse than no
 * ring. A conversation with nothing in it yet is the exception: its context
 * is known to be empty, so `empty` shows a bare ring.
 */
export type ContextMeterAction = {
  label: string;
  title: string;
  disabled?: boolean;
  run: () => void;
};

export function ContextMeter({
  usage,
  action,
  note,
  empty = false,
}: {
  usage?: ContextUsage;
  /** What clicking the ring offers, such as compacting the conversation. */
  action?: ContextMeterAction;
  /** A line under the reading, such as what the next turn will do. */
  note?: string;
  /** The conversation has no messages yet. */
  empty?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const ratio = contextRatio(usage);
  if (!usage || ratio === null) {
    return empty ? (
      <span title="No context used yet" className="grid shrink-0">
        <MeterRing ratio={0} label="No context used yet" />
      </span>
    ) : null;
  }

  const { headline, detail } = contextTooltip(usage);
  const actionsOpen = open && action != null;

  return (
    <div
      ref={root}
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {action ? (
        <button
          type="button"
          title="Context usage"
          aria-label={`${headline}, ${detail}. Open context actions`}
          aria-expanded={actionsOpen}
          onClick={() => setOpen((value) => !value)}
          className="-m-1 grid rounded-sm p-1 outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <MeterRing ratio={ratio} />
        </button>
      ) : (
        <MeterRing ratio={ratio} label={`${headline}, ${detail}`} />
      )}
      {hovered || actionsOpen ? (
        <Popover
          anchor={root}
          side="top"
          align="end"
          onDismiss={action ? () => setOpen(false) : undefined}
          className={`w-max px-2.5 py-1.5 ${actionsOpen ? "" : "pointer-events-none"}`}
        >
          <div className="text-[12px] leading-4 text-content">{headline}</div>
          <div className="text-[11px] leading-4 text-content/50">{detail}</div>
          {note ? (
            <div className="mt-1 text-[11px] leading-4 text-content/70">
              {note}
            </div>
          ) : null}
          {actionsOpen ? (
            <button
              type="button"
              disabled={action.disabled}
              title={
                action.disabled
                  ? "Wait for the current operation to finish"
                  : action.title
              }
              onClick={() => {
                setOpen(false);
                action.run();
              }}
              className="mt-1.5 w-full rounded-md bg-content/10 px-2 py-1 text-[11px] text-content hover:bg-content/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action.label}
            </button>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}

function MeterRing({ ratio, label }: { ratio: number; label?: string }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={ringClass(ratio)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="opacity-25"
      />
      {/* A round cap would leave a dot on an empty ring. */}
      {ratio > 0 ? (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      ) : null}
    </svg>
  );
}
