import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Field,
  PageHeader,
  Skeleton,
  controlCls,
} from "../components/ui";
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
  const [openaiModel, setOpenaiModel] = useState("");
  const [defaultFont, setDefaultFont] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setLlmOrder(settings.data.llm_order);
      setGeminiModel(settings.data.gemini_model);
      setGlmModel(settings.data.glm_model);
      setOpenaiModel(settings.data.openai_model);
      setDefaultFont(settings.data.default_font);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        llm_order: llmOrder,
        gemini_model: geminiModel,
        glm_model: glmModel,
        openai_model: openaiModel,
        default_font: defaultFont,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  if (settings.isPending)
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  if (settings.isError || !settings.data) {
    return (
      <Alert role="alert">
        Failed to load settings: {String(settings.error)}
      </Alert>
    );
  }

  const touched =
    settings.data.llm_order !== llmOrder ||
    settings.data.gemini_model !== geminiModel ||
    settings.data.glm_model !== glmModel ||
    settings.data.openai_model !== openaiModel ||
    settings.data.default_font !== defaultFont;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        lede="Per-user preferences used by every tailor run from the web app. API keys stay server-side (.env); only ordering, models, and font live here."
      />

      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSaved(false);
            save.mutate();
          }}
        >
          <Field
            label="LLM order (comma-separated: gemini, glm, openai)"
            hint='"auto" tries these in order, skipping providers without keys.'
          >
            <input
              className={controlCls}
              value={llmOrder}
              onChange={(event) => setLlmOrder(event.target.value)}
              placeholder="gemini,glm,openai"
            />
          </Field>
          <Field label="Gemini model">
            <input
              className={controlCls}
              value={geminiModel}
              onChange={(event) => setGeminiModel(event.target.value)}
            />
          </Field>
          <Field label="GLM model">
            <input
              className={controlCls}
              value={glmModel}
              onChange={(event) => setGlmModel(event.target.value)}
            />
          </Field>
          <Field label="OpenAI model">
            <input
              className={controlCls}
              value={openaiModel}
              onChange={(event) => setOpenaiModel(event.target.value)}
              placeholder="gpt-4.1"
            />
          </Field>
          <Field label="Default resume font">
            <input
              className={controlCls}
              value={defaultFont}
              onChange={(event) => setDefaultFont(event.target.value)}
              placeholder="Calibri"
            />
          </Field>

          {save.isError && <Alert role="alert">{String(save.error)}</Alert>}
          {saved && save.isSuccess && (
            <p className="text-sm text-ok">Settings saved.</p>
          )}
          <Button
            type="submit"
            loading={save.isPending}
            disabled={save.isPending || !touched}
          >
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold">Provider status</h2>
        {providers.data ? (
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            <li>
              Auto resolves to:{" "}
              <span className="font-medium text-ink">
                {providers.data.auto}
              </span>
            </li>
            <li>Order: {providers.data.order.join(" → ")}</li>
            {Object.entries(providers.data.models).map(([name, model]) => (
              <li key={name}>
                {name} model: <span className="font-mono text-xs">{model}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-2">Loading…</p>
        )}
      </Card>
    </div>
  );
}
