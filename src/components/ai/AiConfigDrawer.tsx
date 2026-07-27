import { useState } from "react";
import { PROVIDERS, defaultModel, type AiConfig, type ProviderId } from "@/lib/ai-engine";

export function AiConfigDrawer({
  cfg,
  onClose,
  onSave,
}: {
  cfg: AiConfig | null;
  onClose: () => void;
  onSave: (c: AiConfig | null) => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(cfg?.provider ?? "groq");
  const [apiKey, setApiKey] = useState(cfg?.apiKey ?? "");
  const [model, setModel] = useState(cfg?.model ?? defaultModel(cfg?.provider ?? "groq"));
  const meta = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/80">
      <div className="w-full max-w-md h-full overflow-auto bg-black border-l border-hard p-6">
        <div className="flex items-center justify-between border-b border-hard pb-3 mb-4">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ AI_ENGINE_CONFIG ]</div>
          <button onClick={onClose} className="text-[#666] hover:text-white text-[11px]">
            [X CLOSE]
          </button>
        </div>

        <div className="space-y-4 text-[11px]">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">&gt; PROVIDER_SELECT</div>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    setModel(p.model);
                  }}
                  className="border px-2 py-2 text-[10px] uppercase tracking-widest"
                  style={{
                    borderColor: provider === p.id ? "#00ff66" : "#333",
                    backgroundColor: provider === p.id ? "#00ff66" : "transparent",
                    color: provider === p.id ? "#000" : "#fff",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">&gt; API_KEY</div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value.trim())}
              placeholder={meta.keyHint}
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">&gt; MODEL_ID</div>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value.trim())}
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </label>

          <div className="border border-hard p-3 text-[10px] text-[#666] leading-relaxed">
            &gt; TRANSPORT: browser -&gt; provider (SSE stream), no backend hop
            <br />
            &gt; STORAGE: localStorage[ai_engine_cfg] — this browser only
            <br />
            &gt; KEY is sent only to the selected provider endpoint
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onSave({ provider, apiKey, model: model || meta.model })}
              className="flex-1 border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black uppercase tracking-widest"
            >
              [ ACTIVATE ]
            </button>
            <button
              onClick={() => onSave(null)}
              className="flex-1 border border-[#ff5500] text-[#ff5500] py-2 hover:bg-[#ff5500] hover:text-black uppercase tracking-widest"
            >
              [ PURGE_KEY ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
