import { fireEvent, render, screen } from "@testing-library/react";
import StatusChangePage from "./page";

Object.assign(global, {
  fetch: jest.fn(),
  navigator: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
});

describe("StatusChangePage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("validates required fields", async () => {
    render(<StatusChangePage />);

    fireEvent.click(screen.getByRole("button", { name: /run status change/i }));

    expect(
      await screen.findByText(/jql, new status, and resolution are required/i),
    ).toBeInTheDocument();
  });

  it("shows JSON result on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        totalMatched: 1,
        updatedCount: 1,
        failedCount: 0,
        results: [{ issueKey: "ABC-1", success: true }],
      }),
    } as any);

    render(<StatusChangePage />);

    fireEvent.change(screen.getByLabelText(/jira query/i), {
      target: { value: "project = ABC" },
    });
    fireEvent.change(screen.getByLabelText(/new status/i), {
      target: { value: "Done" },
    });
    fireEvent.change(screen.getByLabelText(/resolution/i), {
      target: { value: "Done" },
    });
    fireEvent.change(screen.getByLabelText(/comment/i), {
      target: { value: "Bulk updated by Jira Helper" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run status change/i }));

    expect(await screen.findByText(/"ABC-1"/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/jira/status-change",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jql: "project = ABC",
          newStatus: "Done",
          resolution: "Done",
          comment: "Bulk updated by Jira Helper",
        }),
      }),
    );
  });
});
