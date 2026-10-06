import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchProviders, fetchSettings, updateSettings } from "../lib/api";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });

  const [llmOrder, setLlmOrder] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [glmModel, setGlmModel] = useState("");
  const [defaultFont, setDefaultFont] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setLlmOrder(settings.data.llm_order);
      setGeminiModel(settings.data.gemini_model);
      setGlmModel(settings.data.glm_model);
      setDefaultFont(settings.data.default_font);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        llm_order: llmOrder,
        gemini_model: geminiModel,
        glm_model: glmModel,
        default_font: defaultFont,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  if (settings.isPending)
    return <p className="text-slate-500">Loading settings…</p>;
  if (settings.isError || !settings.data) {
    return (
      <p role="alert" className="text-rose-600">
        Failed to load settings: {String(settings.error)}
      </p>
    );
  }

  const touched =
    settings.data.llm_order !== llmOrder ||
    settings.data.gemini_model !== geminiModel ||
    settings.data.glm_model !== glmModel ||
    settings.data.default_font !== defaultFont;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-sm text-slate-500">
        Per-user preferences used by every tailor run from the web app. API keys
        stay server-side (.env); only ordering, models, and font live here.
      </p>

      <form
        className="rounded-xl border border-slate-200 bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            LLM order (comma-separated: gemini, glm)
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={llmOrder}
              onChange={(event) => setLlmOrder(event.target.value)}
              placeholder="gemini,glm"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              "auto" tries these in order, skipping providers without keys.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Gemini model
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={geminiModel}
              onChange={(event) => setGeminiModel(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            GLM model
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={glmModel}
              onChange={(event) => setGlmModel(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Default resume font
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={defaultFont}
              onChange={(event) => setDefaultFont(event.target.value)}
              placeholder="Calibri"
            />
          </label>
        </div>
        {save.isError && (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {String(save.error)}
          </p>
        )}
        {saved && save.isSuccess && (
          <p className="mt-3 text-sm text-emerald-700">Settings saved.</p>
        )}
        <button
          type="submit"
          disabled={save.isPending || !touched}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Provider status</h2>
        {providers.data ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>
              Auto resolves to:{" "}
              <span className="font-medium">{providers.data.auto}</span>
            </li>
            <li>Order: {providers.data.order.join(" → ")}</li>
            {Object.entries(providers.data.models).map(([name, model]) => (
              <li key={name}>
                {name} model: <span className="font-mono text-xs">{model}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        )}
      </div>
    </div>
  );
}
