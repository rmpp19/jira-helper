import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "./page";

Object.assign(global, {
  fetch: jest.fn(),
});

function mockSuccessfulBulkCreate() {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      totalRows: 1,
      createdCount: 1,
      failedCount: 0,
      results: [
        {
          rowIndex: 1,
          projectKey: "PROJ",
          issueType: "Story",
          summary: "Summary 1",
          success: true,
          issueKey: "PROJ-1",
        },
      ],
    }),
  } as any);
}

function mockSuccessfulFilterReport() {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      jql: "project = XYZ",
      total: 2,
      rows: [
        { issueKey: "XYZ-1" },
        { issueKey: "XYZ-2" },
      ],
    }),
  } as any);
}

describe("Home page", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("renders tool links", () => {
    render(<Home />);
    expect(
      screen.getByRole("link", { name: /Get ticket information/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Get sprint tickets with comments/i }),
    ).toBeInTheDocument();
  });

  it("calls bulk-create API and shows results", async () => {
    mockSuccessfulBulkCreate();
    render(<Home />);

    const fileInput = screen.getByLabelText(/csv file/i) as HTMLInputElement;

    const file = new File(["project,summary\nPROJ,Summary 1"], "test.csv", {
      type: "text/csv",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitButton = screen.getByRole("button", {
      name: /upload and create tickets/i,
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/bulk create summary/i),
    ).toBeInTheDocument();

    const summaryLine = await screen.findByText((content) => {
      const normalized = content.replace(/\s+/g, " ").toLowerCase();
      return (
        normalized.includes("processed") &&
        normalized.includes("created") &&
        normalized.includes("failed")
      );
    });

    expect(summaryLine).toBeInTheDocument();
  });

  it("calls filter-report API and shows JSON", async () => {
    mockSuccessfulFilterReport();
    render(<Home />);

    const textarea = screen.getByLabelText(/jira filter/i) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "project = XYZ" } });

    const runButton = screen.getByRole("button", { name: /run filter/i });

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/filter summary/i),
    ).toBeInTheDocument();
  });
});
