import { useCallback, useReducer, useRef } from "react";
import { isLiveAgentSession } from "../model/liveAgents";
import type { Session } from "../model/session";
import { nextUnseenFinishedSessions } from "../model/sessionDone";

export function useUnseenFinishedSessions(
  sessions: Session[],
  busySessionIds: ReadonlySet<string>,
  activeSessionId?: string,
): [Set<string>, (ids: Iterable<string>) => void] {
  const busyForDoneRef = useRef(busySessionIds);
  const focusedForDoneRef = useRef(activeSessionId);
  const unseenFinishedRef = useRef<Set<string>>(new Set());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  if (
    busyForDoneRef.current !== busySessionIds ||
    focusedForDoneRef.current !== activeSessionId
  ) {
    unseenFinishedRef.current = nextUnseenFinishedSessions({
      previousBusyIds: busyForDoneRef.current,
      busyIds: busySessionIds,
      previousUnseenIds: unseenFinishedRef.current,
      focusedSessionId: activeSessionId,
      untrackedIds: new Set(
        sessions
          .filter((session) => !isLiveAgentSession(session))
          .map((session) => session.id),
      ),
    });
    busyForDoneRef.current = busySessionIds;
    focusedForDoneRef.current = activeSessionId;
  }
  /** Marks these sessions seen without opening them. */
  const markSeen = useCallback((ids: Iterable<string>) => {
    const next = new Set(unseenFinishedRef.current);
    for (const id of ids) next.delete(id);
    if (next.size === unseenFinishedRef.current.size) return;
    unseenFinishedRef.current = next;
    rerender();
  }, []);
  return [unseenFinishedRef.current, markSeen];
}
