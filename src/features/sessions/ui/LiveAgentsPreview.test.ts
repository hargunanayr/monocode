// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveAgent } from "../model/liveAgents";
import { LiveAgentsPreview } from "./LiveAgentsPreview";

let container: HTMLDivElement;
let root: Root;

function agent(
  id: string,
  cwd: string,
  patch: Partial<LiveAgent> = {},
): LiveAgent {
  return {
    id,
    cwd,
    title: `Agent ${id}`,
    harness: "codex",
    activity: "Working",
    startedAt: 1_000,
    needsApproval: false,
    done: false,
    ...patch,
  };
}

function render(props: ComponentProps<typeof LiveAgentsPreview>) {
  act(() => root.render(createElement(LiveAgentsPreview, props)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("LiveAgentsPreview", () => {
  it("keeps the incoming activity order and the global four-agent cap", () => {
    render({
      agents: [
        agent("a-1", "/repo/a"),
        agent("b-1", "/repo/b", { needsApproval: true }),
        agent("a-2", "/repo/a"),
        agent("b-2", "/repo/b"),
        agent("c-1", "/repo/c"),
      ],
      groupLabels: { "/repo/a": "Alpha", "/repo/b": "Beta" },
      groupColors: {},
      groupCustomColors: {},
      groupMascots: {},
    });

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-live-agent-card]"),
    );
    expect(cards.map((card) => card.dataset.liveAgentCard)).toEqual([
      "a-1",
      "b-1",
      "a-2",
      "b-2",
    ]);
    expect(cards[0].textContent).toContain("Alpha");
    expect(cards[1].textContent).toContain("Beta");
    expect(cards[0].querySelector(".mascot-active")).not.toBeNull();
    expect(container.textContent).toContain("1 more");

    const more = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("1 more"),
    )!;
    act(() => more.click());
    expect(container.querySelectorAll("[data-live-agent-card]")).toHaveLength(
      5,
    );
  });

  it("selects an agent from the activity list", () => {
    const onSelect = vi.fn();
    render({
      agents: [agent("a", "/repo/a"), agent("b", "/repo/b")],
      onSelect,
      groupLabels: {},
      groupColors: {},
      groupCustomColors: {},
      groupMascots: {},
    });

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-live-agent-card="b"]')!
        .click(),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("shows from the first agent until the last one leaves", () => {
    const props = {
      groupLabels: {},
      groupColors: {},
      groupCustomColors: {},
      groupMascots: {},
    };
    const cards = () => container.querySelectorAll("[data-live-agent-card]");

    render({ ...props, agents: [agent("a", "/repo/a")] });
    expect(cards()).toHaveLength(1);

    render({
      ...props,
      agents: [
        agent("a", "/repo/a", { done: true }),
        agent("b", "/repo/b", { done: true }),
      ],
    });
    expect(cards()).toHaveLength(2);

    // Opening "a" marks it seen; "b" must stay in view.
    render({ ...props, agents: [agent("b", "/repo/b", { done: true })] });
    expect(cards()).toHaveLength(1);

    render({ ...props, agents: [] });
    expect(container.querySelector("[data-live-agents-preview]")).toBeNull();

    render({ ...props, agents: [agent("c", "/repo/c")] });
    expect(cards()).toHaveLength(1);
  });

  it("offers to clear once an agent has finished", () => {
    const onClearFinished = vi.fn();
    const props = {
      onClearFinished,
      groupLabels: {},
      groupColors: {},
      groupCustomColors: {},
      groupMascots: {},
    };
    const clear = () =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Clear",
      );

    render({ ...props, agents: [agent("a", "/repo/a")] });
    expect(clear()).toBeUndefined();

    render({
      ...props,
      agents: [agent("a", "/repo/a"), agent("b", "/repo/b", { done: true })],
    });
    expect(clear()!.title).toBe("Clear 1 finished");
    act(() => clear()!.click());
    expect(onClearFinished).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-live-agent-card="b"]')).not.toBeNull();

    render({ ...props, agents: [agent("b", "/repo/b", { done: true })] });
    expect(clear()!.title).toBe("Clear all");
  });

  it("sets a Mono's row apart from a project's", () => {
    const mono = {
      id: "crab",
      name: "MonoCrab",
      mascot: "crab",
      color: "hsl(160 60% 50%)",
    };
    render({
      agents: [
        agent("mono-chat", "/repo/optik", {
          title: "MonoCrab",
          mono: { ...mono, leadId: "app-1", sessionIds: ["app-1", "mono-chat"] },
        }),
        agent("own", "~/.monocode/monos/crab", {
          title: "MonoCrab",
          mono: { ...mono, leadId: "own", sessionIds: ["own"] },
        }),
        agent("plain", "/repo/site"),
      ],
      groupLabels: { "/repo/optik": "Optik", "/repo/site": "Site" },
      groupColors: {},
      groupCustomColors: {},
      groupMascots: {},
    });

    const card = (id: string) =>
      container.querySelector<HTMLElement>(`[data-live-agent-card="${id}"]`)!;
    expect(card("mono-chat").dataset.liveAgentKind).toBe("mono");
    expect(card("mono-chat").style.getPropertyValue("--mono-color")).toBe(
      mono.color,
    );
    expect(card("mono-chat").textContent).toContain("Mono");
    // Led by a session it started: that session's project, and the rest.
    expect(card("mono-chat").textContent).toContain("Optik +1");
    // Led by its own chat, which works in no project.
    expect(card("own").textContent).not.toContain("monos");
    expect(card("plain").dataset.liveAgentKind).toBe("project");
    expect(card("plain").textContent).not.toContain("Mono");
  });

  it("keeps elapsed timers out of its live region", () => {
    render({
      agents: [agent("a", "/repo/a"), agent("b", "/repo/b")],
      groupLabels: {},
      groupColors: {},
      groupCustomColors: {},
      groupMascots: {},
    });

    const liveRegion = container.querySelector('[aria-live="polite"]')!;
    expect(liveRegion.textContent).toBe("2 working agents");
    expect(liveRegion.textContent).not.toMatch(/\d+s/);
    expect(container.querySelector("[role=status]")).toBeNull();
  });
});
