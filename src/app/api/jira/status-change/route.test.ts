/** @jest-environment node */

import { POST } from "./route";

function createRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe("/api/jira/status-change POST", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...OLD_ENV,
      JIRA_BASE_URL: "https://example.atlassian.net",
      JIRA_EMAIL: "user@example.com",
      JIRA_API_TOKEN: "token",
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 400 when required body fields are missing", async () => {
    const res = await POST(createRequest({ jql: "project = ABC" }));
    const json = await (res as any).json();

    expect((res as any).status).toBe(400);
    expect(json.error).toMatch(/jql, newStatus, and resolution are required/i);
  });

  it("returns 500 when Jira config is missing", async () => {
    process.env = {
      ...OLD_ENV,
      JIRA_BASE_URL: "",
      JIRA_EMAIL: "",
      JIRA_API_TOKEN: "",
    } as any;

    const res = await POST(
      createRequest({
        jql: "project = ABC",
        newStatus: "Done",
        resolution: "Done",
      }),
    );
    const json = await (res as any).json();

    expect((res as any).status).toBe(500);
    expect(json.error).toMatch(/Jira configuration missing/i);
  });

  it("changes status for matched issues and returns summary", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any);

    fetchMock
      // Search API
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            total: 2,
            issues: [{ key: "ABC-1" }, { key: "ABC-2" }],
          }),
      } as any)
      // Transitions for ABC-1
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            transitions: [{ id: "31", name: "Done", to: { name: "Done" } }],
          }),
      } as any)
      // Perform transition for ABC-1
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => "",
      } as any)
      // Add comment for ABC-1
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: "10001" }),
      } as any)
      // Transitions for ABC-2
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            transitions: [{ id: "41", name: "Done", to: { name: "Done" } }],
          }),
      } as any)
      // Perform transition for ABC-2
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => "",
      } as any)
      // Add comment for ABC-2
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: "10002" }),
      } as any);

    const res = await POST(
      createRequest({
        jql: "project = ABC",
        newStatus: "Done",
        resolution: "Done",
        comment: "Bulk updated by Jira Helper",
      }),
    );

    const json = await (res as any).json();

    expect((res as any).status).toBe(200);
    expect(json.totalMatched).toBe(2);
    expect(json.updatedCount).toBe(2);
    expect(json.failedCount).toBe(0);
    expect(json.results).toHaveLength(2);
    expect(json.results[0].commentAdded).toBe(true);
    expect(json.results[1].commentAdded).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
});
