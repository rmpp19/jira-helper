import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type JiraIssue = {
  key?: unknown;
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  total?: number;
  nextPageToken?: unknown;
};

type StatusChangeRow = {
  issueKey: string;
  success: boolean;
  transitionId?: string;
  commentAdded?: boolean;
  error?: string;
  status?: number;
};

function getJiraConfig() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    return null;
  }

  return { baseUrl, email, apiToken };
}

function getErrorMessage(errorPayload: unknown, fallback: string): string {
  if (!errorPayload || typeof errorPayload !== "object") {
    return fallback;
  }

  const payload = errorPayload as {
    errorMessages?: unknown;
    errors?: unknown;
  };

  const parts: string[] = [];

  if (Array.isArray(payload.errorMessages)) {
    const messages = payload.errorMessages
      .map((item) => String(item).trim())
      .filter((msg) => msg.length > 0);

    if (messages.length > 0) {
      parts.push(messages.join("; "));
    }
  }

  if (payload.errors && typeof payload.errors === "object") {
    const entries = Object.entries(payload.errors as Record<string, unknown>)
      .map(([field, value]) => `${field}: ${String(value)}`)
      .filter((msg) => msg.trim().length > 0);

    if (entries.length > 0) {
      parts.push(entries.join("; "));
    }
  }

  return parts.length > 0 ? parts.join(" | ") : fallback;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function fetchIssuesByJql(
  base: string,
  auth: string,
  jql: string,
): Promise<{ issues: string[] } | { error: NextResponse }> {
  const maxResults = 100;
  let nextPageToken: string | undefined;
  const keys: string[] = [];

  for (let page = 0; page < 100; page += 1) {
    console.info("[jira-status-change] Searching issues", {
      page,
      nextPageToken,
      maxResults,
      jql,
    });

    const response = await fetch(`${base}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        fields: ["key"],
        maxResults,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("[jira-status-change] Search request failed", {
        page,
        nextPageToken,
        status: response.status,
        responseBody: text,
      });

      return {
        error: NextResponse.json(
          {
            error: "Jira API request failed while searching issues.",
            status: response.status,
            body: text,
          },
          { status: response.status },
        ),
      };
    }

    const parsed = tryParseJson(text);
    if (!parsed) {
      console.error("[jira-status-change] Search response was not JSON", {
        page,
        nextPageToken,
        rawBody: text,
      });

      return {
        error: NextResponse.json(
          {
            error: "Received non-JSON response from Jira while searching issues.",
            raw: text,
          },
          { status: 502 },
        ),
      };
    }

    const data = parsed as JiraSearchResponse;
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const pageKeys = issues
      .map((issue) => issue.key)
      .filter((key): key is string => typeof key === "string" && key.trim().length > 0);

    console.info("[jira-status-change] Search page returned issues", {
      page,
      count: pageKeys.length,
      keys: pageKeys,
    });

    keys.push(
      ...pageKeys,
    );

    const tokenFromResponse =
      typeof data.nextPageToken === "string" && data.nextPageToken.trim().length > 0
        ? data.nextPageToken
        : undefined;

    console.info("[jira-status-change] Search page metadata", {
      page,
      total: typeof data.total === "number" ? data.total : undefined,
      nextPageToken: tokenFromResponse,
    });

    if (issues.length === 0) {
      break;
    }

    if (!tokenFromResponse) {
      break;
    }

    nextPageToken = tokenFromResponse;
  }

  return { issues: keys };
}

async function getTransitionIdForIssue(
  base: string,
  auth: string,
  issueKey: string,
  newStatus: string,
): Promise<{ transitionId: string } | { error: string; status?: number }> {
  const response = await fetch(
    `${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    },
  );

  const text = await response.text();

  if (!response.ok) {
    const parsed = tryParseJson(text);
    return {
      error: getErrorMessage(parsed, "Failed to fetch transitions for issue."),
      status: response.status,
    };
  }

  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object") {
    return {
      error: "Received non-JSON transitions response from Jira.",
      status: 502,
    };
  }

  const transitionsRaw = (parsed as { transitions?: unknown }).transitions;
  const transitions = Array.isArray(transitionsRaw) ? transitionsRaw : [];

  const target = transitions.find((transition) => {
    if (!transition || typeof transition !== "object") return false;

    const candidate = transition as {
      id?: unknown;
      name?: unknown;
      to?: { name?: unknown };
    };

    const transitionName =
      typeof candidate.name === "string" ? candidate.name.trim().toLowerCase() : "";
    const toStatusName =
      candidate.to && typeof candidate.to.name === "string"
        ? candidate.to.name.trim().toLowerCase()
        : "";

    const wanted = newStatus.trim().toLowerCase();
    return transitionName === wanted || toStatusName === wanted;
  }) as { id?: unknown } | undefined;

  if (!target || typeof target.id !== "string") {
    return {
      error: `No available transition to status '${newStatus}'.`,
    };
  }

  return { transitionId: target.id };
}

async function transitionIssue(
  base: string,
  auth: string,
  issueKey: string,
  transitionId: string,
  resolution: string,
): Promise<{ success: true } | { success: false; error: string; status?: number }> {
  const response = await fetch(
    `${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transition: { id: transitionId },
        fields: {
          resolution: {
            name: resolution,
          },
        },
      }),
    },
  );

  if (response.ok) {
    return { success: true };
  }

  const text = await response.text();
  const parsed = tryParseJson(text);

  return {
    success: false,
    status: response.status,
    error: getErrorMessage(parsed, "Failed to transition issue."),
  };
}

async function addCommentToIssue(
  base: string,
  auth: string,
  issueKey: string,
  comment: string,
): Promise<{ success: true } | { success: false; error: string; status?: number }> {
  const response = await fetch(
    `${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: comment,
                },
              ],
            },
          ],
        },
      }),
    },
  );

  if (response.ok) {
    return { success: true };
  }

  const text = await response.text();
  const parsed = tryParseJson(text);

  return {
    success: false,
    status: response.status,
    error: getErrorMessage(parsed, "Status changed but failed to add comment."),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      jql?: string;
      newStatus?: string;
      resolution?: string;
      comment?: string;
    };

    const jql = typeof body.jql === "string" ? body.jql.trim() : "";
    const newStatus =
      typeof body.newStatus === "string" ? body.newStatus.trim() : "";
    const resolution =
      typeof body.resolution === "string" ? body.resolution.trim() : "";
    const comment =
      typeof body.comment === "string" ? body.comment.trim() : "";

    console.info("[jira-status-change] Request received", {
      hasJql: jql.length > 0,
      newStatus,
      resolution,
      hasComment: comment.length > 0,
    });

    if (!jql || !newStatus || !resolution) {
      return NextResponse.json(
        {
          error:
            "jql, newStatus, and resolution are required in the request body.",
        },
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

    const search = await fetchIssuesByJql(base, auth, jql);
    if ("error" in search) {
      return search.error;
    }

    const issueKeys = search.issues;

    console.info("[jira-status-change] Search completed", {
      totalMatched: issueKeys.length,
      keys: issueKeys,
    });

    const results: StatusChangeRow[] = [];

    for (const issueKey of issueKeys) {
      console.info("[jira-status-change] Processing issue", {
        issueKey,
        newStatus,
        resolution,
        hasComment: comment.length > 0,
      });

      const transitionLookup = await getTransitionIdForIssue(
        base,
        auth,
        issueKey,
        newStatus,
      );

      if ("error" in transitionLookup) {
        console.warn("[jira-status-change] Transition lookup failed", {
          issueKey,
          error: transitionLookup.error,
          status: transitionLookup.status,
        });

        results.push({
          issueKey,
          success: false,
          error: transitionLookup.error,
          status: transitionLookup.status,
        });
        continue;
      }

      const change = await transitionIssue(
        base,
        auth,
        issueKey,
        transitionLookup.transitionId,
        resolution,
      );

      if (!change.success) {
        console.warn("[jira-status-change] Status update failed", {
          issueKey,
          transitionId: transitionLookup.transitionId,
          error: change.error,
          status: change.status,
        });

        results.push({
          issueKey,
          success: false,
          transitionId: transitionLookup.transitionId,
          error: change.error,
          status: change.status,
        });
      } else {
        let commentAdded = false;

        if (comment) {
          const commentResult = await addCommentToIssue(
            base,
            auth,
            issueKey,
            comment,
          );

          if (!commentResult.success) {
            console.warn("[jira-status-change] Comment add failed", {
              issueKey,
              error: commentResult.error,
              status: commentResult.status,
            });

            results.push({
              issueKey,
              success: false,
              transitionId: transitionLookup.transitionId,
              commentAdded: false,
              error: commentResult.error,
              status: commentResult.status,
            });
            continue;
          }

          commentAdded = true;

          console.info("[jira-status-change] Comment added", {
            issueKey,
          });
        }

        console.info("[jira-status-change] Status update succeeded", {
          issueKey,
          transitionId: transitionLookup.transitionId,
          commentAdded,
        });

        results.push({
          issueKey,
          success: true,
          transitionId: transitionLookup.transitionId,
          commentAdded,
        });
      }
    }

    const updatedCount = results.filter((row) => row.success).length;
    const failedCount = results.length - updatedCount;

    console.info("[jira-status-change] Request completed", {
      totalMatched: issueKeys.length,
      updatedCount,
      failedCount,
    });

    return NextResponse.json(
      {
        jql,
        newStatus,
        resolution,
        comment: comment || undefined,
        totalMatched: issueKeys.length,
        updatedCount,
        failedCount,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[jira-status-change] Unexpected server error", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Unexpected server error while changing Jira issue statuses." },
      { status: 500 },
    );
  }
}
