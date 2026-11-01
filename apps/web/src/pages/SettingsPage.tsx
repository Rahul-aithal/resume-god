import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { SortAscIcon, SortDescIcon } from "../components/icons";
import ProviderKeyField, {
  PROVIDERS,
  type ProviderId,
} from "../components/ProviderKeyField";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Skeleton,
  ThemeToggle,
} from "../components/ui";
import { Switch } from "../components/ui/switch";
import { useAuth } from "../lib/auth";
import { fetchProviders, fetchSettings, updateSettings } from "../lib/api";

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

type ModelField = "gemini_model" | "glm_model" | "openai_model";

const MODEL_FIELD: Record<ProviderId, ModelField> = {
  gemini: "gemini_model",
  glm: "glm_model",
  openai: "openai_model",
};

const parseOrder = (order: string) =>
  order
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ProviderId => item in PROVIDERS);

interface Draft {
  llm_order: string;
  gemini_model: string;
  glm_model: string;
  openai_model: string;
  default_font: string;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-8 gap-y-3 lg:grid-cols-[15rem_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">{description}</p>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) setDraft({ ...settings.data });
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => updateSettings(draft!),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  if (settings.isPending || (settings.data && !draft)) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (settings.isError || !settings.data || !draft) {
    return (
      <Alert role="alert">
        Failed to load settings: {String(settings.error)}
      </Alert>
    );
  }

  const original = settings.data;
  const touched = (Object.keys(draft) as Array<keyof Draft>).some(
    (key) => draft[key] !== original[key],
  );

  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft({ ...draft, ...patch });
  };

  const enabled = parseOrder(draft.llm_order);
  const rows = [
    ...enabled,
    ...PROVIDER_IDS.filter((provider) => !enabled.includes(provider)),
  ];
  const setOrder = (order: ProviderId[]) =>
    update({ llm_order: order.join(",") });

  function move(provider: ProviderId, offset: -1 | 1) {
    const order = [...enabled];
    const index = order.indexOf(provider);
    [order[index], order[index + offset]] = [
      order[index + offset],
      order[index],
    ];
    setOrder(order);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        lede="Choose the AI providers, resume font, and theme for your account."
      />

      <Section
        title="AI providers"
        description={
          <>
            Auto mode tries the providers that are on, from the top, and skips
            any without a key. If none work, tailoring continues offline. API
            keys save right away, are stored encrypted, and can't be viewed
            again.
          </>
        }
      >
        {providers.data && (
          <p className="text-xs text-ink-2">
            Auto currently uses{" "}
            <span className="font-medium text-ink">{providers.data.auto}</span>
          </p>
        )}
        {rows.map((provider) => {
          const position = enabled.indexOf(provider);
          const on = position >= 0;
          const { label, keysUrl } = PROVIDERS[provider];
          return (
            <Card key={provider} className="gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  aria-label={`Use ${label}`}
                  checked={on}
                  // Auto mode needs at least one provider to try.
                  disabled={on && enabled.length === 1}
                  onCheckedChange={(checked) =>
                    setOrder(
                      checked
                        ? [...enabled, provider]
                        : enabled.filter((item) => item !== provider),
                    )
                  }
                />
                <span className="text-[13px] font-medium">{label}</span>
                {on && (
                  <span className="tnum text-xs text-ink-2">
                    Tried {position === 0 ? "first" : `#${position + 1}`}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <a
                    href={keysUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-2 text-xs text-brand hover:underline"
                  >
                    Get a key
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    aria-label={`Move ${label} up`}
                    disabled={!on || position === 0}
                    onClick={() => move(provider, -1)}
                  >
                    <SortAscIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    aria-label={`Move ${label} down`}
                    disabled={!on || position === enabled.length - 1}
                    onClick={() => move(provider, 1)}
                  >
                    <SortDescIcon className="size-4" />
                  </Button>
                </div>
              </div>
              <ProviderKeyField provider={provider} />
              <Field
                label="Model"
                hint="Saved, but runs currently use the model set on the server."
              >
                <Input
                  value={draft[MODEL_FIELD[provider]]}
                  onChange={(event) =>
                    update({ [MODEL_FIELD[provider]]: event.target.value })
                  }
                />
              </Field>
            </Card>
          );
        })}
      </Section>

      <Section
        title="Resume"
        description="Used for new resumes unless you choose another font when tailoring."
      >
        <Card className="p-4">
          <Field label="Default font">
            <Input
              value={draft.default_font}
              placeholder="Calibri"
              onChange={(event) => update({ default_font: event.target.value })}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Appearance" description="Saved on this device.">
        <Card className="flex-row items-center justify-between p-4">
          <span className="text-[13px] font-medium">Theme</span>
          <ThemeToggle />
        </Card>
      </Section>

      {auth.user && (
        <Section
          title="Account"
          description="Switch accounts or log out from the profile menu."
        >
          <Card className="gap-0.5 p-4">
            <p className="text-[13px] font-medium">{auth.user.display_name}</p>
            <p className="text-xs text-ink-2">{auth.user.email}</p>
          </Card>
        </Section>
      )}

      {save.isError && <Alert role="alert">{String(save.error)}</Alert>}
      {saved && !touched && (
        <p role="status" className="text-sm text-ok">
          Settings saved.
        </p>
      )}
      {touched && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface p-3 shadow-sm">
          <p className="text-[13px]">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                save.reset();
                setDraft({ ...original });
              }}
            >
              Discard
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
