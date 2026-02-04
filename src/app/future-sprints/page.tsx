"use client";

import Link from "next/link";
import { useState } from "react";

type JiraResponse = unknown;

export default function FutureSprintsPage() {
  const [result, setResult] = useState<JiraResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRun(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    setLoading(true);
    try {
      const response = await fetch("/api/jira/future-sprints", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? "Request failed.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Unexpected error while calling the API.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    const text = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(text).catch(() => {
      setError("Failed to copy JSON to clipboard.");
    });
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jira-future-sprints-result.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="mb-2 flex justify-between text-xs text-slate-300">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-sky-600 bg-slate-900 px-3 py-1 font-medium text-sky-200 shadow-sm hover:border-sky-400 hover:text-sky-100"
          >
            ← Back to home: Jira Helper
          </Link>
        </div>

        <header className="space-y-1 border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Future sprints for DX squads
          </h1>
          <p className="text-sm text-slate-300">
            Run a predefined JQL query that finds all unresolved tickets in
            future sprints for specific squads across the HCL Digital
            Experience, Connections, and Leap projects. Comments are used only
            to filter out tickets containing the phrase
            {" "}
            <span className="font-mono text-xs">"AI generated and is intended"</span>
            {" "}
            and are not included in the JSON results.
          </p>
        </header>

        <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-200">
          <p className="font-medium">JQL used:</p>
          <pre className="overflow-auto rounded-md border border-slate-800 bg-black p-3 text-[11px] leading-relaxed">
            <code>
              {`project in ("HCL Digital Experience", Connections, Leap)
and issuetype NOT IN (Bug, Epic, Sub-task)
and resolution = Unresolved
AND "squad[dropdown]" IN (Masterminds, Vectors, PerfPowerhouse, Artisans, Eternals, Wizards, Dominators, Stormbreakers)
and Sprint in futureSprints()
and summary !~ "Story Point Pool"
and summary !~ "A sprint"
ORDER BY "cf[10020]" ASC, summary ASC, created DESC`}
            </code>
          </pre>
        </section>

        <form onSubmit={handleRun} className="space-y-4">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Running query…" : "Run query"}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-700 bg-red-950/50 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {result != null && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-200">Result JSON</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100 hover:border-sky-500 hover:text-sky-200"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100 hover:border-sky-500 hover:text-sky-200"
                >
                  Download .json
                </button>
              </div>
            </div>
            <pre className="max-h-[480px] overflow-auto rounded-md border border-slate-800 bg-black p-3 text-xs leading-relaxed text-slate-100">
              <code>{JSON.stringify(result, null, 2)}</code>
            </pre>
          </section>
        )}

        <footer className="mt-auto border-t border-slate-800 pt-4 text-xs text-slate-500">
          Jira credentials are read from environment variables on the server
          (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).
        </footer>
      </main>
    </div>
  );
}
