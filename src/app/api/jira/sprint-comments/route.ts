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

function getSprintFieldConfig() {
  const raw = process.env.JIRA_SPRINT_FIELD?.trim() || "sprint";

  if (/^customfield_\d+$/.test(raw)) {
    const id = raw.slice("customfield_".length);
    const jqlField = `cf[${id}]`;
    const issueFieldKey = raw;
    return { jqlField, issueFieldKey };
  }

  return { jqlField: raw, issueFieldKey: raw };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sprintName =
      typeof body.sprintName === "string" ? body.sprintName.trim() : "";

    if (!sprintName) {
      return NextResponse.json(
        { error: "sprintName is required in the request body." },
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
    const { jqlField, issueFieldKey } = getSprintFieldConfig();

    const escapedSprintName = sprintName.replace(/"/g, '\\"');
    const jql = `"${jqlField}" = "${escapedSprintName}"`;
    const searchUrl = `${baseUrl.replace(/\/$/, "")}/rest/api/3/search/jql`;

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
          "comment",
          issueFieldKey,
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

    try {
      const json = JSON.parse(text) as {
        issues?: unknown[];
        [key: string]: unknown;
      };

      // Best-effort attempt to enrich the result with details for the
      // sprint whose name was provided as input (sprintName).
      try {
        const issues = Array.isArray(json.issues) ? json.issues : [];
        let targetSprintId: string | null = null;

        outer: for (const issue of issues) {
          const fields = (issue as { fields?: Record<string, unknown> }).fields ?? {};
          const sprintField = (fields as Record<string, unknown>)[issueFieldKey];
          const sprintsArray = Array.isArray(sprintField)
            ? sprintField
            : sprintField
              ? [sprintField]
              : [];

          for (const sprint of sprintsArray) {
            if (!sprint || typeof sprint !== "object") continue;

            const sprintObj = sprint as { id?: unknown; name?: unknown };
            if (sprintObj.id == null) continue;

            const name =
              sprintObj.name != null ? String(sprintObj.name).trim() : "";

            if (name === sprintName) {
              targetSprintId = String(sprintObj.id);
              break outer;
            }
          }
        }

        let sprintDetail: unknown | undefined;

        if (targetSprintId) {
          const base = baseUrl.replace(/\/$/, "");
          const sprintRes = await fetch(
            `${base}/rest/agile/1.0/sprint/${encodeURIComponent(targetSprintId)}`,
            {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
              },
            },
          );

          const sprintText = await sprintRes.text();
          if (sprintRes.ok) {
            try {
              sprintDetail = JSON.parse(sprintText);
            } catch {
              // Ignore parse errors for the sprint detail and fall back to issues only.
            }
          }
        }

        const sanitizedIssues = issues.map((issue) => {
          if (!issue || typeof issue !== "object") return issue;

          const issueObj = issue as { fields?: Record<string, unknown> };
          if (!issueObj.fields || typeof issueObj.fields !== "object") {
            return issue;
          }

          const fields = { ...issueObj.fields } as Record<string, unknown>;
          delete fields[issueFieldKey];

          return {
            ...issueObj,
            fields,
          };
        });

        const resultPayload: Record<string, unknown> = {
          ...json,
          issues: sanitizedIssues,
        };

        if (sprintDetail !== undefined) {
          resultPayload.sprintDetail = sprintDetail;
        }

        return NextResponse.json(resultPayload, { status: 200 });
      } catch {
        // If enrichment fails for any reason, fall back to the raw search JSON.
        return NextResponse.json(json, { status: 200 });
      }
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
