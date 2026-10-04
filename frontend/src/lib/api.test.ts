import { beforeEach, expect, test, vi } from "vitest";
import {
  createDraft,
  getDraft,
  listDrafts,
  login,
  logout,
  saveDraft,
} from "./api";

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

test("lists, creates, and saves drafts with fresh CSRF", async () => {
  const draft = { id: "d1", revision: 0, status: "DRAFT" };
  vi.mocked(fetch).mockResolvedValueOnce(json([draft]));
  await expect(listDrafts()).resolves.toEqual([draft]);
  vi.mocked(fetch).mockResolvedValueOnce(json(draft));
  await expect(getDraft("d1")).resolves.toEqual(draft);
  expect(fetch).toHaveBeenLastCalledWith("/api/applications/d1");
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "a", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(json(draft, 201));
  await expect(createDraft("retry-key")).resolves.toEqual(draft);
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/applications",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": "retry-key",
        "X-XSRF-TOKEN": "a",
      }),
    }),
  );
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "b", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(json({ ...draft, revision: 1 }));
  await expect(
    saveDraft("d1", 0, { legalName: "Cafe" }),
  ).resolves.toMatchObject({ revision: 1 });
});

test("returns draft field and stale-save errors", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "a", headerName: "X-XSRF-TOKEN" }))
    .mockResolvedValueOnce(
      json(
        {
          message: "Correct fields",
          fieldErrors: { applicantEmail: "Enter a valid email address" },
        },
        422,
      ),
    );
  await expect(
    saveDraft("d1", 0, { applicantEmail: "bad" }),
  ).rejects.toMatchObject({
    status: 422,
    fieldErrors: { applicantEmail: "Enter a valid email address" },
  });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
  await expect(listDrafts()).rejects.toThrow("temporarily unavailable");
});

test("uploads evidence with CSRF, retry key, and progress", async () => {
  const { uploadEvidence } = await import("./api");
  vi.mocked(fetch).mockResolvedValueOnce(
    json({ token: "upload-csrf", headerName: "X-XSRF-TOKEN" }),
  );
  class FakeRequest {
    static created: FakeRequest | undefined;
    constructor() {
      FakeRequest.created = this;
    }
    upload: {
      onprogress:
        | ((event: {
            lengthComputable: boolean;
            loaded: number;
            total: number;
          }) => void)
        | null;
    } = { onprogress: null };
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    status = 200;
    responseText = JSON.stringify({ upload: { id: "u1" }, revision: 2 });
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
      this.onload?.();
    });
  }
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
  const progress = vi.fn();

  await expect(
    uploadEvidence(
      "a1",
      "r1",
      1,
      "retry",
      new File(["x"], "proof.png"),
      progress,
    ),
  ).resolves.toMatchObject({ revision: 2 });
  expect(FakeRequest.created?.open).toHaveBeenCalledWith(
    "POST",
    "/api/applications/a1/evidence/requests/r1?expectedRevision=1",
  );
  expect(FakeRequest.created?.setRequestHeader).toHaveBeenCalledWith(
    "Idempotency-Key",
    "retry",
  );
  expect(progress).toHaveBeenCalledWith(50);
});

test("workflow calls use fresh CSRF, versions and idempotency and preserve validation errors", async () => {
  const api = await import("./api");
  const detail = {
    id: "app",
    revision: 7,
    latestVersion: 2,
  } as import("./api").CaseDetail;
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "fresh", headerName: "X-CSRF" }))
    .mockResolvedValueOnce(json({ id: "app" }));
  await api.caseCommand(
    detail,
    "resubmit",
    { accuracy: true, authority: true },
    "key",
  );
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/cases/app/resubmit",
    expect.objectContaining({
      headers: expect.objectContaining({
        "X-CSRF": "fresh",
        "Idempotency-Key": "key",
      }),
      body: JSON.stringify({
        expectedRevision: 7,
        expectedVersion: 2,
        accuracy: true,
        authority: true,
      }),
    }),
  );
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "fresh", headerName: "X-CSRF" }))
    .mockResolvedValueOnce(
      json(
        { message: "Incomplete", fieldErrors: { responses: "Respond first" } },
        422,
      ),
    );
  await expect(
    api.caseCommand(detail, "submit", {}, "other"),
  ).rejects.toMatchObject({
    status: 422,
    fieldErrors: { responses: "Respond first" },
  });
});
test("case and notification reads and read-state writes use the correct routes", async () => {
  const api = await import("./api");
  vi.mocked(fetch).mockResolvedValueOnce(json([]));
  await expect(api.listCases()).resolves.toEqual([]);
  vi.mocked(fetch).mockResolvedValueOnce(json({ id: "app" }));
  await expect(api.getCase("app")).resolves.toEqual({ id: "app" });
  vi.mocked(fetch).mockResolvedValueOnce(json([]));
  await expect(api.notifications()).resolves.toEqual([]);
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "token", headerName: "X-CSRF" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await api.readNotification("notice");
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/notifications/notice/read",
    expect.objectContaining({ method: "POST" }),
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    json({ message: "Not permitted" }, 403),
  );
  await expect(api.getCase("app")).rejects.toThrow("Not permitted");
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "token", headerName: "X-CSRF" }))
    .mockResolvedValueOnce(new Response("bad", { status: 503 }));
  await expect(api.readNotification("notice")).rejects.toThrow(
    "workflow request failed",
  );
});
test("simulated processing status and retry are separate from draft revision writes", async () => {
  const api = await import("./api");
  vi.mocked(fetch).mockResolvedValueOnce(
    json([{ uploadId: "file", state: "ERROR" }]),
  );
  await expect(api.processingStatuses("app")).resolves.toEqual([
    { uploadId: "file", state: "ERROR" },
  ]);
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "token", headerName: "X-CSRF" }))
    .mockResolvedValueOnce(
      json({ status: { state: "QUEUED" }, resultingAttempt: 2 }),
    );
  await expect(
    api.retryProcessing("app", "file", "retry-key"),
  ).resolves.toMatchObject({ resultingAttempt: 2 });
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/applications/app/evidence/processing/file/retry",
    expect.objectContaining({
      body: "{}",
      headers: expect.objectContaining({ "Idempotency-Key": "retry-key" }),
    }),
  );
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(api.processingStatuses("app")).rejects.toThrow(
    "temporarily unavailable",
  );
  vi.mocked(fetch)
    .mockResolvedValueOnce(json({ token: "token", headerName: "X-CSRF" }))
    .mockResolvedValueOnce(new Response("bad", { status: 409 }));
  await expect(
    api.retryProcessing("app", "file", "retry-key"),
  ).rejects.toMatchObject({ status: 409 });
});
