/** @jest-environment node */

import { POST } from "./route";

function createRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe("/api/jira/carry-over POST", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...OLD_ENV,
      JIRA_BASE_URL: "https://example.atlassian.net",
      JIRA_EMAIL: "user@example.com",
      JIRA_API_TOKEN: "token",
      JIRA_CARRYOVER_REASON_FIELD: "carryoverReason",
      JIRA_CARRYOVER_DETAIL_FIELD: "carryoverDetail",
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 500 when Jira config is missing", async () => {
    process.env = {
      ...OLD_ENV,
      JIRA_BASE_URL: "",
      JIRA_EMAIL: "",
      JIRA_API_TOKEN: "",
    } as any;

    const res = await POST(createRequest({}));
    const json = await (res as any).json();
    expect((res as any).status).toBe(500);
    expect(json.error).toMatch(/Jira configuration missing/i);
  });

  it("filters carry-over tickets for a specific sprint", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          issues: [
            {
              key: "DXQ-1",
              fields: {
                carryoverReason: "Blocked",
                carryoverDetail: null,
              },
            },
            {
              key: "DXQ-2",
              fields: {
                carryoverReason: null,
                carryoverDetail: "Scope change",
              },
            },
            {
              key: "DXQ-3",
              fields: {
                carryoverReason: null,
                carryoverDetail: null,
              },
            },
          ],
        }),
    } as any);

    const res = await POST(createRequest({ sprintName: "Sprint 1" }));
    const json = await (res as any).json();

    expect((res as any).status).toBe(200);
    expect(json.issues).toHaveLength(2);
    const keys = json.issues.map((i: any) => i.key).sort();
    expect(keys).toEqual(["DXQ-1", "DXQ-2"].sort());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("filters carry-over tickets across all sprints when sprint name is omitted", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          issues: [
            {
              key: "DXQ-1",
              fields: {
                carryoverReason: "Blocked",
                carryoverDetail: null,
              },
            },
            {
              key: "CNX-1",
              fields: {
                carryoverReason: null,
                carryoverDetail: "Spillover",
              },
            },
            {
              key: "DXQ-2",
              fields: {
                carryoverReason: null,
                carryoverDetail: null,
              },
            },
          ],
        }),
    } as any);

    const res = await POST(createRequest({}));
    const json = await (res as any).json();

    expect((res as any).status).toBe(200);
    expect(json.issues).toHaveLength(2);
    const keys = json.issues.map((i: any) => i.key).sort();
    expect(keys).toEqual(["CNX-1", "DXQ-1"].sort());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when sprint name is invalid", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ issues: [] }),
    } as any);

    const res = await POST(createRequest({ sprintName: "Nonexistent Sprint" }));
    const json = await (res as any).json();

    expect((res as any).status).toBe(400);
    expect(json.error).toMatch(/invalid or not found/i);
  });
});
