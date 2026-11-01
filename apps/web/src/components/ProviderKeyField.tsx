import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiKeyStatus } from "@resume-god/api-client";
import { deleteApiKey, fetchApiKeys, saveApiKey } from "../lib/api";
import { Alert, Button, DotBadge, Input, Skeleton } from "./ui";

export const PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    keysUrl: "https://aistudio.google.com/apikey",
  },
  glm: { label: "Z.ai GLM", keysUrl: "https://z.ai" },
  openai: {
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
  },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

function statusBadge(key: ApiKeyStatus) {
  if (key.source === "user") {
    return <DotBadge color="ok">Your key ending in {key.last4}</DotBadge>;
  }
  if (key.source === "server") {
    return <DotBadge color="st-wishlist">Using the server's key</DotBadge>;
  }
  return <DotBadge color="review">No key</DotBadge>;
}

function KeyForm({ apiKey, label }: { apiKey: ApiKeyStatus; label: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

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
    <div className="space-y-2">
      {statusBadge(apiKey)}
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
          aria-label={`${label} API key`}
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
            aria-label={`Remove ${label} key`}
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
    </div>
  );
}

/** One provider's own API key. Saves immediately; the server only ever returns
 * the key's last 4 characters. */
export default function ProviderKeyField({
  provider,
}: {
  provider: ProviderId;
}) {
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  if (keys.isPending) return <Skeleton className="h-16 rounded-lg" />;
  if (keys.isError) {
    return (
      <Alert role="alert">Could not load this key: {String(keys.error)}</Alert>
    );
  }
  const apiKey = keys.data.keys.find((key) => key.provider === provider);
  return apiKey ? (
    <KeyForm apiKey={apiKey} label={PROVIDERS[provider].label} />
  ) : null;
}
