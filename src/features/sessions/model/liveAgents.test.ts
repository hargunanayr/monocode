import { describe, expect, it } from "vitest";
import {
  formatLiveElapsed,
  liveAgentsFromSessions,
  type LiveMono,
} from "./liveAgents";
import { newSession, type Block, type Session } from "./session";

function chat(cwd: string, patch: Partial<Session> = {}): Session {
  const session = newSession("claude", cwd);
  session.title = "claude · Fix the sidebar";
  session.blocks = [{ id: "u1", role: "user", text: "hello", startedAt: 1_000 }];
  return { ...session, ...patch, blocks: patch.blocks ?? session.blocks };
}

function edit(id: string, path = "src/App.tsx", status = "in_progress"): Block {
  const fileName = path.split("/").pop() ?? path;
  return {
    id,
    role: "tool",
    text: `Edited ${path}`,
    tool: {
      kind: "edit",
      title: `Edited ${path}`,
      status,
      preview: { kind: "write", path, fileName },
    },
  };
}

const MONO: LiveMono = {
  id: "crab",
  sessionId: "mono-chat",
  name: "MonoCrab",
  mascot: "crab",
  color: "hsl(160 60% 50%)",
};

/** The Mono's chat, having started each of `launched` this turn. */
function monoChat(launched: Session[], patch: Partial<Session> = {}): Session {
  return chat("~/.monocode/monos/crab", {
    id: MONO.sessionId,
    ...patch,
    blocks: [
      {
        id: "mono-u1",
        role: "user",
        text: "fix the build",
        startedAt: 500,
        monoSpawnedSessions: launched.map((session) => ({
          sessionId: session.id,
          cwd: session.cwd,
          title: session.title,
          harness: session.harness,
          model: session.model,
        })),
      },
      ...(patch.blocks ?? []),
    ],
  });
}

/** A session whose latest turn the Mono sent, not the user. */
function launched(id: string, cwd: string, patch: Partial<Session> = {}) {
  return chat(cwd, {
    id,
    blocks: [
      { id: "u1", role: "user", text: "go", startedAt: 1_000, appRequestId: id },
    ],
    ...patch,
  });
}

describe("liveAgentsFromSessions", () => {
  it("shows a working Mono's chat as the Mono", () => {
    const mono = monoChat([], { busy: true });
    const [row] = liveAgentsFromSessions([mono], new Set(), [MONO]);
    expect(row).toMatchObject({
      id: MONO.sessionId,
      title: "MonoCrab",
      done: false,
      mono: {
        id: "crab",
        mascot: "crab",
        color: MONO.color,
        leadId: MONO.sessionId,
        sessionIds: [MONO.sessionId],
      },
    });
  });

  it("folds the sessions a Mono started into its row", () => {
    const app = launched("app-1", "/repo/optik", {
      busy: true,
      blocks: [
        { id: "u1", role: "user", text: "go", startedAt: 1_000, appRequestId: "app-1" },
        edit("t1"),
      ],
    });
    const regular = chat("/repo/site", {
      id: "regular",
      busy: true,
      blocks: [{ id: "u1", role: "user", text: "go", startedAt: 5_000 }],
    });
    const mono = monoChat([app]);
    const agents = liveAgentsFromSessions([mono, app, regular], new Set(), [MONO]);
    expect(agents.map((agent) => agent.id)).toEqual([MONO.sessionId, "regular"]);
    expect(agents[0]).toMatchObject({
      title: "MonoCrab",
      cwd: "/repo/optik",
      activity: "Edited src/App.tsx",
      mono: { leadId: "app-1", sessionIds: ["app-1"] },
    });
    expect(agents[1].mono).toBeUndefined();
  });

  it("shows a started session the user took over in its project", () => {
    const app = launched("app-1", "/repo/optik", {
      busy: true,
      blocks: [
        { id: "u1", role: "user", text: "go", startedAt: 1_000, appRequestId: "app-1" },
        { id: "u2", role: "user", text: "also the tests", startedAt: 2_000 },
      ],
    });
    const agents = liveAgentsFromSessions([monoChat([app]), app], new Set(), [MONO]);
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ id: "app-1", cwd: "/repo/optik" });
    expect(agents[0].mono).toBeUndefined();
  });

  it("leads with a started session that waits on the user", () => {
    const app = launched("app-1", "/repo/optik", {
      busy: true,
      blocks: [
        { id: "u1", role: "user", text: "go", startedAt: 1_000, appRequestId: "app-1" },
        { id: "a1", role: "approval", text: "run rm", approval: { requestId: 1 } },
      ],
    });
    const mono = monoChat([app], { busy: true });
    const [row] = liveAgentsFromSessions([mono, app], new Set(), [MONO]);
    expect(row).toMatchObject({
      id: MONO.sessionId,
      needsApproval: true,
      mono: { leadId: "app-1", sessionIds: ["app-1", MONO.sessionId] },
    });
  });

  it("is done only once every session it stands for is", () => {
    const app = launched("app-1", "/repo/optik", { busy: true });
    const mono = monoChat([app]);
    const working = liveAgentsFromSessions(
      [mono, app],
      new Set([MONO.sessionId]),
      [MONO],
    );
    expect(working).toHaveLength(1);
    expect(working[0]).toMatchObject({
      done: false,
      mono: { leadId: "app-1", sessionIds: ["app-1", MONO.sessionId] },
    });

    const finished = liveAgentsFromSessions(
      [mono, { ...app, busy: false }],
      new Set([MONO.sessionId, "app-1"]),
      [MONO],
    );
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ done: true, activity: "Done" });
  });

  it("lists a started session on its own while its Mono's chat is not loaded", () => {
    const app = launched("app-1", "/repo/optik", { busy: true });
    const agents = liveAgentsFromSessions([app], new Set(), [MONO]);
    expect(agents.map((agent) => agent.id)).toEqual(["app-1"]);
    expect(agents[0].mono).toBeUndefined();
  });

  it("keeps internal workers in their lead's agent panel", () => {
    const lead = chat("/repo", { id: "lead", busy: true });
    const worker = chat("/repo", { id: "worker", busy: true, orchestrationLeadId: "lead" });
    expect(liveAgentsFromSessions([lead, worker]).map((agent) => agent.id)).toEqual(["lead"]);
  });
  it("skips idle sessions", () => {
    expect(liveAgentsFromSessions([chat("/tmp/a")])).toEqual([]);
  });

  it("maps a busy turn into a live agent", () => {
    const session = chat("/tmp/agent-terminal", {
      busy: true,
      blocks: [
        { id: "u1", role: "user", text: "hello", startedAt: 1_000 },
        edit("t1"),
      ],
    });
    expect(liveAgentsFromSessions([session])).toEqual([
      {
        id: session.id,
        cwd: "/tmp/agent-terminal",
        title: "Fix the sidebar",
        harness: "claude",
        activity: "Edited src/App.tsx",
        startedAt: 1_000,
        durationMs: undefined,
        needsApproval: false,
        done: false,
      },
    ]);
  });

  it("puts sessions waiting on approval first", () => {
    const working = chat("/tmp/a", {
      busy: true,
      blocks: [
        { id: "u1", role: "user", text: "go", startedAt: 1_000 },
        edit("t1"),
      ],
    });
    const waiting = chat("/tmp/b", {
      busy: true,
      blocks: [
        { id: "u1", role: "user", text: "go", startedAt: 2_000 },
        {
          id: "a1",
          role: "approval",
          text: "run rm",
          approval: { requestId: 1 },
        },
      ],
    });
    expect(liveAgentsFromSessions([working, waiting]).map((row) => row.id)).toEqual(
      [waiting.id, working.id],
    );
    expect(liveAgentsFromSessions([working, waiting])[0]?.needsApproval).toBe(
      true,
    );
  });

  it("treats a parked clarifying question as needing approval", () => {
    const waiting = chat("/tmp/ask", {
      busy: true,
      pendingQuestion: {
        requestId: 4,
        title: "Which file?",
        questions: [
          {
            id: "q1",
            prompt: "Which file?",
            multiSelect: false,
            allowCustom: true,
            options: [{ id: "a.ts", label: "a.ts" }],
          },
        ],
      },
    });
    expect(liveAgentsFromSessions([waiting])[0]).toMatchObject({
      id: waiting.id,
      activity: "Which file?",
      needsApproval: true,
      done: false,
    });
  });

  it("sorts working agents by longest-running turn first", () => {
    const newer = chat("/tmp/new", {
      busy: true,
      blocks: [{ id: "u1", role: "user", text: "go", startedAt: 5_000 }],
    });
    const older = chat("/tmp/old", {
      busy: true,
      blocks: [{ id: "u1", role: "user", text: "go", startedAt: 1_000 }],
    });
    expect(liveAgentsFromSessions([newer, older]).map((row) => row.cwd)).toEqual(
      ["/tmp/old", "/tmp/new"],
    );
  });

  it("keeps an unfocused finished session until it is seen", () => {
    const finished = chat("/tmp/done", {
      blocks: [
        {
          id: "u1",
          role: "user",
          text: "go",
          startedAt: 1_000,
          durationMs: 12_000,
        },
        edit("t1", "src/App.tsx", "completed"),
      ],
    });
    expect(liveAgentsFromSessions([finished])).toEqual([]);
    expect(
      liveAgentsFromSessions([finished], new Set([finished.id])),
    ).toEqual([
      {
        id: finished.id,
        cwd: "/tmp/done",
        title: "Fix the sidebar",
        harness: "claude",
        activity: "Done",
        startedAt: 1_000,
        durationMs: 12_000,
        needsApproval: false,
        done: true,
      },
    ]);
  });

  it("keeps a working session above a finished one", () => {
    const working = chat("/tmp/a", {
      busy: true,
      blocks: [{ id: "u1", role: "user", text: "go", startedAt: 5_000 }],
    });
    const finished = chat("/tmp/b", {
      blocks: [
        {
          id: "u1",
          role: "user",
          text: "go",
          startedAt: 1_000,
          durationMs: 8_000,
        },
      ],
    });
    expect(
      liveAgentsFromSessions(
        [finished, working],
        new Set([finished.id]),
      ).map((row) => row.cwd),
    ).toEqual(["/tmp/a", "/tmp/b"]);
  });
});

describe("formatLiveElapsed", () => {
  it("formats seconds, minutes, and hours", () => {
    expect(formatLiveElapsed(0, 1_000)).toBe("1s");
    expect(formatLiveElapsed(0, 38_000)).toBe("38s");
    expect(formatLiveElapsed(0, 72_000)).toBe("1m 12s");
    expect(formatLiveElapsed(0, 120_000)).toBe("2m");
    expect(formatLiveElapsed(0, 3_600_000)).toBe("1h");
    expect(formatLiveElapsed(0, 3_720_000)).toBe("1h 2m");
  });
});
