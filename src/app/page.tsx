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

type FilterReportApiResult = {
  jql: string;
  total: number;
  rows: unknown[];
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
  {
    name: "Carry-over tickets",
    description:
      "Find tickets that have a carry-over reason or detail, optionally filtered by sprint.",
    href: "/carry-over",
  },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateApiResult | null>(null);

  const [filterJql, setFilterJql] = useState("");
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [filterResult, setFilterResult] = useState<FilterReportApiResult | null>(null);

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

  async function handleFilterSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFilterError(null);
    setFilterResult(null);

    const trimmed = filterJql.trim();

    if (!trimmed) {
      setFilterError("Please enter a Jira filter (JQL).");
      return;
    }

    setFilterLoading(true);
    try {
      const response = await fetch("/api/jira/filter-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jql: trimmed }),
      });

      const data = (await response.json()) as
        | FilterReportApiResult
        | { error?: string; status?: number; body?: unknown; raw?: unknown };

      if (!response.ok || !("rows" in data)) {
        const errorData = data as {
          error?: string;
          status?: number;
          body?: unknown;
          raw?: unknown;
        };

        const parts: string[] = [];

        if (errorData.error) {
          parts.push(errorData.error);
        }

        if (typeof errorData.status === "number") {
          parts.push(`(HTTP ${errorData.status})`);
        }

        const bodySource = errorData.body ?? errorData.raw;
        if (typeof bodySource === "string" && bodySource.trim().length > 0) {
          try {
            const parsed = JSON.parse(bodySource) as {
              errorMessages?: unknown;
              errors?: unknown;
            };

            const details: string[] = [];

            if (Array.isArray(parsed.errorMessages)) {
              details.push(parsed.errorMessages.join("; "));
            }

            if (parsed.errors && typeof parsed.errors === "object") {
              const fieldErrors = Object.entries(parsed.errors as Record<string, unknown>)
                .map(([field, msg]) => `${field}: ${String(msg)}`);
              if (fieldErrors.length > 0) {
                details.push(fieldErrors.join("; "));
              }
            }

            if (details.length > 0) {
              parts.push(`Details: ${details.join(" | ")}`);
            }
          } catch {
            const snippet = bodySource.length > 300
              ? `${bodySource.slice(0, 300)}…`
              : bodySource;
            parts.push(`Details: ${snippet}`);
          }
        }

        const message = parts.length > 0 ? parts.join(" ") : "Request failed.";
        setFilterError(message);
      } else {
        setFilterResult(data as FilterReportApiResult);
      }
    } catch {
      setFilterError("Unexpected error while calling the API.");
    } finally {
      setFilterLoading(false);
    }
  }

  async function handleCopyFilterJson() {
    if (!filterResult) return;

    const text = JSON.stringify(filterResult.rows, null, 2);

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Ignore clipboard errors in UI.
      }
    }
  }

  function handleDownloadFilterJson() {
    if (!filterResult) return;

    const blob = new Blob([JSON.stringify(filterResult.rows, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jira-filter-report.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleDownloadFilterCsv() {
    if (!filterResult) return;

    const escapeCell = (value: unknown): string => {
      if (value == null) return "";
      const str = String(value);
      if (str === "") return "";
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const headerCells = [
      "Issue Key",
      "Summary",
      "Priority",
      "Status",
      "Component",
      "Squad",
      "Fix Version",
      "Assignee",
      "Created",
      "Resolved",
      "First In Progress",
      "Lead Time to In Progress (days)",
      "Cycle Time (In Progress to Resolved (days))",
      "Total Time to Resolve (Created to Resolved (days))",
      "Reopen Count",
      "Assignee Change Count",
      "Is High/Highest?",
      "Notes",
    ].map(escapeCell);

    const lines: string[] = [];
    lines.push(headerCells.join(","));

    for (const row of filterResult.rows as Record<string, unknown>[]) {
      const cells = [
        escapeCell(row.issueKey),
        escapeCell(row.summary),
        escapeCell(row.priority),
        escapeCell(row.status),
        escapeCell(row.component),
        escapeCell(row.squad),
        escapeCell(row.fixVersion),
        escapeCell(row.assignee),
        escapeCell(row.created),
        escapeCell(row.resolved),
        escapeCell(row.firstInProgress),
        escapeCell(row.leadTimeToInProgressDays),
        escapeCell(row.cycleTimeDays),
        escapeCell(row.totalTimeToResolveDays),
        escapeCell(row.reopenCount),
        escapeCell(row.assigneeChangeCount),
        escapeCell(row.isHighOrHighest),
        escapeCell(row.notes),
      ];
      lines.push(cells.join(","));
    }

    const blob = new Blob([`${lines.join("\n")}\n`], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jira-filter-report.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
              Filter issues by JQL
            </h2>
            <p className="text-xs text-slate-300">
              Run an ad-hoc Jira search using JQL and get a JSON payload with
              lead time, cycle time, and other metrics for each issue.
            </p>
          </header>

          <form onSubmit={handleFilterSubmit} className="space-y-3">
            <div className="space-y-1 text-xs">
              <label className="block font-medium" htmlFor="filterJql">
                Jira filter (JQL)
              </label>
              <textarea
                id="filterJql"
                value={filterJql}
                onChange={(event) => setFilterJql(event.target.value)}
                rows={3}
                className="block w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="e.g. project = XYZ AND statusCategory != Done ORDER BY created DESC"
              />
              <p className="text-[11px] text-slate-400">
                The API expands Jira changelogs to compute lead time, cycle
                time, assignee changes, and reopen counts.
              </p>
            </div>

            <button
              type="submit"
              disabled={filterLoading}
              className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {filterLoading ? "Running filter…" : "Run filter"}
            </button>
          </form>

          {filterError && (
            <div className="rounded-md border border-red-700 bg-red-950/50 p-2 text-xs text-red-100">
              {filterError}
            </div>
          )}

          {filterResult && (
            <section className="space-y-3 text-xs text-slate-200">
              <h3 className="text-xs font-medium text-slate-200">
                Filter summary
              </h3>
              <p>
                Found
                {" "}
                <span className="font-semibold">{filterResult.total}</span>
                {" "}
                issue
                {filterResult.total === 1 ? "" : "s"}
                {" "}
                for this filter.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyFilterJson}
                  className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1 text-[11px] font-medium text-slate-50 transition-colors hover:bg-slate-700"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFilterJson}
                  className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1 text-[11px] font-medium text-slate-50 transition-colors hover:bg-slate-700"
                >
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFilterCsv}
                  className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1 text-[11px] font-medium text-slate-50 transition-colors hover:bg-slate-700"
                >
                  Download CSV
                </button>
              </div>

              <div className="max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-2 text-[11px] font-mono text-slate-100">
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(filterResult.rows, null, 2)}
                </pre>
              </div>
            </section>
          )}
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
                            <>
                              created as
                              {" "}
                              {r.browseUrl ? (
                                <a
                                  href={r.browseUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-sky-400 hover:decoration-sky-300"
                                >
                                  {r.issueKey}
                                </a>
                              ) : (
                                r.issueKey
                              )}
                              .
                            </>
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
