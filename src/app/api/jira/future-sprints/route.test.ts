/** @jest-environment node */

import { POST } from "./route";

function createRequest() {
  return {} as any;
}

describe("/api/jira/future-sprints POST", () => {
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

  it("filters out AI generated tickets and strips comments", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          issues: [
            {
              id: "1",
              fields: {
                comment: {
                  comments: [
                    { body: "This is AI generated and is intended for..." },
                  ],
                },
              },
            },
            {
              id: "2",
              fields: {
                comment: {
                  comments: [{ body: "Normal human comment" }],
                },
              },
            },
          ],
        }),
    } as any);

    const res = await POST(createRequest());
    const json = await (res as any).json();
    expect((res as any).status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.issues).toHaveLength(1);
    expect(json.issues[0].fields.comment).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
