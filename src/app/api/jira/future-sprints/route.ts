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

const FUTURE_SPRINTS_JQL =
  'project in ("HCL Digital Experience", Connections, Leap) ' +
  'and issuetype NOT IN (Bug, Epic, Sub-task) ' +
  'and resolution = Unresolved ' +
  'AND "squad[dropdown]" IN (Masterminds, Vectors, PerfPowerhouse, Artisans, Eternals, Wizards, Dominators, Stormbreakers) ' +
  'and Sprint in futureSprints() ' +
  'and summary !~ "Story Point Pool" ' +
  'and summary !~ "A sprint" ' +
  'ORDER BY "cf[10020]" ASC, summary ASC, created DESC';

export async function POST(_req: NextRequest) {
  try {
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

    const searchUrl = `${baseUrl.replace(/\/$/, "")}/rest/api/3/search/jql`;

    const acceptanceCriteriaField =
      process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD?.trim() || undefined;

    const fields = [
      "summary",
      "status",
      "description",
      "comment",
      "issuetype",
    ];

    if (acceptanceCriteriaField) {
      fields.push(acceptanceCriteriaField);
    }

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql: FUTURE_SPRINTS_JQL,
        fields,
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

    try {
      const json = JSON.parse(text) as {
        issues?: unknown[];
        total?: number;
        [key: string]: unknown;
      };

      const issues = Array.isArray(json.issues) ? json.issues : [];

      const filteredIssues = issues.filter((issue) => {
        if (!issue || typeof issue !== "object") return true;

        const fields = (issue as { fields?: unknown }).fields as
          | { comment?: unknown }
          | undefined;

        if (!fields || typeof fields !== "object") return true;

        const commentField = (fields as { comment?: unknown }).comment as
          | { comments?: unknown[] }
          | undefined;

        const comments = Array.isArray(commentField?.comments)
          ? commentField?.comments
          : [];

        const needle = "ai generated and is intended";

        const hasAiGeneratedMarker = comments.some((comment) => {
          if (!comment) return false;

          const body =
            typeof (comment as { body?: unknown }).body !== "undefined"
              ? (comment as { body?: unknown }).body
              : comment;

          const textBody =
            typeof body === "string" ? body : JSON.stringify(body);

          return textBody.toLowerCase().includes(needle);
        });

        return !hasAiGeneratedMarker;
      });

      const sanitizedIssues = filteredIssues.map((issue) => {
        if (!issue || typeof issue !== "object") return issue;

        const issueObj = issue as { fields?: Record<string, unknown> };
        if (!issueObj.fields || typeof issueObj.fields !== "object") {
          return issue;
        }

        const fields = { ...issueObj.fields } as { comment?: unknown };
        delete fields.comment;

        return {
          ...issueObj,
          fields,
        };
      });

      const filteredJson = {
        ...json,
        total: sanitizedIssues.length,
        issues: sanitizedIssues,
      };

      return NextResponse.json(filteredJson, { status: 200 });
    } catch {
      return NextResponse.json(
        {
          error: "Received non-JSON response from Jira.",
          raw: text,
        },
        { status: 502 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error while calling Jira." },
      { status: 500 },
    );
  }
}
