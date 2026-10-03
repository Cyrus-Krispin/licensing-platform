import { beforeEach, expect, test, vi } from "vitest"
import { login, logout } from "./api"

beforeEach(() => vi.stubGlobal("fetch", vi.fn()))

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } })
}

test("refreshes CSRF after login session rotation", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "before", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json({ token: "after", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(json({ username: "operator", role: "OPERATOR" }))

  await login("operator", "password")

  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "/api/auth/login",
    expect.objectContaining({ headers: expect.objectContaining({ "X-XSRF-TOKEN": "before" }) }),
  )
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/auth/csrf")
})

test("fetches current CSRF immediately before logout", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "current", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))

  await logout()

  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "/api/auth/logout",
    expect.objectContaining({ headers: { "X-XSRF-TOKEN": "current" } }),
  )
})
