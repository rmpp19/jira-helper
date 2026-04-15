import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";

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

function sanitizeCsvInput(raw: string): string {
  return raw
    .replace(/\uFEFF/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) =>
      line.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, ""),
    )
    .join("\n");
}

function toAdfDescription(text: string | undefined): unknown {
  if (!text) return undefined;

  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function parseCsvFallback(text: string): CsvIssue[] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if (char === "\n" && !inQuotes) {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (!rows.length) return [];

  const headerRow = rows[0];
  const headers = headerRow.map((h) => normalizeHeader(h));

  const records: CsvIssue[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 1 && row[0].trim() === "") continue;

    const record: Record<string, string> = {};

    for (let col = 0; col < headers.length; col += 1) {
      const key = headers[col];
      if (!key) continue;
      record[key] = row[col] ?? "";
    }

    records.push(record as CsvIssue);
  }

  return records;
}

type CsvIssue = {
  project?: string;
  issue_type?: string;
  summary?: string;
  description?: string;
  acceptancecriteria?: string;
  component?: string;
};

type BulkCreateResult = {
  rowIndex: number;
  projectKey?: string;
  issueType?: string;
  summary?: string;
  success: boolean;
  issueKey?: string;
  status?: number;
  error?: string;
};

export async function POST(req: NextRequest) {
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

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "CSV file is required in form field 'file'." },
        { status: 400 },
      );
    }

    const text = await file.text();
    const sanitizedText = sanitizeCsvInput(text);

    let records: CsvIssue[];
    try {
      records = parse(sanitizedText, {
        columns: (header: string) => normalizeHeader(header),
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        skip_records_with_error: true,
      }) as CsvIssue[];
    } catch (error) {
      records = parseCsvFallback(sanitizedText);

      if (!records.length) {
        return NextResponse.json(
          {
            error: "Failed to parse CSV file.",
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 400 },
        );
      }
    }

    if (!records.length) {
      return NextResponse.json(
        {
          error: "Failed to parse CSV file: no data rows found.",
        },
        { status: 400 },
      );
    }

    const { baseUrl, email, apiToken } = config;
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const base = baseUrl.replace(/\/$/, "");

    const acceptanceCriteriaFieldKey =
      process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD?.trim() || "customfield_10100";

    const results: BulkCreateResult[] = [];

    for (let index = 0; index < records.length; index += 1) {
      const row = records[index];
      const rowIndex = index + 1; // 1-based index (excluding header)

      const projectKey = row.project?.trim();
      const issueType = (row.issue_type ?? row.issuetype)?.trim();
      const summary = row.summary?.trim();
      const description = row.description?.trim();
      const acceptance = row.acceptancecriteria?.trim();
      const componentName = row.component?.trim();

      const missingFields: string[] = [];
      if (!projectKey) missingFields.push("project");
      if (!issueType) missingFields.push("Issue Type");
      if (!summary) missingFields.push("summary");
      if (!description) missingFields.push("description");
      if (!acceptance) missingFields.push("acceptanceCriteria");
      if (!componentName) missingFields.push("component");

      if (missingFields.length > 0) {
        results.push({
          rowIndex,
          projectKey,
          issueType,
          summary,
          success: false,
          error: `Missing required fields: ${missingFields.join(", ")}.`,
        });
        continue;
      }

      const descriptionParts: string[] = [];
      if (description) descriptionParts.push(description);

      const combinedDescription = descriptionParts.join("\n\n");

      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: issueType ? { name: issueType } : undefined,
        description: toAdfDescription(combinedDescription),
        components: componentName ? [{ name: componentName }] : undefined,
      };

      if (acceptance) {
        fields[acceptanceCriteriaFieldKey] = toAdfDescription(acceptance);
      }

      const payload: Record<string, unknown> = {
        fields,
      };

      try {
        const response = await fetch(`${base}/rest/api/3/issue`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const textBody = await response.text();

        if (!response.ok) {
          let errorMessage = "Jira API request failed.";
          try {
            const json = JSON.parse(textBody) as {
              errorMessages?: string[];
              errors?: Record<string, unknown>;
            };

            const parts: string[] = [];

            if (Array.isArray(json.errorMessages) && json.errorMessages.length) {
              parts.push(json.errorMessages.join("; "));
            }

            if (json.errors && Object.keys(json.errors).length > 0) {
              parts.push(`Field errors: ${JSON.stringify(json.errors)}`);
            }

            if (parts.length > 0) {
              errorMessage = parts.join(" | ");
            }

            console.error("Jira bulk-create row failed", {
              rowIndex,
              projectKey,
              issueType,
              summary,
              status: response.status,
              jiraError: json,
            });
          } catch {
            console.error("Jira bulk-create row failed with non-JSON body", {
              rowIndex,
              projectKey,
              issueType,
              summary,
              status: response.status,
              body: textBody,
            });
          }

          results.push({
            rowIndex,
            projectKey,
            issueType,
            summary,
            success: false,
            status: response.status,
            error: errorMessage,
          });
          continue;
        }

        let createdKey: string | undefined;
        try {
          const json = JSON.parse(textBody) as { key?: string };
          if (typeof json.key === "string") {
            createdKey = json.key;
          }
        } catch {
          // If we cannot parse JSON, we still treat it as a success but without a key.
        }
        const browseUrl = createdKey
          ? `${base}/browse/${encodeURIComponent(createdKey)}`
          : undefined;

        results.push({
          rowIndex,
          projectKey,
          issueType,
          summary,
          success: true,
          issueKey: createdKey,
          status: response.status,
          browseUrl,
        });
      } catch (error) {
        console.error("Unexpected error while calling Jira for bulk-create", {
          rowIndex,
          projectKey,
          issueType,
          summary,
          error,
        });
        results.push({
          rowIndex,
          projectKey,
          issueType,
          summary,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unexpected error while calling Jira.",
        });
      }
    }

    const createdCount = results.filter((r) => r.success).length;
    const failedCount = results.length - createdCount;

    return NextResponse.json(
      {
        totalRows: results.length,
        createdCount,
        failedCount,
        results,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error while processing CSV." },
      { status: 500 },
    );
  }
}
