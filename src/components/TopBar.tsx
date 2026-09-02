import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toggleSettings } from "../lib/settingsUi";
import logoUrl from "../../src-tauri/icons/icon.png";

const captionBtn =
  "h-8 w-10 inline-flex items-center justify-center text-text-secondary hover:text-gold hover:bg-gold/10";
const closeBtn =
  "h-8 w-10 inline-flex items-center justify-center text-text-secondary hover:text-white hover:bg-danger";

function stop(e: Event) {
  e.stopPropagation();
}

export default function TopBar() {
  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized);
    let unlisten = () => {};
    void win.onResized(async () => {
      setMaximized(await win.isMaximized());
    }).then((fn) => {
      unlisten = fn;
    });
    onCleanup(() => unlisten());
  });

  return (
    <header
      class="h-14 relative z-[80] bg-bg-secondary border-b border-border flex items-center justify-between px-2 flex-shrink-0"
      data-tauri-drag-region
      onDblClick={() => void getCurrentWindow().toggleMaximize()}
    >
      <div class="flex items-center gap-2 px-2 pointer-events-none" data-tauri-drag-region>
        <img src={logoUrl} alt="TrimTown" class="w-5 h-5" />
        <span class="text-gold tracking-wider uppercase font-mono text-sm">TrimTown</span>
      </div>
      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          type="button"
          class="text-gold p-1 pointer-events-auto"
          aria-label="Settings"
          onClick={(e) => {
            stop(e);
            toggleSettings();
          }}
          onDblClick={stop}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          type="button"
          class={captionBtn}
          aria-label="Minimize"
          onClick={(e) => {
            stop(e);
            void getCurrentWindow().minimize();
          }}
          onDblClick={stop}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-width="2" d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          class={captionBtn}
          aria-label={maximized() ? "Restore" : "Maximize"}
          onClick={(e) => {
            stop(e);
            void getCurrentWindow().toggleMaximize();
          }}
          onDblClick={stop}
        >
          <Show
            when={maximized()}
            fallback={
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="1" stroke-width="2" />
              </svg>
            }
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="4" width="10" height="10" rx="1" stroke-width="2" />
              <rect x="4" y="8" width="10" height="10" rx="1" stroke-width="2" />
            </svg>
          </Show>
        </button>
        <button
          type="button"
          class={closeBtn}
          aria-label="Close"
          onClick={(e) => {
            stop(e);
            void getCurrentWindow().close();
          }}
          onDblClick={stop}
        >
          <svg
            class="w-3.5 h-3.5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
