import { NextRequest, NextResponse } from "next/server";
import { getCarryOverTickets } from "@/lib/carryOver";

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

function getCarryOverFieldConfig() {
  const reasonRaw = process.env.JIRA_CARRYOVER_REASON_FIELD?.trim() || "carryoverReason";
  const detailRaw = process.env.JIRA_CARRYOVER_DETAIL_FIELD?.trim() || "carryoverDetail";

  const normalize = (raw: string) => {
    if (/^customfield_\d+$/.test(raw)) {
      const id = raw.slice("customfield_".length);
      return { jqlField: `cf[${id}]`, issueFieldKey: raw };
    }

    return { jqlField: raw, issueFieldKey: raw };
  };

  const reason = normalize(reasonRaw);
  const detail = normalize(detailRaw);

  return {
    reasonJqlField: reason.jqlField,
    reasonIssueFieldKey: reason.issueFieldKey,
    detailJqlField: detail.jqlField,
    detailIssueFieldKey: detail.issueFieldKey,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sprintName?: string;
    };

    const sprintName = typeof body.sprintName === "string" ? body.sprintName.trim() : "";

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

    const {
      reasonJqlField,
      reasonIssueFieldKey,
      detailJqlField,
      detailIssueFieldKey,
    } = getCarryOverFieldConfig();

    let jql: string;
    if (sprintName) {
      // Filter by sprint AND carry-over fields having values
      const escapedSprintName = sprintName.replace(/"/g, '\\"');
      jql = `Sprint = "${escapedSprintName}" AND (${reasonJqlField} IS NOT EMPTY OR ${detailJqlField} IS NOT EMPTY)`;
    } else {
      // All carry-overs across all sprints
      jql = `${reasonJqlField} IS NOT EMPTY OR ${detailJqlField} IS NOT EMPTY`;
    }

    const searchUrl = `${base}/rest/api/3/search/jql`;

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        fields: [
          "summary",
          "key",
          "status",
          "assignee",
          "sprint",
          reasonIssueFieldKey,
          detailIssueFieldKey,
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

    const issues = Array.isArray(json.issues) ? json.issues : [];

    type RawIssue = {
      key?: unknown;
      fields?: Record<string, unknown>;
    };

    const normalized = issues.map((issue) => {
      const raw = issue as RawIssue;
      const key = typeof raw.key === "string" ? raw.key : "";
      const fields = raw.fields ?? {};

      const carryoverReason = fields[reasonIssueFieldKey];
      const carryoverDetail = fields[detailIssueFieldKey];

      return {
        key,
        sprintName: sprintName || undefined,
        carryoverReason:
          typeof carryoverReason === "string" ? carryoverReason : carryoverReason != null ? String(carryoverReason) : null,
        carryoverDetail:
          typeof carryoverDetail === "string" ? carryoverDetail : carryoverDetail != null ? String(carryoverDetail) : null,
      };
    });

    let filtered;
    try {
      filtered = getCarryOverTickets(normalized, sprintName ? { sprintName } : {});
    } catch (error) {
      if (error instanceof Error && /invalid or not found/i.test(error.message)) {
        return NextResponse.json(
          { error: "Sprint name is invalid or not found.", issues: [], total: 0 },
          { status: 400 },
        );
      }
      throw error;
    }

    const allowedKeys = new Set(filtered.map((i) => i.key));
    const filteredIssues = issues.filter((issue) => {
      const key = (issue as RawIssue).key;
      return typeof key === "string" && allowedKeys.has(key);
    });

    return NextResponse.json(
      {
        ...json,
        total: filteredIssues.length,
        issues: filteredIssues,
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
