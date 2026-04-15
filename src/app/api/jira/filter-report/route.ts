import { NextRequest, NextResponse } from "next/server";
import { buildFilterReportRows, JiraIssueForReport } from "@/lib/filterReport";

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
    const body = (await req.json().catch(() => ({}))) as {
      jql?: string;
      filter?: string;
    };

    const rawFilter =
      typeof body.jql === "string" && body.jql.trim().length > 0
        ? body.jql.trim()
        : typeof body.filter === "string" && body.filter.trim().length > 0
          ? body.filter.trim()
          : "";

    if (!rawFilter) {
      return NextResponse.json(
        { error: "jql (or filter) is required in the request body." },
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
    const searchUrl = `${base}/rest/api/3/search/jql`;
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql: rawFilter,
        fields: [
          "summary",
          "priority",
          "status",
          "components",
          "customfield_10087",
          "fixVersions",
          "assignee",
          "created",
          "resolutiondate",
        ],
        maxResults: 1000,
      }),
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

    let json: { issues?: unknown[]; [key: string]: unknown };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      return NextResponse.json(
        {
          error: "Received non-JSON response from Jira.",
          raw: text,
        },
        { status: 502 },
      );
    }

    const searchIssues = Array.isArray(json.issues) ? (json.issues as JiraIssueForReport[]) : [];

    // For each issue returned by search, fetch the full issue with changelog expanded.
    const issues: JiraIssueForReport[] = [];

    for (const issue of searchIssues) {
      const key = typeof issue.key === "string" ? issue.key : "";
      if (!key) continue;

      const issueUrl =
        `${base}/rest/api/3/issue/${encodeURIComponent(key)}?` +
        new URLSearchParams({
          expand: "changelog",
          fields:
            "summary,priority,status,components,customfield_10087,fixVersions,assignee,created,resolutiondate",
        }).toString();

      try {
        const issueRes = await fetch(issueUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        });

        const issueText = await issueRes.text();

        if (!issueRes.ok) {
          console.warn(
            "[filter-report] Failed to fetch issue with changelog",
            key,
            "status",
            issueRes.status,
            "body",
            issueText,
          );
          continue;
        }

        try {
          const issueJson = JSON.parse(issueText) as JiraIssueForReport;
          issues.push(issueJson);
        } catch {
          console.warn("[filter-report] Failed to parse issue JSON for", key);
        }
      } catch (error) {
        console.warn("[filter-report] Error while fetching issue", key, error);
      }
    }

    const rows = buildFilterReportRows(issues);

    return NextResponse.json(
      {
        jql: rawFilter,
        total: rows.length,
        rows,
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
