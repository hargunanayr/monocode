import { composeToolTitle } from "../../../integrations/harness/core/preview";
import { monoSpawnedSessions } from "../../monos/model/monoSpawnedSessions";
import { isInFlightSession } from "./inFlight";
import { displayPath } from "../../../shared/lib/paths";
import {
  sessionDisplayTitle,
  type Block,
  type HarnessId,
  type Session,
} from "./session";

export type LiveAgent = {
  id: string;
  cwd: string;
  title: string;
  harness: HarnessId;
  activity: string;
  startedAt?: number;
  durationMs?: number;
  needsApproval: boolean;
  done: boolean;
  /**
   * A Mono's row, standing for its chat and the sessions it sent work to.
   * `id` is then its chat, which the row opens, and the rest of the row is
   * the session leading it.
   */
  mono?: LiveAgentMono;
};

/** A Mono as the Working list shows it. */
export type LiveMono = {
  id: string;
  /** Its conversation. */
  sessionId: string;
  name: string;
  mascot: string;
  color: string;
};

export type LiveAgentMono = Omit<LiveMono, "sessionId"> & {
  /** The session whose activity the row shows: its chat, or one it started. */
  leadId: string;
  /** Every session the row stands for, which clearing it marks seen. */
  sessionIds: string[];
};

/** Inbox discussions and orchestration workers have their own panels and
 * never appear as live agents. */
export function isLiveAgentSession(
  session: Pick<Session, "inboxAsk" | "orchestrationLeadId">,
): boolean {
  return !session.inboxAsk && !session.orchestrationLeadId;
}

/**
 * Working and unseen finished sessions. A Mono's chat, and the sessions it
 * started that are still on work it sent them, show as one row for the
 * Mono; a session the user took over in its project shows on its own.
 */
export function liveAgentsFromSessions(
  sessions: Session[],
  unseenFinishedIds: ReadonlySet<string> = new Set(),
  monos: readonly LiveMono[] = [],
): LiveAgent[] {
  const owners = monoOwners(sessions, monos);
  const rows: LiveAgent[] = [];
  const monoRows = new Map<LiveMono, LiveAgent[]>();
  for (const session of sessions) {
    if (
      !isLiveAgentSession(session) ||
      !(isInFlightSession(session) || unseenFinishedIds.has(session.id))
    )
      continue;
    const agent = toLiveAgent(session, unseenFinishedIds.has(session.id));
    const mono = owners.get(session.id);
    if (!mono) rows.push(agent);
    else monoRows.set(mono, [...(monoRows.get(mono) ?? []), agent]);
  }
  for (const [mono, members] of monoRows) {
    // Waiting on the user first, then still working: the same order as the
    // list's, so the row reads as the most pressing of its sessions.
    const [lead, ...rest] = members.sort(compareLiveAgents);
    rows.push({
      ...lead,
      id: mono.sessionId,
      title: mono.name,
      mono: {
        id: mono.id,
        name: mono.name,
        mascot: mono.mascot,
        color: mono.color,
        leadId: lead.id,
        sessionIds: [lead.id, ...rest.map((member) => member.id)],
      },
    });
  }
  return rows.sort(compareLiveAgents);
}

/** Which Mono each loaded session works for. */
function monoOwners(
  sessions: readonly Session[],
  monos: readonly LiveMono[],
): Map<string, LiveMono> {
  const owners = new Map<string, LiveMono>();
  if (!monos.length) return owners;
  const byId = new Map(sessions.map((session) => [session.id, session]));
  for (const mono of monos) {
    const chat = byId.get(mono.sessionId);
    if (!chat) continue;
    owners.set(chat.id, mono);
    for (const launch of monoSpawnedSessions(chat.blocks)) {
      const session = byId.get(launch.sessionId);
      if (session && !owners.has(session.id) && sentThroughApp(session))
        owners.set(session.id, mono);
    }
  }
  return owners;
}

/**
 * Whether the session's latest turn came through the app, as a Mono's launch
 * or follow-up does, rather than from the user typing in its composer.
 */
function sentThroughApp(session: Session): boolean {
  for (let i = session.blocks.length - 1; i >= 0; i--) {
    const block = session.blocks[i];
    if (block.role === "user" && !block.draft) return !!block.appRequestId;
  }
  return false;
}

export function formatLiveElapsed(startedAt: number, now: number): string {
  const seconds = Math.max(1, Math.round((now - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minRest = minutes % 60;
  return minRest ? `${hours}h ${minRest}m` : `${hours}h`;
}

function toLiveAgent(session: Session, unseenFinished: boolean): LiveAgent {
  const pending = session.blocks.find(
    (block) => block.approval && !block.approval.decided,
  );
  const pendingQuestion = session.pendingQuestion;
  const done = unseenFinished && !isInFlightSession(session);
  const activityBlock = pending ?? lastActivityBlock(session.blocks);
  return {
    id: session.id,
    cwd: session.cwd,
    title: sessionDisplayTitle(session.title, session.harness),
    harness: session.harness,
    activity: done
      ? "Done"
      : pendingQuestion
        ? pendingQuestion.title ||
          pendingQuestion.questions[0]?.prompt ||
          "Question"
        : activityLabel(activityBlock, session.cwd),
    startedAt: turnStartedAt(session.blocks),
    durationMs: done ? turnDurationMs(session.blocks) : undefined,
    needsApproval: Boolean(pending) || Boolean(pendingQuestion),
    done,
  };
}

function compareLiveAgents(a: LiveAgent, b: LiveAgent): number {
  if (a.needsApproval !== b.needsApproval) return a.needsApproval ? -1 : 1;
  if (a.done !== b.done) return a.done ? 1 : -1;
  return (
    (a.startedAt ?? Number.MAX_SAFE_INTEGER) -
    (b.startedAt ?? Number.MAX_SAFE_INTEGER)
  );
}

function lastActivityBlock(blocks: Block[]): Block | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.role === "tool" || block.role === "approval") return block;
    if (block.role === "handoff" && block.handoff?.status === "preparing") {
      return block;
    }
  }
  return undefined;
}

function turnStartedAt(blocks: Block[]): number | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].role === "user") return blocks[i].startedAt;
  }
  return undefined;
}

function turnDurationMs(blocks: Block[]): number | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].role === "user") return blocks[i].durationMs;
  }
  return undefined;
}

function activityLabel(block: Block | undefined, cwd: string): string {
  if (!block) return "Working";
  if (block.role === "handoff" && block.handoff?.status === "preparing") {
    return "Preparing a handoff";
  }
  const preview = block.tool?.preview;
  const path = preview?.path
    ? displayPath(preview.path, cwd)
    : preview?.fileName;
  return (
    composeToolTitle({
      kind: block.tool?.kind,
      title: block.text || block.tool?.title,
      path,
      query: preview?.query,
      previewKind: preview?.kind,
      cwd,
    }) || "Working"
  );
}
