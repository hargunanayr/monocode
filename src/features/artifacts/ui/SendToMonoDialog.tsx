import { createContext, useRef, useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { PixelMascot } from "../../projects/ui/PixelMascot";
import {
  ARTIFACT_MESSAGE_MAX_CHARS,
  type ArtifactActions,
  type ArtifactMono,
} from "../artifactActions";

/** Provided where a page's actions can reach the app; pages elsewhere are read-only. */
export const ArtifactActionsContext = createContext<ArtifactActions | null>(
  null,
);

/**
 * What a page asked to send, shown to the user before it goes. The page
 * wrote the message, so the user reads it, may edit it, and sends it as theirs.
 */
export function SendToMonoDialog({
  mono,
  message: initial,
  source,
  onSend,
  onClose,
}: {
  mono: ArtifactMono;
  message: string;
  /** The page's title, so the user knows what is asking. */
  source: string;
  onSend: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const close = () => {
    if (!running.current) onClose();
  };
  const trimmed = message.trim();
  const send = async () => {
    if (running.current || !trimmed) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onSend(trimmed);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Send to ${mono.name}`}
      description={`From “${source}”`}
      size="md"
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex flex-col gap-3 px-4 pt-3 pb-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[12px] text-content/55">
            <PixelMascot
              name={mono.mascot}
              color={mono.color}
              still
              className="size-3.5 shrink-0"
            />
            Goes to {mono.name}’s chat as your message
          </span>
          <textarea
            autoFocus
            value={message}
            maxLength={ARTIFACT_MESSAGE_MAX_CHARS}
            rows={8}
            aria-label={`Message to ${mono.name}`}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
            className="min-h-32 resize-y rounded-md border border-content/10 bg-content/5 px-2.5 py-2 text-[13px] leading-5 text-content outline-none focus:border-content/30"
          />
        </label>
        {error ? (
          <p role="alert" className="text-[12px] leading-5 text-red-400">
            Could not send. {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2 text-[12px]">
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="rounded-md px-3 py-1.5 text-content/70 enabled:hover:bg-content/8 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !trimmed}
            className="rounded-md bg-accent px-3 py-1.5 font-medium text-white enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Sending…" : `Send to ${mono.name}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
