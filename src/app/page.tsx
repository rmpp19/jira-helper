"use client";

import { useState } from "react";

type BulkCreateRowResult = {
  rowIndex: number;
  projectKey?: string;
  issueType?: string;
  summary?: string;
  success: boolean;
  issueKey?: string;
  status?: number;
  error?: string;
};

type BulkCreateApiResult = {
  totalRows: number;
  createdCount: number;
  failedCount: number;
  results: BulkCreateRowResult[];
};

const tools = [
  {
    name: "Get ticket information",
    description: "Fetch a single Jira ticket by key and view the raw JSON.",
    href: "/ticket-info",
  },
  {
    name: "Get sprint tickets with comments",
    description:
      "List all tickets in a sprint along with their comments as JSON.",
    href: "/sprint-comments",
  },
  {
    name: "Get board tickets",
    description:
      "List all issues on a Jira board as JSON to review backlog health.",
    href: "/board-issues",
  },
  {
    name: "Future sprints for DX squads",
    description:
      "Run a predefined JQL to find unresolved future-sprint tickets for specific squads, excluding tickets marked as AI generated.",
    href: "/future-sprints",
  },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateApiResult | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please choose a CSV file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const response = await fetch("/api/jira/bulk-create", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | BulkCreateApiResult
        | { error?: string };

      if (!response.ok || !("results" in data)) {
        setError((data as { error?: string }).error ?? "Request failed.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Unexpected error while calling the API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-10">
        <header className="space-y-2 border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            Jira Helper
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Choose a function below to run against your Jira Cloud instance.
            All results are returned as JSON that you can copy or download.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {tools.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-sky-500 hover:bg-slate-900"
            >
              <h2 className="mb-1 text-base font-medium group-hover:text-sky-300">
                {tool.name}
              </h2>
              <p className="text-xs text-slate-300">{tool.description}</p>
            </a>
          ))}
        </section>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <header className="space-y-1">
            <h2 className="text-base font-medium text-slate-100">
              Bulk create tickets from CSV
            </h2>
            <p className="text-xs text-slate-300">
              Upload a CSV file with columns like project, Issue Type, summary,
              description, acceptanceCriteria, and component to create multiple
              Jira issues in one go.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1 text-xs">
              <label className="block font-medium" htmlFor="csvFile">
                CSV file
              </label>
              <input
                id="csvFile"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                }}
                className="block w-full text-xs text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700"
              />
              <p className="text-[11px] text-slate-400">
                The file is processed on the server; Jira credentials come from
                environment variables.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !file}
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating tickets…" : "Upload and create tickets"}
            </button>
          </form>

          {error && (
            <div className="rounded-md border border-red-700 bg-red-950/50 p-2 text-xs text-red-100">
              {error}
            </div>
          )}

          {result && (
            <section className="space-y-3 text-xs text-slate-200">
              <h3 className="text-xs font-medium text-slate-200">
                Bulk create summary
              </h3>
              <p>
                Processed
                {" "}
                <span className="font-semibold">{result.totalRows}</span>
                {" "}
                row{result.totalRows === 1 ? "" : "s"}: created
                {" "}
                <span className="font-semibold">{result.createdCount}</span>
                , failed
                {" "}
                <span className="font-semibold">{result.failedCount}</span>
                .
              </p>

              {result.results.some((r) => r.success) && (
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-300">
                    Successfully created
                  </p>
                  <ul className="space-y-0.5 list-disc pl-4">
                    {result.results
                      .filter((r) => r.success)
                      .map((r) => (
                        <li key={`success-${r.rowIndex}`}>
                          Row {r.rowIndex}: project
                          {" "}
                          <span className="font-mono">{r.projectKey}</span>
                          {", "}
                          {r.issueType && (
                            <>
                              type
                              {" "}
                              <span className="font-mono">{r.issueType}</span>
                              {", "}
                            </>
                          )}
                          summary
                          {" "}
                          <span className="italic">{r.summary}</span>
                          {" – "}
                          {r.issueKey ? (
                            <>created as {r.issueKey}.</>
                          ) : (
                            <>created (issue key unavailable).</>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {result.results.some((r) => !r.success) && (
                <div className="space-y-1">
                  <p className="font-semibold text-red-300">Failed</p>
                  <ul className="space-y-0.5 list-disc pl-4">
                    {result.results
                      .filter((r) => !r.success)
                      .map((r) => (
                        <li key={`failed-${r.rowIndex}`}>
                          Row {r.rowIndex}: project
                          {" "}
                          <span className="font-mono">{r.projectKey}</span>
                          {", "}
                          {r.issueType && (
                            <>type {r.issueType}, </>
                          )}
                          summary
                          {" "}
                          <span className="italic">{r.summary}</span>
                          {" – failed. Reason: "}
                          <span className="text-red-200">
                            {r.error || "Unknown Jira error"}
                          </span>
                          {r.status && ` (status ${r.status})`}
                          .
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </section>

        <footer className="mt-auto border-t border-slate-800 pt-4 text-xs text-slate-400">
          Jira credentials are read from environment variables on the server
          (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).
        </footer>
      </main>
    </div>
  );
}
