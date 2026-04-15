/** @jest-environment node */

import { POST } from "./route";

function createRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe("/api/jira/sprint-comments POST", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ issues: [] }),
    } as any);
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

  it("returns 400 when sprintName is missing", async () => {
    const res = await POST(createRequest({}));
    const json = await (res as any).json();
    expect((res as any).status).toBe(400);
    expect(json.error).toMatch(/sprintName is required/i);
  });

  it("returns 500 when Jira config is missing", async () => {
    process.env = { ...OLD_ENV, JIRA_BASE_URL: "", JIRA_EMAIL: "", JIRA_API_TOKEN: "" } as any;
    const res = await POST(createRequest({ sprintName: "Sprint 1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(500);
    expect(json.error).toMatch(/Jira configuration missing/i);
  });

  it("sanitizes and enriches Jira response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          issues: [
            {
              id: "1",
              fields: {
                sprint: [{ id: "123", name: "Sprint 1" }],
                summary: "Test issue",
              },
            },
          ],
        }),
    } as any);

    // Second call for sprint detail
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "123", name: "Sprint 1" }),
    } as any);

    const res = await POST(createRequest({ sprintName: "Sprint 1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(200);
    // Basic success path: we get a 200 and at least one issue back
    expect(json.issues).toHaveLength(1);
  });

  it("handles Jira non-JSON response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "not-json",
    } as any);

    const res = await POST(createRequest({ sprintName: "Sprint 1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(502);
    expect(json.error).toMatch(/non-JSON response/i);
  });
});
