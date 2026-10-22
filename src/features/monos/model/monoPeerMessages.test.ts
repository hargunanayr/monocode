import { expect, it } from "vitest";
import {
  queuedSteerTarget,
  queuedMessageForSubmit,
} from "../../sessions/model/messageQueue";
import { groupMonoTurns } from "../../sessions/model/transcriptActivity";
import {
  newSession,
  type Block,
  type MonoPeerMessage,
} from "../../sessions/model/session";
import {
  MONO_THREAD_MAX_HOPS,
  answeringPeerMessage,
  monoPeerQueuedMessage,
  nextPeerHop,
} from "./monoPeerMessages";

const peer = (hop: number): MonoPeerMessage => ({
  fromMonoId: "mono-2",
  fromName: "Kiko",
  threadId: "thread-1",
  hop,
  message: "Can you check the release notes?",
});

it("answers the Mono whose message opened the current turn", () => {
  const prompt: Block = {
    id: "p",
    role: "user",
    text: "…",
    internal: true,
    monoPeerMessage: peer(2),
  };
  expect(answeringPeerMessage([prompt])).toEqual(peer(2));
  expect(nextPeerHop([prompt], "new")).toEqual({
    threadId: "thread-1",
    hop: 3,
  });
  // A draft is not a turn; a user's message is.
  expect(
    answeringPeerMessage([
      prompt,
      { id: "d", role: "user", text: "draft", draft: true },
    ]),
  ).toEqual(peer(2));
  expect(
    nextPeerHop([prompt, { id: "u", role: "user", text: "hi" }], "new"),
  ).toEqual({ threadId: "new", hop: 1 });
});

it("tells the last message in a thread that it cannot reply", () => {
  expect(monoPeerQueuedMessage("m", peer(1)).text).toContain(
    'app monos.send {"monoId":"mono-2"',
  );
  const last = monoPeerQueuedMessage("m", peer(MONO_THREAD_MAX_HOPS)).text;
  expect(last).toContain("cannot reply to it");
  expect(last).not.toContain("app monos.send {");
});

it("waits for an idle Mono instead of steering its turn", () => {
  const session = {
    ...newSession("codex", "/Users/me", "codex:test"),
    busy: true,
    turnReady: true,
    queuedMessages: [monoPeerQueuedMessage("m", peer(1))],
  };
  expect(queuedSteerTarget(session)).toBeUndefined();
  expect(queuedMessageForSubmit(session, "m", "steer")).toBeUndefined();
  expect(
    queuedMessageForSubmit({ ...session, busy: false }, "m", "dispatch"),
  ).toBeDefined();
});

it("opens a turn of its own in the Mono's chat", () => {
  const blocks: Block[] = [
    { id: "u", role: "user", text: "Hello", startedAt: 1 },
    { id: "a", role: "assistant", text: "Hi" },
    {
      id: "p",
      role: "user",
      text: "…",
      internal: true,
      startedAt: 2,
      monoPeerMessage: peer(1),
    },
    { id: "r", role: "assistant", text: "Sure, on it." },
  ];
  expect(groupMonoTurns(blocks).map((turn) => turn.map((b) => b.id))).toEqual(
    [
      ["u", "a"],
      ["p", "r"],
    ],
  );
});
