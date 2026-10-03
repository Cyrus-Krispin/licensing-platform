import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";

vi.mock("./lib/api", () => ({
  me: vi.fn(),
  login: vi.fn(),
  workspace: vi.fn(),
  logout: vi.fn(),
  listDrafts: vi.fn().mockResolvedValue([]),
  createDraft: vi.fn(),
  saveDraft: vi.fn(),
}));

const workspace = {
  heading: "Operator workspace",
  message: "Welcome",
  username: "operator",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.me).mockResolvedValue(null);
  vi.mocked(api.workspace).mockResolvedValue(workspace);
  vi.mocked(api.logout).mockResolvedValue();
  vi.mocked(api.listDrafts).mockResolvedValue([]);
});

describe("authentication workspace", () => {
  test("creates and explicitly saves an incomplete draft", async () => {
    const draft = {
      id: "d1",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: null,
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: null,
      applicantPhone: null,
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.createDraft).mockResolvedValue(draft);
    vi.mocked(api.saveDraft).mockResolvedValue({
      ...draft,
      revision: 1,
      legalName: "Cafe One",
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Create draft" }),
    );
    await userEvent.type(screen.getByLabelText(/Legal name/), "Cafe One");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/Saved revision 1/)).toBeVisible();
    expect(api.saveDraft).toHaveBeenCalledWith(
      "d1",
      0,
      expect.objectContaining({ legalName: "Cafe One", tradingName: null }),
    );
  });

  test("retries an uncertain create with the same key without overlap", async () => {
    const draft = {
      id: "recovered",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: null,
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: null,
      applicantPhone: null,
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    let rejectFirst: ((reason: Error) => void) | undefined;
    vi.mocked(api.createDraft)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(draft);
    render(<App />);

    const create = await screen.findByRole("button", { name: "Create draft" });
    await userEvent.click(create);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Creating…" }));
    expect(api.createDraft).toHaveBeenCalledTimes(1);
    rejectFirst?.(new Error("Connection ended before a response"));

    const retry = await screen.findByRole("button", { name: "Retry create" });
    const firstKey = vi.mocked(api.createDraft).mock.calls[0][0];
    await userEvent.click(retry);
    expect(api.createDraft).toHaveBeenNthCalledWith(2, firstKey);
    expect(await screen.findByText("Application draft")).toBeVisible();
  });
  test.each([
    ["operator", "OPERATOR", "Operator workspace"],
    ["officer", "OFFICER", "Officer workspace"],
  ] as const)("signs in and signs out %s", async (username, role, heading) => {
    vi.mocked(api.login).mockResolvedValue({ username, role });
    vi.mocked(api.workspace).mockResolvedValue({
      heading,
      message: "Welcome",
      username,
    });
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await userEvent.type(screen.getByLabelText("Username"), username);
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
  });

  test("restores an authenticated session and loads its workspace", async () => {
    vi.mocked(api.me).mockResolvedValue({
      username: "officer",
      role: "OFFICER",
    });
    vi.mocked(api.workspace).mockResolvedValue({
      heading: "Officer workspace",
      message: "Review queue",
      username: "officer",
    });
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring");
    expect(
      await screen.findByRole("heading", { name: "Officer workspace" }),
    ).toBeVisible();
  });

  test("shows workspace failure and recovers on retry", async () => {
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.workspace)
      .mockRejectedValueOnce(new Error("Workspace could not be loaded"))
      .mockResolvedValueOnce(workspace);
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Workspace could not be loaded",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retry workspace" }),
    );
    expect(await screen.findByText("Welcome")).toBeVisible();
  });

  test("keeps the workspace visible when logout fails", async () => {
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.logout).mockRejectedValue(new Error("Sign out failed"));
    render(<App />);
    await screen.findByRole("heading", { name: "Operator workspace" });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out failed",
    );
    expect(
      screen.getByRole("heading", { name: "Operator workspace" }),
    ).toBeVisible();
  });
});
