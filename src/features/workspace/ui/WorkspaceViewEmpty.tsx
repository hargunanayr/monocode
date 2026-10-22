import { MOD } from "../../../platform/tauri/platform";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { Chatting, FileScript } from "../../../shared/ui/icons";
import type { WorkspaceView } from "../model/workspaceView";

type Props = {
  mode: WorkspaceView;
  onNewSession?: () => void;
  onGoToFile?: () => void;
};

/** The main area while the current mode has no tab of its own to show. */
export function WorkspaceViewEmpty({ mode, onNewSession, onGoToFile }: Props) {
  const chat = mode === "chat";
  const Icon = chat ? Chatting : FileScript;
  const action = chat ? onNewSession : onGoToFile;
  return (
    <div
      data-workspace-view-empty={mode}
      className="absolute inset-0 flex select-none flex-col items-center justify-center gap-3 text-content/50"
    >
      <Icon className="size-6 opacity-60" strokeWidth={1.5} />
      <p className="text-[13px]">
        {chat
          ? "Pick a session in the sidebar, or start a new one."
          : "Open a file from the Explorer or Git."}
      </p>
      {action ? (
        <SecondaryButton onClick={action}>
          {chat ? "New Session" : "Go to File"}
          <span className="text-content/40">
            {chat ? `${MOD}T` : `${MOD}P`}
          </span>
        </SecondaryButton>
      ) : null}
    </div>
  );
}
