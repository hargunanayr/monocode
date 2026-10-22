import { openUrl } from "@tauri-apps/plugin-opener";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { htmlArtifactUrl } from "../artifacts";
import {
  parseSendToMono,
  resolveArtifactMono,
  type ArtifactMono,
} from "../artifactActions";
import { ArtifactActionsContext, SendToMonoDialog } from "./SendToMonoDialog";

type FrameTheme = { scheme: "dark" | "light"; vars: Record<string, string> };

// Page-facing names, resolved to concrete colors: a page cannot see the app's
// own variables, and unresolved `var()` or `color-mix()` would mean nothing there.
const THEME_COLORS: Record<string, string> = {
  "--background": "var(--color-background-base)",
  "--foreground": "var(--color-content)",
  // Blend against the page background so these also work as solid text/fill colors.
  "--muted":
    "color-mix(in srgb, var(--color-content) 55%, var(--color-background-base))",
  "--surface":
    "color-mix(in srgb, var(--color-content) 5%, var(--color-background-base))",
  "--border":
    "color-mix(in srgb, var(--color-content) 12%, var(--color-background-base))",
  "--accent": "var(--color-accent)",
  "--link": "var(--link-color)",
  "--positive": "var(--color-diff-add)",
  "--negative": "var(--color-diff-del)",
};
const CHART_COLORS = [
  "var(--color-accent)",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#a78bfa",
  "#22d3ee",
];

function readTheme(): FrameTheme {
  const root = document.documentElement;
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolve = (value: string) => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(THEME_COLORS))
    vars[name] = resolve(value);
  CHART_COLORS.forEach((value, index) => {
    vars[`--chart-${index + 1}`] = resolve(value);
  });
  probe.remove();
  const style = getComputedStyle(root);
  vars["--font-sans"] = style.getPropertyValue("--font-sans").trim();
  vars["--font-mono"] = style.getPropertyValue("--font-mono").trim();
  vars["--radius"] = "10px";
  return {
    scheme: root.classList.contains("theme-light") ? "light" : "dark",
    vars,
  };
}

/** The app theme as page variables, following theme and appearance changes. */
function useFrameTheme(): FrameTheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const MIN_HEIGHT = 80;
const PLACEHOLDER_HEIGHT = 240;

/**
 * An `html` artifact in a sandboxed frame. It never gets allow-same-origin,
 * so the page runs in an opaque origin with no reach into the app, and its
 * served CSP stops it fetching anything. The frame fits the page's reported
 * height, so the reader around it does the scrolling. What it asks the app to
 * do, such as sending a Mono a message, waits for the user to confirm.
 */
export function HtmlArtifactFrame({
  id,
  title,
  version,
}: {
  id: string;
  title: string;
  /** Changes when the artifact is saved, reloading the page. */
  version: number;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const theme = useFrameTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [ready, setReady] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const actions = useContext(ArtifactActionsContext);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [sending, setSending] = useState<{
    requestId: number;
    mono: ArtifactMono;
    message: string;
  } | null>(null);
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  const reply = (
    requestId: number,
    result: { sent: boolean; error?: string },
  ) =>
    frameRef.current?.contentWindow?.postMessage(
      { type: "monocode:action-result", id: requestId, ...result },
      "*",
    );
  const postTheme = () =>
    frameRef.current?.contentWindow?.postMessage(
      { type: "monocode:theme", ...themeRef.current },
      "*",
    );
  useEffect(postTheme, [theme]);
  useEffect(() => {
    setReady(false);
    setContentHeight(null);
  }, [version]);
  // Listen from the commit that inserts the frame, so a fast page's first
  // messages are not missed.
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "monocode:ready") {
        postTheme();
        setReady(true);
      } else if (data.type === "monocode:height") {
        const height = (data as { height?: unknown }).height;
        if (typeof height === "number" && Number.isFinite(height))
          setContentHeight(Math.max(MIN_HEIGHT, Math.ceil(height)));
      } else if (data.type === "monocode:open-link") {
        const url = (data as { url?: unknown }).url;
        // Only a link the reader just clicked: the frame holds focus then.
        if (
          typeof url === "string" &&
          /^https?:\/\//i.test(url) &&
          document.activeElement === frame
        )
          void openUrl(url).catch(() => undefined);
      } else if (data.type === "monocode:send-to-mono") {
        const request = parseSendToMono(data as Record<string, unknown>);
        if (request.requestId === undefined) return;
        const refuse = (error: string) =>
          reply(request.requestId!, { sent: false, error });
        if ("error" in request) return refuse(request.error);
        // Only from a click the reader just made in this page.
        if (document.activeElement !== frame)
          return refuse("Sending needs a click in the page");
        if (sendingRef.current) return refuse("Another message is waiting");
        const host = actionsRef.current;
        if (!host)
          return refuse("Open this in MonoCode's main window to send it");
        const mono = resolveArtifactMono(host.monos(), request.mono);
        if ("error" in mono) return refuse(mono.error);
        setSending({
          requestId: request.requestId,
          mono,
          message: request.message,
        });
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  // A reload takes the page that asked away; it learns nothing more.
  useEffect(() => setSending(null), [version]);
  const height = contentHeight ?? PLACEHOLDER_HEIGHT;
  return (
    <>
      <iframe
        ref={frameRef}
        data-html-artifact={id}
        src={`${htmlArtifactUrl(id)}?v=${version}`}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={() => {
          // Covers a theme change that landed while the page was loading.
          postTheme();
          setReady(true);
        }}
        // Hidden until the page has the theme, so a dark app never flashes the
        // blank white document a frame starts with.
        className="block w-full border-0 transition-opacity duration-150"
        style={{
          height,
          opacity: ready ? 1 : 0,
          colorScheme: ready ? theme.scheme : "light",
        }}
      />
      {sending ? (
        <SendToMonoDialog
          mono={sending.mono}
          message={sending.message}
          source={title}
          onSend={async (message) => {
            const host = actionsRef.current;
            if (!host) throw new Error("MonoCode cannot send from here");
            await host.sendToMono(sending.mono.id, message);
            reply(sending.requestId, { sent: true });
            setSending(null);
            frameRef.current?.focus();
          }}
          onClose={() => {
            reply(sending.requestId, { sent: false });
            setSending(null);
            frameRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
