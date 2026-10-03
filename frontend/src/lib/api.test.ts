import { beforeEach, expect, test, vi } from "vitest";
import { login, logout } from "./api";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("refreshes CSRF after login session rotation", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      json({ token: "before", headerName: "X-XSRF-TOKEN" }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json({ token: "after", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(json({ username: "operator", role: "OPERATOR" }));

  await login("operator", "password");

  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "/api/auth/login",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-XSRF-TOKEN": "before" }),
    }),
  );
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/auth/csrf");
});

test("fetches current CSRF immediately before logout", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      json({ token: "current", headerName: "X-XSRF-TOKEN" }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));

  await logout();

  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "/api/auth/logout",
    expect.objectContaining({ headers: { "X-XSRF-TOKEN": "current" } }),
  );
});

test("returns no principal for an expired or forbidden session", async () => {
  const { me } = await import("./api");
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(me()).resolves.toBeNull();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(me()).resolves.toBeNull();
});

test("surfaces safe service errors while restoring a session", async () => {
  const { me } = await import("./api");
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(me()).rejects.toThrow("temporarily unavailable");
});

test("distinguishes invalid credentials from other login failures", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "token", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(login("operator", "wrong")).rejects.toThrow(
    "Incorrect username or password",
  );

  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "token", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(login("operator", "password")).rejects.toThrow("Sign in failed");
});

test("reports CSRF, workspace, and logout failures safely", async () => {
  const { getCsrf, workspace } = await import("./api");
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
  await expect(getCsrf()).rejects.toThrow("temporarily unavailable");

  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(workspace("OFFICER")).rejects.toThrow(
    "Workspace could not be loaded",
  );

  vi.mocked(fetch)
    .mockResolvedValueOnce(
      json({ token: "current", headerName: "X-XSRF-TOKEN" }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(logout()).rejects.toThrow("Sign out failed");
});

test("returns role workspace data on success", async () => {
  const { workspace } = await import("./api");
  const data = {
    heading: "Officer workspace",
    message: "Ready",
    username: "officer",
  };
  vi.mocked(fetch).mockResolvedValueOnce(json(data));
  await expect(workspace("OFFICER")).resolves.toEqual(data);
  expect(fetch).toHaveBeenCalledWith("/api/workspaces/officer");
});
