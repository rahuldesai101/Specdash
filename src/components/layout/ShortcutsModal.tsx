const KEYS: [string, string][] = [
  ["CTRL / ⌘ + K", "Open AI command palette"],
  ["CTRL / ⌘ + /", "Toggle this cheat-sheet"],
  ["[", "Toggle left navigation rail"],
  ["]", "Toggle right spec reader"],
  ["ESC", "Close drawers, modals and reader"],
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-lg bg-black border border-hard">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ KEYBOARD_SHORTCUTS ]</div>
          <button onClick={onClose} className="min-h-11 px-2 text-[#666] hover:text-white text-[11px]">
            [X CLOSE]
          </button>
        </div>
        <ul className="p-4 space-y-2 text-[11px]">
          {KEYS.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between gap-4 border border-hard px-3 py-2">
              <span className="text-[#00ff66] tracking-widest">{k}</span>
              <span className="text-[#888] text-right">{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
