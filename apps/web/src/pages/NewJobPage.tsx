import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { postTailor } from "../lib/api";
import { setSessionPlan } from "../lib/session";

export default function NewJobPage() {
  const navigate = useNavigate();
  const [jdText, setJdText] = useState("");
  const [targetTitle, setTargetTitle] = useState("");
  const [provider, setProvider] = useState("auto");
  const [maxAchievements, setMaxAchievements] = useState("10");

  const tailor = useMutation({
    mutationFn: () =>
      postTailor({
        jd_text: jdText,
        target_title: targetTitle || undefined,
        provider,
        max_achievements: Number(maxAchievements) || 10,
      }),
    onSuccess: (data) => {
      setSessionPlan(data.plan, data.providers);
      navigate("/review");
    },
  });

  return (
    <div>
      <h1>New application</h1>
      <label>
        Target title
        <input
          value={targetTitle}
          onChange={(event) => setTargetTitle(event.target.value)}
          placeholder="Software Engineer"
        />
      </label>
      <label>
        Provider
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        >
          <option value="auto">Auto (LLM if key, else offline)</option>
          <option value="gemini">Gemini</option>
          <option value="glm">GLM</option>
          <option value="deterministic">Offline only</option>
        </select>
      </label>
      <label>
        Max bullets
        <input
          value={maxAchievements}
          onChange={(event) => setMaxAchievements(event.target.value)}
        />
      </label>
      <label>
        Job description
        <textarea
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
          rows={14}
          placeholder="Paste the full job description here…"
        />
      </label>
      <button
        disabled={tailor.isPending || jdText.trim().length === 0}
        onClick={() => tailor.mutate()}
      >
        {tailor.isPending ? "Tailoring…" : "Generate tailored plan"}
      </button>
      {tailor.isError && <p role="alert">{String(tailor.error)}</p>}
    </div>
  );
}
