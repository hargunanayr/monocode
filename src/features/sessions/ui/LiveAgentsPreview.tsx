import { useEffect, useState, type CSSProperties } from "react";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { formatLiveElapsed, type LiveAgent } from "../model/liveAgents";
import { projectKey, projectName } from "../../../shared/lib/paths";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLabel,
  resolveTabGroupMascot,
} from "../../workspace/model/tabGroups";
import { Check, ChevronDown, ChevronUp, CircleAlert } from "../../../shared/ui/icons";
import { HarnessIcon } from "./HarnessIcon";
import { ProjectMascot } from "../../projects/ui/ProjectMascot";
import { TerminalSpinner } from "./TerminalSpinner";

const LIVE_AGENT_CAP = 4;

type Props = {
  agents: LiveAgent[];
  activeSessionId?: string;
  onSelect?: (sessionId: string) => void;
  /** Drops the finished agents from the list, as if each had been opened. */
  onClearFinished?: () => void;
  bottomSpacing?: boolean;
  groupLabels?: Record<string, string>;
  groupColors?: Record<string, number>;
  groupCustomColors?: Record<string, string>;
  groupMascots?: Record<string, string>;
};

export function LiveAgentsPreview({
  agents,
  activeSessionId,
  onSelect,
  onClearFinished,
  bottomSpacing = false,
  groupLabels: groupLabelsProp,
  groupColors: groupColorsProp,
  groupCustomColors: groupCustomColorsProp,
  groupMascots: groupMascotsProp,
}: Props) {
  const [loadedGroupLabels] = useState(loadTabGroupLabels);
  const [loadedGroupColors] = useState(loadTabGroupColors);
  const [loadedGroupCustomColors] = useState(loadTabGroupCustomColors);
  const [loadedGroupMascots] = useState(loadTabGroupMascots);
  const groupLabels = groupLabelsProp ?? loadedGroupLabels;
  const groupColors = groupColorsProp ?? loadedGroupColors;
  const groupCustomColors = groupCustomColorsProp ?? loadedGroupCustomColors;
  const groupMascots = groupMascotsProp ?? loadedGroupMascots;
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lockList = useLockOverscroll<HTMLDivElement>();
  const shown = agents.length > 0;
  const ticking =
    shown && agents.some((agent) => !agent.done && agent.startedAt != null);

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  if (!shown) return null;

  const finished = agents.filter((agent) => agent.done).length;
  const extra = agents.length - LIVE_AGENT_CAP;
  const visible =
    expanded || extra <= 0 ? agents : agents.slice(0, LIVE_AGENT_CAP);

  return (
    <section
      aria-label="Working agents"
      className={`shrink-0 px-2 ${bottomSpacing ? "pb-2" : ""}`}
      data-live-agents-preview="full"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {agents.length} working agents
      </span>
      <div className="overflow-hidden rounded-lg bg-content/5">
        <div className="flex items-center gap-2 px-3.5 py-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)] motion-safe:animate-pulse"
          />
          <span className="min-w-0 flex-1 truncate text-xs text-content/50">
            Working
          </span>
          {onClearFinished && finished > 0 ? (
            <button
              type="button"
              onClick={onClearFinished}
              title={
                finished === agents.length
                  ? "Clear all"
                  : `Clear ${finished} finished`
              }
              className="-my-0.5 rounded px-1.5 py-0.5 text-[11px] text-content/40 hover:bg-content/8 hover:text-content"
            >
              Clear
            </button>
          ) : null}
          <span className="text-[11px] tabular-nums text-content/40">
            {agents.length}
          </span>
        </div>
        <div
          ref={expanded ? lockList : undefined}
          className={`flex flex-col gap-px px-1 ${
            extra > 0 ? "" : "pb-1"
          } ${expanded ? "max-h-[45vh] overflow-y-auto overscroll-none" : ""}`}
        >
          {visible.map((agent) => (
            <LiveAgentCard
              key={agent.id}
              agent={agent}
              now={now}
              selected={agent.id === activeSessionId}
              onSelect={onSelect}
              groupLabels={groupLabels}
              groupColors={groupColors}
              groupCustomColors={groupCustomColors}
              groupMascots={groupMascots}
            />
          ))}
        </div>
        {extra > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="flex w-full items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-content/50 hover:bg-content/8 hover:text-content"
          >
            {expanded ? (
              <ChevronUp className="size-3" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="size-3" strokeWidth={1.75} />
            )}
            {expanded ? "Show less" : `${extra} more`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function LiveAgentCard({
  agent,
  now,
  selected,
  onSelect,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupMascots,
}: {
  agent: LiveAgent;
  now: number;
  selected: boolean;
  onSelect?: (sessionId: string) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupMascots: Record<string, string>;
}) {
  const { mono } = agent;
  const seed = projectName(agent.cwd);
  const key = projectKey(agent.cwd);
  // A Mono's chat lives in its own folder, so its row names a project only
  // while a session it started leads.
  const project =
    mono?.leadId === agent.id
      ? ""
      : resolveTabGroupLabel(key, groupLabels, seed);
  const color =
    mono?.color ??
    resolveTabGroupColor(key, groupColors, groupCustomColors, seed);
  const elapsed = agent.done
    ? agent.durationMs != null
      ? formatLiveElapsed(0, agent.durationMs)
      : ""
    : agent.startedAt != null
      ? formatLiveElapsed(agent.startedAt, now)
      : "";
  const activity = agent.needsApproval
    ? "Need approval"
    : agent.done
      ? "Done"
      : agent.activity;
  const live = !agent.needsApproval && !agent.done;
  const others = mono ? mono.sessionIds.length - 1 : 0;
  const details = [
    agent.title,
    mono ? "Mono" : undefined,
    project,
    activity,
    elapsed,
  ].filter(Boolean);

  return (
    <button
      type="button"
      title={details.join("\n")}
      aria-label={details.join(", ")}
      aria-current={selected ? "true" : undefined}
      data-live-agent-card={agent.id}
      data-live-agent-kind={mono ? "mono" : "project"}
      onClick={() => onSelect?.(agent.id)}
      // A Mono's row is washed in its color, with a bar at its edge; a
      // project's stays plain, so the two read apart at a glance.
      style={mono ? ({ "--mono-color": mono.color } as CSSProperties) : undefined}
      className={`relative flex w-full flex-col rounded-md px-2 py-1.5 text-left ${
        selected
          ? "bg-selection"
          : mono
            ? "bg-[var(--mono-color)]/10 hover:bg-[var(--mono-color)]/15"
            : "hover:bg-content/8"
      }`}
    >
      {mono ? (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[var(--mono-color)]"
        />
      ) : null}
      <span className="flex min-w-0 items-center gap-2">
        <ProjectMascot
          project={mono ? mono.name : seed}
          color={color}
          name={mono ? mono.mascot : resolveTabGroupMascot(key, groupMascots)}
          className="size-2 shrink-0"
          active={live}
        />
        {live ? (
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug">
            {agent.title}
          </p>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug">
            {agent.title}
          </span>
        )}
        {mono ? (
          <span className="shrink-0 rounded bg-[var(--mono-color)]/20 px-1 text-[10px] font-medium leading-4 text-[var(--mono-color)]">
            Mono
          </span>
        ) : null}
      </span>
      <span
        className={`mt-1 flex min-w-0 items-center gap-1.5 pl-4 text-[11px] leading-tight ${
          agent.needsApproval
            ? "text-amber-400"
            : agent.done
              ? "text-emerald-400"
              : "text-content/50"
        }`}
      >
        {agent.needsApproval ? (
          <CircleAlert className="size-3 shrink-0" strokeWidth={1.75} />
        ) : agent.done ? (
          <Check className="size-3 shrink-0" strokeWidth={2.25} />
        ) : (
          <TerminalSpinner className="inline-block w-3 select-none text-center text-[11px] leading-none" />
        )}
        <span className="min-w-0 truncate">{activity}</span>
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5 pl-4 text-[11px] leading-tight text-content/45">
        <HarnessIcon harness={agent.harness} className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {project}
          {others > 0 ? (
            <span className="text-content/35">
              {project ? " " : ""}+{others}
            </span>
          ) : null}
        </span>
        {elapsed ? (
          <span className="shrink-0 tabular-nums">{elapsed}</span>
        ) : null}
      </span>
    </button>
  );
}
