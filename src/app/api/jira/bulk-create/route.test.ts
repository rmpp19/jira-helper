/** @jest-environment node */

import { POST } from "./route";

function createFormDataRequest(fileContent: string) {
  const file = {
    text: async () => fileContent,
  } as any;

  return {
    formData: async () => ({
      get: (name: string) => (name === "file" ? file : null),
    }),
  } as any;
}

describe("/api/jira/bulk-create POST", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...OLD_ENV,
      JIRA_BASE_URL: "https://example.atlassian.net",
      JIRA_EMAIL: "user@example.com",
      JIRA_API_TOKEN: "token",
      JIRA_ACCEPTANCE_CRITERIA_FIELD: "customfield_10100",
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 400 when CSV has no data rows", async () => {
    const csv = "project,summary\n"; // header only
    const res = await POST(createFormDataRequest(csv));
    const json = await (res as any).json();
    expect((res as any).status).toBe(400);
    expect(json.error).toMatch(/failed to parse csv file/i);
  });

  it("creates issues from CSV rows", async () => {
    const csv = [
      "project,issue_type,summary,description,acceptancecriteria,component",
      "PROJ,Story,Summary 1,Desc 1,AC 1,Comp A",
    ].join("\n");

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ key: "PROJ-1" }),
    } as any);

    const res = await POST(createFormDataRequest(csv));
    const json = await (res as any).json();

    expect((res as any).status).toBe(200);
    expect(json.totalRows).toBe(1);
    expect(json.createdCount).toBe(1);
    expect(json.failedCount).toBe(0);
    expect(json.results[0].issueKey).toBe("PROJ-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
