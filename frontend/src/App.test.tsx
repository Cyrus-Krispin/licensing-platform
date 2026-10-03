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
  getDraft: vi.fn(),
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

  test("locks draft controls while saving and recovers an unknown result", async () => {
    const draft = {
      id: "draft-1",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: "Before",
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
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    let rejectSave: ((reason: Error) => void) | undefined;
    vi.mocked(api.saveDraft)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSave = reject;
          }),
      )
      .mockResolvedValueOnce({
        ...draft,
        revision: 2,
        legalName: "Changed locally",
      });
    vi.mocked(api.getDraft).mockResolvedValue({
      ...draft,
      revision: 1,
      legalName: "Changed locally",
    });
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Before/ }),
    );
    const legalName = screen.getByLabelText(/Legal name/);
    await userEvent.clear(legalName);
    await userEvent.type(legalName, "Changed locally");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(legalName).toBeDisabled();
    expect(screen.getByRole("button", { name: "All drafts" })).toBeDisabled();
    await userEvent.type(legalName, " later edit");
    await userEvent.click(screen.getByRole("button", { name: "All drafts" }));
    expect(legalName).toHaveValue("Changed locally");

    rejectSave?.(new Error("Connection ended before a response"));
    expect(await screen.findByText(/server has revision 1/i)).toBeVisible();
    expect(api.getDraft).toHaveBeenCalledWith("draft-1");
    expect(legalName).toHaveValue("Changed locally");
    expect(legalName).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenNthCalledWith(
      2,
      "draft-1",
      1,
      expect.objectContaining({ legalName: "Changed locally" }),
    );
  });

  test("links applicant role validation to the official native select", async () => {
    const draft = {
      id: "draft-role",
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
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockRejectedValue({
      status: 422,
      message: "Correct the highlighted fields",
      fieldErrors: { applicantRole: "Choose a valid value" },
    });
    vi.mocked(api.getDraft).mockResolvedValue(draft);
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Untitled draft/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const role = screen.getByLabelText(/Role/);
    expect(role).toHaveAttribute("aria-invalid", "true");
    expect(role).toHaveAttribute("aria-describedby", "applicantRole-error");
    expect(screen.getByText("Choose a valid value")).toHaveAttribute(
      "id",
      "applicantRole-error",
    );
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
