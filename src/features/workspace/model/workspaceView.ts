import type { SidebarTabId } from "../../settings/model/appearance";
import { isTerminalWorkspaceTab, leafIds, type WorkspaceTab } from "./layout";

/**
 * The workspace shows one side at a time. Chat: the sessions sidebar with the
 * open session and terminals as top tabs. Explore: the Explorer and Git
 * sidebar with only file tabs on top.
 */
export type WorkspaceView = "chat" | "explore";

export type WorkspaceTabKind = "session" | "terminal" | "file";

export type ExploreSidebarTab = Extract<SidebarTabId, "files" | "changes">;

const EXPLORE_SIDEBAR_TAB_KEY = "monocode.exploreSidebarTab";

/** A tab with any conversation is a session tab, whatever else it holds. */
export function workspaceTabKind(tab: WorkspaceTab): WorkspaceTabKind {
  if (isTerminalWorkspaceTab(tab)) return "terminal";
  const paneIds = new Set(
    [...tab.editorPanes, ...(tab.terminalPanes ?? [])].map((pane) => pane.id),
  );
  return leafIds(tab.layout).some((id) => !paneIds.has(id))
    ? "session"
    : "file";
}

export function workspaceViewOfTab(tab: WorkspaceTab): WorkspaceView {
  return workspaceTabKind(tab) === "file" ? "explore" : "chat";
}

export function workspaceViewOfSidebarTab(tab: SidebarTabId): WorkspaceView {
  return tab === "files" || tab === "changes" ? "explore" : "chat";
}

/**
 * Tabs the title bar shows in a mode. Chat keeps a single session tab (the
 * given one, else the first) beside every terminal; Explore shows file tabs.
 */
export function workspaceViewTabs<T extends WorkspaceTab>(
  tabs: readonly T[],
  mode: WorkspaceView,
  sessionTabId?: string,
): T[] {
  if (mode === "explore") {
    return tabs.filter((tab) => workspaceTabKind(tab) === "file");
  }
  const sessionTabs = tabs.filter((tab) => workspaceTabKind(tab) === "session");
  const shown =
    sessionTabs.find((tab) => tab.id === sessionTabId) ?? sessionTabs[0];
  return tabs.filter(
    (tab) => tab === shown || workspaceTabKind(tab) === "terminal",
  );
}

export function nextWorkspaceView(mode: WorkspaceView): WorkspaceView {
  return mode === "chat" ? "explore" : "chat";
}

/** The Explore sidebar tab last picked, so switching back lands on it. */
export function loadExploreSidebarTab(): ExploreSidebarTab {
  try {
    return localStorage.getItem(EXPLORE_SIDEBAR_TAB_KEY) === "changes"
      ? "changes"
      : "files";
  } catch {
    return "files";
  }
}

export function saveExploreSidebarTab(tab: ExploreSidebarTab) {
  try {
    localStorage.setItem(EXPLORE_SIDEBAR_TAB_KEY, tab);
  } catch {
    // private mode / quota
  }
}
