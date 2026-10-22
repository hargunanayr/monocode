import { MOD } from "../../../platform/tauri/platform";
import { Chatting, FolderOpen } from "../../../shared/ui/icons";
import type { WorkspaceView } from "../model/workspaceView";

const MODES = [
  { mode: "chat", label: "Chat", Icon: Chatting },
  { mode: "explore", label: "Explore", Icon: FolderOpen },
] as const;

type Props = {
  mode: WorkspaceView;
  onChange: (mode: WorkspaceView) => void;
};

/** Chat / Explore, at the start of the sidebar's tab row. */
export function WorkspaceViewSwitch({ mode, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Workspace view"
      data-tauri-drag-region="false"
      className="mr-1 flex h-6 shrink-0 items-center gap-px rounded-md bg-content/5 p-0.5"
    >
      {MODES.map(({ mode: option, label, Icon }) => {
        const active = option === mode;
        const tip = `${label} (${MOD}E)`;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={tip}
            title={tip}
            data-tauri-drag-region="false"
            onClick={() => {
              if (!active) onChange(option);
            }}
            className={`flex h-5 w-6 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-accent ${
              active
                ? "bg-selection text-content"
                : "text-content/45 hover:text-content/80"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
