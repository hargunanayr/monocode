// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { newSession, type Block } from "../../sessions/model/session";
import { defaultSoul } from "../../monos/model/monoFiles";
import { MONO_THREAD_MAX_HOPS } from "../../monos/model/monoPeerMessages";
import { handleAgentApp, type AgentAppHost } from "./agentApp";

const SOULS: Record<string, string> = {
  "mono-1": "# Soul\n\n- Plan before building.\n",
  "mono-2": "# Soul\n\nA strict reviewer.\n\n- Check every edge case.\n",
  "mono-3": defaultSoul(),
};

function fixture(kind: "mono" | "habit" | "session" = "mono") {
  const source = newSession("codex", "/Users/me", "codex:test");
  source.id = "chat";
  const deliver = vi.fn(async () => ({ alreadySent: false }));
  const host = {
    isMono: (id: string) => kind === "mono" && id === source.id,
    isHabitRun: (id: string) => kind === "habit" && id === source.id,
    monoOf: () =>
      kind === "session" ? undefined : { id: "mono-1", projects: [] },
    agentFiles: async (monoId: string) => ({ soul: SOULS[monoId] }),
    monos: {
      list: () => [
        { id: "mono-1", name: "Pip", projects: ["/work/app"] },
        { id: "mono-2", name: "Kiko", projects: ["/work/api"] },
        { id: "mono-3", name: "Juno", projects: [] },
      ],
      deliver,
    },
  } as unknown as AgentAppHost;
  const run = (
    action: string,
    input: Record<string, unknown> = {},
    requestId = "req-1",
  ) => handleAgentApp(source, requestId, action, input, host);
  return { source, run, deliver };
}

function peerPrompt(hop: number, threadId = "thread-1"): Block {
  return {
    id: `peer-${hop}`,
    role: "user",
    text: "MonoCode Mono message: …",
    internal: true,
    monoPeerMessage: {
      fromMonoId: "mono-2",
      fromName: "Kiko",
      threadId,
      hop,
      message: "Found a bug in the API",
    },
  };
}

it("lists every Mono with its projects and the start of its soul", async () => {
  const { run } = fixture();
  expect(await run("monos.list")).toEqual({
    monos: [
      {
        id: "mono-1",
        name: "Pip",
        you: true,
        projects: [{ name: "app", path: "/work/app" }],
        soul: "- Plan before building.",
      },
      {
        id: "mono-2",
        name: "Kiko",
        projects: [{ name: "api", path: "/work/api" }],
        soul: "A strict reviewer. - Check every edge case.",
      },
      { id: "mono-3", name: "Juno", projects: [], soul: null },
    ],
  });
});

it("starts a thread when the turn is not answering another Mono", async () => {
  const { run, deliver } = fixture();
  const result = await run("monos.send", {
    monoId: "kiko",
    message: "  Can you review the API change?\r\n",
  });
  expect(result).toMatchObject({
    sentTo: { id: "mono-2", name: "Kiko" },
    threadId: "mono-message-mono-1-req-1",
    hop: 1,
    remaining: MONO_THREAD_MAX_HOPS - 1,
    alreadySent: false,
  });
  expect(deliver).toHaveBeenCalledWith(
    "mono-2",
    expect.objectContaining({
      id: "mono-message-mono-1-req-1",
      attachments: [],
      monoPeerMessage: {
        fromMonoId: "mono-1",
        fromName: "Pip",
        threadId: "mono-message-mono-1-req-1",
        hop: 1,
        message: "Can you review the API change?",
      },
    }),
  );
  const [, message] = deliver.mock.calls[0] as unknown as [
    string,
    { text: string },
  ];
  expect(message.text).toContain('app monos.send {"monoId":"mono-1"');
  expect(message.text).toContain("Can you review the API change?");
});

it("continues the thread it is answering, up to the cap", async () => {
  const { source, run, deliver } = fixture();
  source.blocks = [peerPrompt(3)];
  expect(
    await run("monos.send", { monoId: "mono-2", message: "Fixed it." }),
  ).toMatchObject({ threadId: "thread-1", hop: 4 });

  source.blocks = [peerPrompt(MONO_THREAD_MAX_HOPS)];
  await expect(
    run("monos.send", { monoId: "mono-2", message: "Thanks!" }, "req-2"),
  ).rejects.toThrow(`limit of ${MONO_THREAD_MAX_HOPS} messages`);
  expect(deliver).toHaveBeenCalledTimes(1);

  // A message from the user afterwards starts over.
  source.blocks = [
    peerPrompt(MONO_THREAD_MAX_HOPS),
    { id: "user-1", role: "user", text: "Ask Kiko again" },
  ];
  expect(
    await run("monos.send", { monoId: "Kiko", message: "Again?" }, "req-3"),
  ).toMatchObject({ threadId: "mono-message-mono-1-req-3", hop: 1 });
});

it("refuses itself, unknown Monos, habit runs and other sessions", async () => {
  const { run } = fixture();
  await expect(
    run("monos.send", { monoId: "mono-1", message: "Hi" }),
  ).rejects.toThrow("cannot message itself");
  await expect(
    run("monos.send", { monoId: "Pip", message: "Hi" }),
  ).rejects.toThrow("No other Mono is Pip");
  await expect(
    run("monos.send", { monoId: "Zed", message: "Hi" }),
  ).rejects.toThrow("Kiko (mono-2), Juno (mono-3)");
  await expect(run("monos.send", { monoId: "Kiko", message: " " })).rejects
    .toThrow("message must be a non-empty string");
  await expect(
    run("monos.send", { monoId: "Kiko", message: "Hi", threadId: "x" }),
  ).rejects.toThrow("Unknown monos.send fields: threadId");
  for (const kind of ["habit", "session"] as const) {
    await expect(fixture(kind).run("monos.list")).rejects.toThrow(
      "Only a Mono's own conversation",
    );
  }
});
