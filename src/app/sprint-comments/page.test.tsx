import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SprintCommentsPage from "./page";

Object.assign(global, {
  fetch: jest.fn(),
  navigator: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
});

describe("SprintCommentsPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("validates missing sprint name", async () => {
    render(<SprintCommentsPage />);

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(
      await screen.findByText(/sprint name is required/i),
    ).toBeInTheDocument();
  });

  it("shows result JSON on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    } as any);

    render(<SprintCommentsPage />);

    fireEvent.change(screen.getByLabelText(/sprint name/i), {
      target: { value: "Sprint 1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Result JSON/i)).toBeInTheDocument();
  });
});
