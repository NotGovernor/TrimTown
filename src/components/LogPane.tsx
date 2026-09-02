import { For, Show, createEffect, on } from "solid-js";
import { logLines, logPaneOpen, setLogPaneOpen } from "../stores/appStore";

export default function LogPane() {
  let scrollRef: HTMLDivElement | undefined;

  createEffect(
    on(
      () => logLines().length,
      () => {
        if (scrollRef) {
          scrollRef.scrollTop = scrollRef.scrollHeight;
        }
      },
    ),
  );

  return (
    <div
      class={`border-t border-border bg-bg-secondary flex flex-col transition-all duration-200 ${
        logPaneOpen() ? "h-48" : "h-8"
      }`}
    >
      <div
        class="flex items-center justify-between px-4 h-8 flex-shrink-0 border-b border-border cursor-pointer"
        onClick={() => setLogPaneOpen(!logPaneOpen())}
      >
        <span class="text-xs font-medium text-text-secondary">Log</span>
        <span class="text-text-muted text-xs">{logPaneOpen() ? "▼" : "▲"}</span>
      </div>
      <Show when={logPaneOpen()}>
        <div ref={scrollRef} class="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-0.5">
          <For each={logLines()}>
            {(line) => <div class="text-text-secondary break-all">{line}</div>}
          </For>
        </div>
      </Show>
    </div>
  );
}
