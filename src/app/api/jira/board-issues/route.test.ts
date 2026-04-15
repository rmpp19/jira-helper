/** @jest-environment node */

import { POST } from "./route";

function createRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe("/api/jira/board-issues POST", () => {
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

  it("returns 400 when boardId is missing", async () => {
    const res = await POST(createRequest({}));
    const json = await (res as any).json();
    expect((res as any).status).toBe(400);
    expect(json.error).toMatch(/boardId is required/i);
  });

  it("aggregates paginated Jira results", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [{ id: "1" }], isLast: false }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [{ id: "2" }], isLast: true }),
      } as any);

    const res = await POST(createRequest({ boardId: "123" }));
    const json = await (res as any).json();
    expect((res as any).status).toBe(200);
    expect(json.total).toBe(2);
    expect(json.issues).toHaveLength(2);
  });
});
