import { describe, expect, it } from "vitest";
import {
  newEditorWorkspaceTab,
  newFileTab,
  newTab,
  newTerminalFile,
  newTerminalWorkspaceTab,
  openEditorTab,
} from "./layout";
import {
  loadExploreSidebarTab,
  saveExploreSidebarTab,
  workspaceTabKind,
  workspaceViewOfSidebarTab,
  workspaceViewOfTab,
  workspaceViewTabs,
} from "./workspaceView";

const fileTab = (path: string) => newEditorWorkspaceTab(newFileTab(path, "/r"));
const terminalTab = () => newTerminalWorkspaceTab(newTerminalFile("/r", "zsh"));

describe("workspaceTabKind", () => {
  it("tells sessions, terminals and files apart", () => {
    expect(workspaceTabKind(newTab("s"))).toBe("session");
    expect(workspaceTabKind(terminalTab())).toBe("terminal");
    expect(workspaceTabKind(fileTab("/r/a.ts"))).toBe("file");
  });

  it("counts a chat with a file beside it as a session tab", () => {
    const tab = openEditorTab(newTab("s"), newFileTab("/r/a.ts", "/r"));
    expect(workspaceTabKind(tab)).toBe("session");
    expect(workspaceViewOfTab(tab)).toBe("chat");
  });
});

describe("workspaceViewTabs", () => {
  const first = newTab("s1");
  const second = newTab("s2");
  const terminal = terminalTab();
  const a = fileTab("/r/a.ts");
  const b = fileTab("/r/b.ts");
  const tabs = [first, a, terminal, second, b];

  it("Chat shows one session tab and every terminal", () => {
    expect(workspaceViewTabs(tabs, "chat", second.id)).toEqual([
      terminal,
      second,
    ]);
  });

  it("Chat falls back to the first session tab", () => {
    expect(workspaceViewTabs(tabs, "chat", "gone")).toEqual([first, terminal]);
    expect(workspaceViewTabs(tabs, "chat")).toEqual([first, terminal]);
  });

  it("Explore shows only file tabs", () => {
    expect(workspaceViewTabs(tabs, "explore", first.id)).toEqual([a, b]);
  });
});

describe("sidebar tabs", () => {
  it("map to a view", () => {
    expect(workspaceViewOfSidebarTab("sessions")).toBe("chat");
    expect(workspaceViewOfSidebarTab("inbox")).toBe("chat");
    expect(workspaceViewOfSidebarTab("files")).toBe("explore");
    expect(workspaceViewOfSidebarTab("changes")).toBe("explore");
  });

  it("remember the last Explore tab", () => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
      },
    });
    expect(loadExploreSidebarTab()).toBe("files");
    saveExploreSidebarTab("changes");
    expect(loadExploreSidebarTab()).toBe("changes");
  });
});
