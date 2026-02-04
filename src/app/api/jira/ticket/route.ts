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
    const issueKey = typeof body.issueKey === "string" ? body.issueKey.trim() : "";

    if (!issueKey) {
      return NextResponse.json(
        { error: "issueKey is required in the request body." },
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

    const issueUrl =
      `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(issueKey)}?` +
      new URLSearchParams({
        fields: "summary,key,status,assignee,comment",
      }).toString();

    const response = await fetch(issueUrl, {
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

    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: 200 });
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
