/** @jest-environment node */

import { POST } from "./route";

function createRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe("/api/jira/ticket POST", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: "TEST-1" }),
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

  it("returns 400 when issueKey is missing", async () => {
    const res = await POST(createRequest({}));
    const json = await (res as any).json();
    expect((res as any).status).toBe(400);
    expect(json.error).toMatch(/issueKey is required/i);
  });

  it("returns 500 when Jira config is missing", async () => {
    process.env = { ...OLD_ENV, JIRA_BASE_URL: "", JIRA_EMAIL: "", JIRA_API_TOKEN: "" } as any;
    const res = await POST(createRequest({ issueKey: "TEST-1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(500);
    expect(json.error).toMatch(/Jira configuration missing/i);
  });

  it("proxies successful Jira response", async () => {
    const res = await POST(createRequest({ issueKey: "TEST-1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(200);
    expect(json).toEqual({ key: "TEST-1" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("handles Jira non-JSON response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "not-json",
    } as any);

    const res = await POST(createRequest({ issueKey: "TEST-1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(502);
    expect(json.error).toMatch(/non-JSON response/i);
  });

  it("bubbles Jira error status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    } as any);

    const res = await POST(createRequest({ issueKey: "MISSING-1" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(404);
    expect(json.error).toMatch(/Jira API request failed/i);
  });
});
