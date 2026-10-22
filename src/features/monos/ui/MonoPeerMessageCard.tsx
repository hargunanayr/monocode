import { useState } from "react";
import type { MonoPeerMessage } from "../../sessions/model/session";
import { PixelMascot } from "../../projects/ui/PixelMascot";
import { findMono, monoLook } from "../model/mono";

const CLAMP_CHARS = 600;

/**
 * Another Mono's message, as a received message in a messaging app: on the
 * left, signed with its sender's mascot, above the reply it gets here.
 */
export function MonoPeerMessageCard({ peer }: { peer: MonoPeerMessage }) {
  const [expanded, setExpanded] = useState(false);
  const sender = findMono(peer.fromMonoId);
  const look = sender ? monoLook(sender) : undefined;
  const long = peer.message.length > CLAMP_CHARS;
  const text =
    long && !expanded
      ? `${peer.message.slice(0, CLAMP_CHARS).trimEnd()}…`
      : peer.message;
  return (
    <div
      data-mono-peer-message={peer.fromMonoId}
      data-transcript-search-item
      className="flex flex-col items-start gap-1 px-4 pt-1.5 pb-3 font-sans"
    >
      <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[12px] text-content/55">
        {look ? (
          <PixelMascot
            name={look.mascot}
            color={look.color}
            still
            className="size-3.5 shrink-0"
          />
        ) : null}
        <span className="min-w-0 truncate font-medium text-content/75">
          {look?.name ?? peer.fromName}
        </span>
        <span aria-hidden className="shrink-0 text-content/25">
          ·
        </span>
        <span className="shrink-0">Mono message</span>
      </span>
      <div className="max-w-[min(36rem,calc(100%-3.5rem))] rounded-2xl rounded-tl-md border border-content/10 bg-content/[0.04] px-3 py-2 text-[14px] whitespace-pre-wrap break-words text-content/90">
        {text}
        {long ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 block text-[12px] text-content/50 hover:text-content/80"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
