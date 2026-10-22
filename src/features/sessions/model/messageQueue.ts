import { isPreparingHandoff } from "./handoff";
import type { QueuedMessage, Session } from "./session";

export function queuedHead(session: Session): QueuedMessage | undefined {
  return session.queuedMessages?.[0];
}

/** Hold auto-dispatch only while the item about to send is being edited. */
export function isEditingQueuedHead(session: Session): boolean {
  const head = queuedHead(session);
  return Boolean(head && session.editingQueuedMessageId === head.id);
}

export function dequeueQueuedMessage(
  session: Session,
  messageId: string,
): Session {
  const queuedMessages = (session.queuedMessages ?? []).filter(
    (message) => message.id !== messageId,
  );
  return {
    ...session,
    queuedMessages: queuedMessages.length > 0 ? queuedMessages : undefined,
    queueStatus: queuedMessages.length > 0 ? session.queueStatus : undefined,
    editingQueuedMessageId:
      session.editingQueuedMessageId === messageId
        ? undefined
        : session.editingQueuedMessageId,
  };
}

/**
 * True when the idle session can send its queued head as a new turn.
 * Busy / paused / resuming / usage-limited / preparing-handoff /
 * editing-the-head all wait.
 */
export function canDispatchQueuedHead(session: Session): boolean {
  if (session.busy) return false;
  if (session.worktreePreparing || session.worktreeRemoved) return false;
  if (session.usageLimit) return false;
  if (session.queueStatus === "paused" || session.queueStatus === "resuming") {
    return false;
  }
  const head = queuedHead(session);
  if (!head) return false;
  if (isEditingQueuedHead(session)) return false;
  if (isPreparingHandoff(session)) return false;
  return true;
}

/** App notifications and Mono messages open a turn of their own once idle. */
function waitsForIdle(message: QueuedMessage): boolean {
  return !!(message.monoSessionCompletion || message.monoPeerMessage);
}

/**
 * The follow-up a busy Mono takes next, once the provider is ready: the first
 * one the user wrote. Messages waiting for idle never hold it back, since the
 * turn they wait out may not end until the user says something.
 */
export function queuedSteerTarget(session: Session): QueuedMessage | undefined {
  const target = session.queuedMessages?.find(
    (message) => !waitsForIdle(message),
  );
  const steerable =
    !!target &&
    !!session.busy &&
    !!session.turnReady &&
    !session.worktreePreparing &&
    !session.worktreeRemoved &&
    !session.pendingSwitch &&
    !session.usageLimit &&
    !(
      session.pendingQuestion && session.pendingQuestion.autoResolveAt == null
    ) &&
    session.queueStatus !== "paused" &&
    session.queueStatus !== "resuming" &&
    session.editingQueuedMessageId !== target.id &&
    !isPreparingHandoff(session) &&
    target.intent !== "plan" &&
    target.intent !== "orchestrate";
  return steerable ? target : undefined;
}

/** Resolve a queued row for auto-dispatch (head, idle) or an explicit Steer. */
export function queuedMessageForSubmit(
  session: Session,
  messageId: string,
  mode: "dispatch" | "steer",
): QueuedMessage | undefined {
  const message = session.queuedMessages?.find(
    (entry) => entry.id === messageId,
  );
  if (!message) return undefined;
  if (mode === "steer") return waitsForIdle(message) ? undefined : message;
  if (queuedHead(session)?.id !== messageId) return undefined;
  if (!canDispatchQueuedHead(session)) return undefined;
  return message;
}
