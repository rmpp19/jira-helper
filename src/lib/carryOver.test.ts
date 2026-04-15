import { getCarryOverTickets } from "./carryOver";

type JiraIssue = {
  key: string;
  sprintName?: string | null;
  carryoverReason?: string | null;
  carryoverDetail?: string | null;
};

/**
 * NOTE: These tests are written first for TDD.
 * The implementation of getCarryOverTickets in src/lib/carryOver.ts
 * does not exist yet and should be created to make these tests pass.
 */

describe("getCarryOverTickets", () => {
  const issues: JiraIssue[] = [
    {
      key: "DXQ-1",
      sprintName: "Sprint 1",
      carryoverReason: "Blocked by dependency",
      carryoverDetail: null,
    },
    {
      key: "DXQ-2",
      sprintName: "Sprint 1",
      carryoverReason: null,
      carryoverDetail: "Work spilled over due to scope change",
    },
    {
      key: "DXQ-3",
      sprintName: "Sprint 1",
      carryoverReason: null,
      carryoverDetail: null,
    },
    {
      key: "CNX-1",
      sprintName: "Sprint 2",
      carryoverReason: "Team capacity issue",
      carryoverDetail: "Developer out sick",
    },
    {
      key: "CNX-2",
      sprintName: "Sprint 2",
      carryoverReason: null,
      carryoverDetail: null,
    },
    {
      key: "LEAP-1",
      sprintName: undefined,
      carryoverReason: "Backlog grooming",
      carryoverDetail: null,
    },
  ];

  it("returns carry-over tickets for a specific sprint (reason OR detail)", () => {
    // Gherkin: Get carry-over tickets for a specific sprint
    const result = getCarryOverTickets(issues, { sprintName: "Sprint 1" });

    // Only Sprint 1 tickets that have carryover reason OR detail
    const keys = result.map((i) => i.key).sort();
    expect(keys).toEqual(["DXQ-1", "DXQ-2"].sort());

    // Every returned ticket has reason or detail
    for (const issue of result) {
      const hasReason = !!issue.carryoverReason?.trim();
      const hasDetail = !!issue.carryoverDetail?.trim();
      expect(hasReason || hasDetail).toBe(true);
    }
  });

  it("returns carry-over tickets across all sprints when sprint name is omitted", () => {
    // Gherkin: Get all carry-over tickets across all sprints
    const result = getCarryOverTickets(issues);

    const keys = result.map((i) => i.key).sort();
    expect(keys).toEqual(["DXQ-1", "DXQ-2", "CNX-1", "LEAP-1"].sort());

    for (const issue of result) {
      const hasReason = !!issue.carryoverReason?.trim();
      const hasDetail = !!issue.carryoverDetail?.trim();
      expect(hasReason || hasDetail).toBe(true);
    }
  });

  it("returns an empty list when a specific sprint has no carry-over tickets", () => {
    // Gherkin: No carry-over tickets for a specific sprint
    const sprintThreeIssues: JiraIssue[] = [
      {
        key: "DXQ-99",
        sprintName: "Sprint 3",
        carryoverReason: null,
        carryoverDetail: null,
      },
    ];

    const result = getCarryOverTickets(sprintThreeIssues, {
      sprintName: "Sprint 3",
    });

    expect(result).toEqual([]);
  });

  it("returns an empty list when no tickets have carryover reason or detail", () => {
    // Gherkin: No carry-over tickets across all sprints
    const cleanIssues: JiraIssue[] = [
      { key: "DXQ-10", sprintName: "Sprint X" },
      { key: "DXQ-11", sprintName: "Sprint Y" },
    ];

    const result = getCarryOverTickets(cleanIssues);

    expect(result).toEqual([]);
  });

  it("can distinguish an invalid sprint name from a valid sprint with no carry-overs", () => {
    // Gherkin: Invalid sprint name vs no carry-over tickets
    // This test assumes the implementation will throw or signal invalid sprint names
    // differently from a sprint that exists but has no carry-overs.

    // When sprint exists but has no carry-overs -> empty array
    const sprintWithNoCarryOvers: JiraIssue[] = [
      {
        key: "DXQ-20",
        sprintName: "Existing Sprint",
        carryoverReason: null,
        carryoverDetail: null,
      },
    ];

    const noCarryOvers = getCarryOverTickets(sprintWithNoCarryOvers, {
      sprintName: "Existing Sprint",
    });
    expect(noCarryOvers).toEqual([]);

    // When sprint is invalid / not found -> expect implementation to signal error;
    // you can change this behaviour if you prefer a different contract.
    expect(() =>
      getCarryOverTickets(sprintWithNoCarryOvers, {
        sprintName: "Nonexistent Sprint",
      }),
    ).toThrow(/sprint name is invalid|not found/i);
  });
});
