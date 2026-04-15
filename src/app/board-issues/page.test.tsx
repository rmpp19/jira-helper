import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BoardIssuesPage from "./page";

Object.assign(global, {
  fetch: jest.fn(),
  navigator: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
});

describe("BoardIssuesPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("validates missing board id", async () => {
    render(<BoardIssuesPage />);

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(
      await screen.findByText(/board id is required/i),
    ).toBeInTheDocument();
  });

  it("shows result JSON on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    } as any);

    render(<BoardIssuesPage />);

    fireEvent.change(screen.getByLabelText(/board id/i), {
      target: { value: "123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Result JSON/i)).toBeInTheDocument();
  });
});
