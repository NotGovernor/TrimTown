import { Show, onCleanup, onMount } from "solid-js";
import { settingsOpen, setSettingsOpen } from "../stores/appStore";
import SettingsPage from "../pages/SettingsPage";

export default function SettingsModal() {
  const close = () => setSettingsOpen(false);

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settingsOpen()) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={settingsOpen()}>
      <div class="fixed top-14 inset-x-0 bottom-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
        <div class="relative bg-bg-secondary border border-border rounded-xl shadow-2xl flex flex-col max-w-2xl w-full mx-4 max-h-[85vh]">
          <div class="flex items-start justify-between px-6 py-4 border-b border-border">
            <h2 class="text-base font-semibold text-text-primary">Settings</h2>
            <button
              type="button"
              onClick={close}
              class="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 ml-4 mt-0.5"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-6">
            <SettingsPage />
          </div>
        </div>
      </div>
    </Show>
  );
}
