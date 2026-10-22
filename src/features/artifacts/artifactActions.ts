/**
 * What an `html` artifact's page may ask the app to do. The page is written
 * by an agent and runs sandboxed, so each request is checked here and the
 * user confirms it before anything happens.
 */

export type ArtifactMono = {
  id: string;
  name: string;
  mascot: string;
  color: string;
};

/** The app's side of a page's actions; absent where pages cannot act. */
export type ArtifactActions = {
  monos(): ArtifactMono[];
  /** Sends the message to the Mono's chat as the user, as its composer would. */
  sendToMono(monoId: string, message: string): Promise<void>;
};

export const ARTIFACT_MESSAGE_MAX_CHARS = 8_000;

export type SendToMonoRequest = {
  requestId: number;
  mono: string;
  message: string;
};

/** A `monocode:send-to-mono` message from the page, or why it is refused. */
export function parseSendToMono(
  data: Record<string, unknown>,
): SendToMonoRequest | { requestId?: number; error: string } {
  const requestId =
    Number.isSafeInteger(data.id) && (data.id as number) > 0
      ? (data.id as number)
      : undefined;
  if (requestId === undefined) return { error: "Invalid request" };
  const mono = typeof data.mono === "string" ? data.mono.trim() : "";
  if (!mono || mono.length > 200)
    return { requestId, error: "Name the Mono to send to" };
  const message =
    typeof data.message === "string"
      ? data.message.replace(/\r\n?/g, "\n").trim()
      : "";
  if (!message || message.length > ARTIFACT_MESSAGE_MAX_CHARS)
    return {
      requestId,
      error: `The message must be text under ${ARTIFACT_MESSAGE_MAX_CHARS} characters`,
    };
  return { requestId, mono, message };
}

/** The Mono a page names, by its ID or its name. */
export function resolveArtifactMono(
  monos: readonly ArtifactMono[],
  named: string,
): ArtifactMono | { error: string } {
  const byId = monos.find((mono) => mono.id === named);
  if (byId) return byId;
  const byName = monos.filter(
    (mono) => mono.name.toLowerCase() === named.toLowerCase(),
  );
  if (byName.length === 1) return byName[0];
  const names = monos.map((mono) => mono.name).join(", ") || "none";
  return {
    error: byName.length
      ? `Several Monos are named ${named}`
      : `No Mono is named ${named}. Monos: ${names}`,
  };
}
