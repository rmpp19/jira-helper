import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FutureSprintsPage from "./page";

Object.assign(global, {
  fetch: jest.fn(),
  navigator: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
});

describe("FutureSprintsPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("calls API and shows result", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    } as any);

    render(<FutureSprintsPage />);

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Result JSON/i)).toBeInTheDocument();
  });
});
