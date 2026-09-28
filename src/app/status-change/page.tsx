"use client";

import Link from "next/link";
import { useState } from "react";

type StatusChangeResult = {
  jql: string;
  newStatus: string;
  resolution: string;
  comment?: string;
  totalMatched: number;
  updatedCount: number;
  failedCount: number;
  results: Array<{
    issueKey: string;
    success: boolean;
    transitionId?: string;
    commentAdded?: boolean;
    error?: string;
    status?: number;
  }>;
};

export default function StatusChangePage() {
  const [jql, setJql] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [resolution, setResolution] = useState("");
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<StatusChangeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const trimmedJql = jql.trim();
    const trimmedStatus = newStatus.trim();
    const trimmedResolution = resolution.trim();
    const trimmedComment = comment.trim();

    if (!trimmedJql || !trimmedStatus || !trimmedResolution) {
      setError("JQL, new status, and resolution are required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/jira/status-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql: trimmedJql,
          newStatus: trimmedStatus,
          resolution: trimmedResolution,
          comment: trimmedComment || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? "Request failed.");
      } else {
        setResult(data as StatusChangeResult);
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
    link.download = "jira-status-change-result.json";
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
            Bulk status change
          </h1>
          <p className="text-sm text-slate-300">
            Change status for all issues matching a Jira query, and set
            resolution in the same transition. Optionally add one generic
            comment to every updated issue.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="jql">
              Jira query (JQL)
            </label>
            <textarea
              id="jql"
              value={jql}
              onChange={(event) => setJql(event.target.value)}
              rows={4}
              placeholder={'e.g. project = ABC AND status = "In Progress"'}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-sky-500 focus:ring-1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="newStatus">
                New status
              </label>
              <input
                id="newStatus"
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value)}
                placeholder="e.g. Done"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-sky-500 focus:ring-1"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="resolution">
                Resolution
              </label>
              <input
                id="resolution"
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="e.g. Done"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-sky-500 focus:ring-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="comment">
              Comment (optional)
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="e.g. Bulk status update via Jira Helper"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-sky-500 focus:ring-1"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Updating…" : "Run status change"}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-700 bg-red-950/50 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {result && (
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
