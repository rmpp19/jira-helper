import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CarryOverPage from "./page";

Object.assign(global, {
  fetch: jest.fn(),
  navigator: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
});

describe("CarryOverPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("calls API with sprint name when provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    } as any);

    render(<CarryOverPage />);

    fireEvent.change(screen.getByLabelText(/sprint name/i), {
      target: { value: "Sprint 1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.sprintName).toBe("Sprint 1");
  });

  it("calls API without sprint name when left blank", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    } as any);

    render(<CarryOverPage />);

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.sprintName).toBeUndefined();
  });

  it("shows error message when API call fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Sprint name is invalid or not found." }),
    } as any);

    render(<CarryOverPage />);

    fireEvent.change(screen.getByLabelText(/sprint name/i), {
      target: { value: "Bad Sprint" },
    });

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(
      await screen.findByText(/sprint name is invalid or not found/i),
    ).toBeInTheDocument();
  });

  it("shows result JSON on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [{ key: "DXQ-1" }] }),
    } as any);

    render(<CarryOverPage />);

    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Result JSON/i)).toBeInTheDocument();
  });
});
