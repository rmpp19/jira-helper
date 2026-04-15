import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TicketInfoPage from "./page";

Object.assign(global, {
  fetch: jest.fn(),
  navigator: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
});

describe("TicketInfoPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("validates missing issue key", async () => {
    render(<TicketInfoPage />);

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(await screen.findByText(/issue key is required/i)).toBeInTheDocument();
  });

  it("shows result JSON on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ key: "TEST-1" }),
    } as any);

    render(<TicketInfoPage />);

    fireEvent.change(screen.getByLabelText(/issue key/i), {
      target: { value: "TEST-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(global.fetch).toHaveBeenCalledTimes(1);

    expect(await screen.findByText(/"TEST-1"/)).toBeInTheDocument();
  });

  it("shows invalid issue key message for malformed key", async () => {
    render(<TicketInfoPage />);

    fireEvent.change(screen.getByLabelText(/issue key/i), {
      target: { value: "1234" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(
      await screen.findByText(/issue key is invalid/i),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
