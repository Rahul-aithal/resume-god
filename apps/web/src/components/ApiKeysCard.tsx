import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiKeyStatus } from "@resume-god/api-client";
import { deleteApiKey, fetchApiKeys, saveApiKey } from "../lib/api";
import { Alert, Button, Card, DotBadge, Input, Skeleton } from "./ui";

const PROVIDERS: Record<string, { label: string; keysUrl: string }> = {
  gemini: {
    label: "Google Gemini",
    keysUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  glm: { label: "Z.ai GLM", keysUrl: "https://z.ai" },
};

function statusBadge(key: ApiKeyStatus) {
  if (key.source === "user") {
    return <DotBadge color="ok">Your key ending in {key.last4}</DotBadge>;
  }
  if (key.source === "server") {
    return <DotBadge color="st-wishlist">Using the server's key</DotBadge>;
  }
  return <DotBadge color="st-wishlist">No key</DotBadge>;
}

function KeyRow({ apiKey }: { apiKey: ApiKeyStatus }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const provider = PROVIDERS[apiKey.provider] ?? {
    label: apiKey.provider,
    keysUrl: "",
  };

  const onSuccess = (data: { keys: ApiKeyStatus[] }) => {
    queryClient.setQueryData(["api-keys"], data);
    void queryClient.invalidateQueries({ queryKey: ["providers"] });
  };
  const save = useMutation({
    mutationFn: () => saveApiKey(apiKey.provider, value.trim()),
    onSuccess: (data) => {
      setValue("");
      onSuccess(data);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteApiKey(apiKey.provider),
    onSuccess,
  });
  const error = save.error ?? remove.error;

  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium">{provider.label}</span>
          {statusBadge(apiKey)}
        </div>
        {provider.keysUrl && (
          <a
            href={provider.keysUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand hover:underline"
          >
            Get a key
          </a>
        )}
      </div>
      {apiKey.needs_reentry && (
        <Alert tone="review">
          Your saved key can no longer be read. Enter it again to keep using it.
        </Alert>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) save.mutate();
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="min-w-48 flex-1"
          aria-label={`${provider.label} API key`}
          placeholder={
            apiKey.last4
              ? "Paste a new key to replace it"
              : "Paste your API key"
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={save.isPending}
          disabled={!value.trim()}
        >
          Save key
        </Button>
        {apiKey.last4 && (
          <Button
            variant="danger"
            loading={remove.isPending}
            aria-label={`Remove ${provider.label} key`}
            onClick={() => remove.mutate()}
          >
            Remove
          </Button>
        )}
      </form>
      {error && (
        <Alert role="alert">
          {error instanceof Error ? error.message : String(error)}
        </Alert>
      )}
    </li>
  );
}

/** Bring your own LLM keys. The server only ever returns each key's last 4. */
export default function ApiKeysCard() {
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });

  return (
    <Card className="p-6">
      <div>
        <h2 className="text-sm font-semibold">Your API keys</h2>
        <p className="mt-1 text-xs text-ink-2">
          Use your own provider account for tailoring. Your key takes priority
          over the server's. It is stored encrypted and can't be viewed again
          after you save it.
        </p>
      </div>
      {keys.isPending && <Skeleton className="h-32 rounded-lg" />}
      {keys.isError && (
        <Alert role="alert">
          Could not load your keys: {String(keys.error)}
        </Alert>
      )}
      {keys.data && (
        <ul className="divide-y divide-line">
          {keys.data.keys.map((apiKey) => (
            <KeyRow key={apiKey.provider} apiKey={apiKey} />
          ))}
        </ul>
      )}
    </Card>
  );
}
