import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { GraphProjection } from "@resume-god/api-client";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  NativeSelect,
  Textarea,
} from "./ui";
import {
  createGraphAchievement,
  createGraphParent,
  createGraphSkill,
} from "../lib/api";

type AddKind = "skill" | "experience" | "project" | "achievement";

const KIND_LABEL: Record<AddKind, string> = {
  skill: "Skill",
  experience: "Experience",
  project: "Project",
  achievement: "Achievement",
};

const splitList = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const splitLines = (value: string) =>
  value
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);

/** Add a single node to the knowledge graph without a full profile import:
 * pick a kind, fill two or three fields, submit. Skills referenced by an
 * achievement must already exist (name or id). */
export default function GraphAddForm({
  projection,
}: {
  projection: GraphProjection | null;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AddKind>("skill");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [aliases, setAliases] = useState("");
  const [title, setTitle] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [url, setUrl] = useState("");
  const [parentId, setParentId] = useState("");
  const [text, setText] = useState("");
  const [skills, setSkills] = useState("");
  const [metrics, setMetrics] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const parents = (projection?.nodes ?? []).filter(
    (node) => node.kind === "experience" || node.kind === "project",
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["graph"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (kind === "skill") {
        return createGraphSkill({
          name: trimmed,
          category: category.trim() || undefined,
          aliases: splitList(aliases),
        }).then((created) => `${created.name}`);
      }
      if (kind === "experience" || kind === "project") {
        return createGraphParent({
          kind,
          name: trimmed,
          title: title.trim() || undefined,
          url: url.trim() || undefined,
          date_range: dateRange.trim() || undefined,
        }).then((created) => `${created.name}`);
      }
      // achievement
      const parentLabel = parents.find((node) => node.id === parentId);
      const skillNames = new Map(
        (projection?.nodes ?? [])
          .filter((node) => node.kind === "skill")
          .flatMap((node) => [
            [node.label.toLowerCase(), node.id],
            [node.id.toLowerCase(), node.id],
          ]),
      );
      const skillIds: string[] = [];
      for (const token of splitList(skills)) {
        const id = skillNames.get(token.toLowerCase());
        if (!id) {
          throw new Error(
            `Unknown skill: "${token}". Add it as a skill first.`,
          );
        }
        if (!skillIds.includes(id)) skillIds.push(id);
      }
      if (!parentId)
        throw new Error("Pick where it belongs (experience or project).");
      return createGraphAchievement({
        parent_id: parentId,
        text: text.trim(),
        skills: skillIds,
        metrics: splitLines(metrics),
      }).then(
        () =>
          `${text.trim().slice(0, 60)}${text.trim().length > 60 ? "…" : ""} → ${parentLabel?.label ?? parentId}`,
      );
    },
    onSuccess: (label) => {
      setError(null);
      setAdded(`${KIND_LABEL[kind]} added: ${label}`);
      setName("");
      setCategory("");
      setAliases("");
      setTitle("");
      setDateRange("");
      setUrl("");
      setText("");
      setSkills("");
      setMetrics("");
      invalidate();
    },
    onError: (err) => {
      setAdded(null);
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAdded(null);
    setError(null);
    if (kind === "achievement" ? text.trim() : name.trim()) {
      add.mutate();
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Add knowledge</h2>
      <Field label="Kind">
        <NativeSelect
          className="w-full"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as AddKind);
            setError(null);
            setAdded(null);
          }}
        >
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <form className="space-y-3" onSubmit={submit}>
        {kind !== "achievement" && (
          <Field label="Name">
            <Input
              placeholder={
                kind === "skill" ? "e.g. TypeScript" : "e.g. XParth, resume-god"
              }
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
        )}

        {kind === "skill" && (
          <>
            <Field label="Category">
              <Input
                placeholder="e.g. Languages"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </Field>
            <Field label="Aliases (comma-separated)">
              <Input
                placeholder="TS, Javascript"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
              />
            </Field>
          </>
        )}

        {(kind === "experience" || kind === "project") && (
          <>
            <Field label="Title / role">
              <Input
                placeholder="e.g. Senior Engineer"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Date range">
              <Input
                placeholder="e.g. 2022 — now"
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value)}
              />
            </Field>
            <Field label="URL">
              <Input
                placeholder="https://…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
          </>
        )}

        {kind === "achievement" && (
          <>
            <Field label="Part of (experience or project)">
              <NativeSelect
                className="w-full"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {parents.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="What did you do?">
              <Textarea
                placeholder="e.g. Cut p95 latency 40% with query planning"
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
              />
            </Field>
            <Field label="Skills (comma-separated, must exist)">
              <Input
                placeholder="TypeScript, React"
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
              />
            </Field>
            <Field label="Metrics (one per line)">
              <Textarea
                placeholder={"2M req/day\n40% faster"}
                rows={2}
                value={metrics}
                onChange={(event) => setMetrics(event.target.value)}
              />
            </Field>
          </>
        )}

        {error && <Alert role="alert">{error}</Alert>}
        {added && <p className="text-xs text-ok">{added}</p>}
        <Button
          type="submit"
          loading={add.isPending}
          className="w-full"
          disabled={add.isPending}
        >
          {add.isPending
            ? "Adding…"
            : kind === "achievement"
              ? "Add achievement"
              : `Add ${KIND_LABEL[kind].toLowerCase()}`}
        </Button>
      </form>
    </Card>
  );
}
