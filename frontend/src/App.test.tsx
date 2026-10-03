import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import App from "./App"
import * as api from "./lib/api"

vi.mock("./lib/api", () => ({
  me: vi.fn(),
  login: vi.fn(),
  workspace: vi.fn(),
  logout: vi.fn(),
}))

const workspace = { heading: "Operator workspace", message: "Welcome", username: "operator" }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.me).mockResolvedValue(null)
  vi.mocked(api.workspace).mockResolvedValue(workspace)
  vi.mocked(api.logout).mockResolvedValue()
})

describe("authentication workspace", () => {
  test.each([
    ["operator", "OPERATOR", "Operator workspace"],
    ["officer", "OFFICER", "Officer workspace"],
  ] as const)("signs in and signs out %s", async (username, role, heading) => {
    vi.mocked(api.login).mockResolvedValue({ username, role })
    vi.mocked(api.workspace).mockResolvedValue({ heading, message: "Welcome", username })
    render(<App />)

    await screen.findByRole("heading", { name: "Sign in" })
    await userEvent.type(screen.getByLabelText("Username"), username)
    await userEvent.type(screen.getByLabelText("Password"), "password")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible()
  })

  test("restores an authenticated session and loads its workspace", async () => {
    vi.mocked(api.me).mockResolvedValue({ username: "officer", role: "OFFICER" })
    vi.mocked(api.workspace).mockResolvedValue({
      heading: "Officer workspace",
      message: "Review queue",
      username: "officer",
    })
    render(<App />)
    expect(screen.getByRole("status")).toHaveTextContent("Restoring")
    expect(await screen.findByRole("heading", { name: "Officer workspace" })).toBeVisible()
  })

  test("shows workspace failure and recovers on retry", async () => {
    vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" })
    vi.mocked(api.workspace)
      .mockRejectedValueOnce(new Error("Workspace could not be loaded"))
      .mockResolvedValueOnce(workspace)
    render(<App />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace could not be loaded")
    await userEvent.click(screen.getByRole("button", { name: "Retry workspace" }))
    expect(await screen.findByText("Welcome")).toBeVisible()
  })

  test("keeps the workspace visible when logout fails", async () => {
    vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" })
    vi.mocked(api.logout).mockRejectedValue(new Error("Sign out failed"))
    render(<App />)
    await screen.findByRole("heading", { name: "Operator workspace" })
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed")
    expect(screen.getByRole("heading", { name: "Operator workspace" })).toBeVisible()
  })
})
