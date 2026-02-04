import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getJiraConfig() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    return null;
  }

  return { baseUrl, email, apiToken };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";

    if (!boardId) {
      return NextResponse.json(
        { error: "boardId is required in the request body." },
        { status: 400 },
      );
    }

    const config = getJiraConfig();
    if (!config) {
      return NextResponse.json(
        {
          error:
            "Jira configuration missing. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN on the server.",
        },
        { status: 500 },
      );
    }

    const { baseUrl, email, apiToken } = config;
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    const base = baseUrl.replace(/\/$/, "");
    const maxResults = 100;
    let startAt = 0;
    const allIssues: unknown[] = [];

    for (let page = 0; page < 100; page += 1) {
      const url =
        `${base}/rest/agile/1.0/board/${encodeURIComponent(boardId)}/issue?` +
        new URLSearchParams({
          startAt: String(startAt),
          maxResults: String(maxResults),
          fields:
            "summary,key,status,assignee,priority,labels,created,updated,sprint",
        }).toString();

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      const text = await response.text();

      if (!response.ok) {
        return NextResponse.json(
          {
            error: "Jira API request failed.",
            status: response.status,
            body: text,
          },
          { status: response.status },
        );
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return NextResponse.json(
          {
            error: "Received non-JSON response from Jira.",
            raw: text,
          },
          { status: 502 },
        );
      }

      const data = json as { issues?: unknown[] };
      const issues = Array.isArray(data.issues) ? data.issues : [];
      allIssues.push(...issues);

      const isLast = json.isLast === true;
      const total: number | undefined =
        typeof json.total === "number" ? json.total : undefined;

      if (isLast || issues.length === 0) {
        break;
      }

      startAt += issues.length;

      if (total != null && startAt >= total) {
        break;
      }
    }

    return NextResponse.json(
      {
        total: allIssues.length,
        issues: allIssues,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error while calling Jira." },
      { status: 500 },
    );
  }
}
