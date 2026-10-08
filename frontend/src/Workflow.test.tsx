import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import {
  CasePanel,
  OfficerCases,
  Notifications,
  statusLabel,
} from "./Workflow";
import * as api from "./lib/api";
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getCase: vi.fn(),
  caseCommand: vi.fn(),
  listCases: vi.fn(),
  notifications: vi.fn(),
  readNotification: vi.fn(),
  clearNotifications: vi.fn(),
}));
const draft: api.Draft = {
  id: "case",
  revision: 2,
  status: "DRAFT",
  updatedAt: "2026-10-04T00:00:00Z",
  legalName: "Cafe",
  registrationNumber: "123",
  structure: "COMPANY",
  tradingName: null,
  applicantName: "Owner",
  applicantRole: "OWNER",
  applicantEmail: "owner@example.test",
  applicantPhone: "12345678",
  documentRequests: [
    {
      id: "doc",
      type: "BUSINESS_REGISTRATION",
      applicability: "APPLICABLE",
      reason: "Required",
      currentUpload: {
        id: "file",
        requestId: "doc",
        filename: "registration.pdf",
        byteSize: 100,
        sha256: "hash",
        contentType: "application/pdf",
        createdAt: "2026-10-04T00:00:00Z",
        ready: true,
      },
    },
  ],
};
const base: api.CaseDetail = {
  id: "case",
  revision: 2,
  status: "DRAFT",
  latestVersion: 0,
  round: 0,
  working: draft,
  versions: [],
  issues: [],
  events: [],
};
const version = {
  number: 1,
  snapshot: draft,
  submittedBy: "operator",
  submittedAt: "2026-10-04T00:00:00Z",
  accuracy: true,
  authority: true,
};
const issue: api.CaseIssue = {
  id: "issue",
  kind: "FIELD",
  target: "legalName",
  text: "Correct legal name",
  title: null,
  state: "OPEN",
  round: 1,
  reviewedVersion: 1,
  response: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getCase).mockResolvedValue(base);
  vi.mocked(api.caseCommand).mockResolvedValue(base);
  vi.mocked(api.listCases).mockResolvedValue([]);
  vi.mocked(api.notifications).mockResolvedValue([]);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [{ uploadId: "file", state: "COMPLETE" }],
      }),
  );
});
test("fresh declarations are required and submission uses a concurrency snapshot", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  render(<CasePanel id="case" role="OPERATOR" onChanged={changed} />);
  await screen.findByRole("button", { name: "Submit application" });
  expect(
    screen.getByRole("button", { name: "Submit application" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "I confirm this application is accurate.",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I am authorised to apply for this business.",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenCalledWith(
      base,
      "submit",
      { accuracy: true, authority: true },
      expect.any(String),
    ),
  );
  expect(changed).toHaveBeenCalled();
  expect(
    screen.getByRole("checkbox", {
      name: "I confirm this application is accurate.",
    }),
  ).not.toBeChecked();
});
test("unsaved fields block submission without sending a command", async () => {
  const user = userEvent.setup();
  render(
    <CasePanel
      id="case"
      role="OPERATOR"
      beforeCommand={() => {
        throw new Error("Save fields first");
      }}
    />,
  );
  await screen.findByRole("button", { name: "Submit application" });
  await user.click(
    screen.getByRole("checkbox", {
      name: "I confirm this application is accurate.",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I am authorised to apply for this business.",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  expect(await screen.findByText("Save fields first")).toBeVisible();
  expect(api.caseCommand).not.toHaveBeenCalled();
});
test("unknown command result safely retries identical key and body", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getCase).mockResolvedValue({
    ...base,
    status: "APPLICATION_RECEIVED",
    versions: [version],
    latestVersion: 1,
  });
  vi.mocked(api.caseCommand)
    .mockRejectedValueOnce(new Error("Network lost"))
    .mockResolvedValueOnce({ ...base, status: "UNDER_REVIEW" });
  render(<CasePanel id="case" role="OFFICER" />);
  await user.click(await screen.findByRole("button", { name: "Start review" }));
  await user.click(await screen.findByRole("button", { name: "Retry action" }));
  await waitFor(() => expect(api.caseCommand).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.caseCommand).mock.calls[0]).toEqual(
    vi.mocked(api.caseCommand).mock.calls[1],
  );
});
test("correction responses and resubmission remain separate and history is retained", async () => {
  const user = userEvent.setup();
  const detail = {
    ...base,
    status: "PENDING_PRE_SITE_RESUBMISSION" as const,
    latestVersion: 1,
    versions: [version],
    issues: [issue],
    events: [
      {
        id: "event",
        type: "publish-corrections",
        actor: "officer",
        versionNumber: 1,
        createdAt: "2026-10-04T00:00:00Z",
        detail: { reason: "Correct name" },
      },
    ],
  };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  vi.mocked(api.caseCommand).mockResolvedValue(detail);
  render(<CasePanel id="case" role="OPERATOR" />);
  await user.type(
    await screen.findByLabelText("Response to this request"),
    "Name corrected",
  );
  await user.click(screen.getByRole("button", { name: "Save response" }));
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenCalledWith(
      detail,
      "response",
      { issueId: "issue", response: "Name corrected" },
      expect.any(String),
    ),
  );
  expect(
    screen.getByRole("link", { name: "Go to requested field" }),
  ).toHaveAttribute("href", "#legalName");
  expect(screen.getByText("reason: Correct name")).toBeVisible();
  await user.click(
    screen.getByRole("checkbox", {
      name: "I confirm this application is accurate.",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I am authorised to apply for this business.",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Resubmit application" }),
  );
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "resubmit",
      { accuracy: true, authority: true },
      expect.any(String),
    ),
  );
});
test("officer confirms resolution, can reissue and publishes a fixed round", async () => {
  const user = userEvent.setup();
  const detail = {
    ...base,
    status: "UNDER_REVIEW" as const,
    latestVersion: 2,
    versions: [
      version,
      {
        ...version,
        number: 2,
        snapshot: { ...draft, legalName: "Corrected Cafe" },
      },
    ],
    issues: [
      { ...issue, state: "AWAITING_REVIEW" as const, response: "Corrected" },
    ],
  };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  vi.mocked(api.caseCommand).mockResolvedValue(detail);
  render(<CasePanel id="case" role="OFFICER" />);
  await user.click(
    await screen.findByRole("button", { name: "Confirm resolution" }),
  );
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "resolve",
      { issueId: "issue" },
      expect.any(String),
    ),
  );
  await user.type(
    screen.getByLabelText("Further correction explanation"),
    "Still incomplete",
  );
  await user.click(
    screen.getByRole("button", {
      name: "Request further correction next round",
    }),
  );
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "reissue",
      { issueId: "issue", text: "Still incomplete" },
      expect.any(String),
    ),
  );
  await user.selectOptions(screen.getByLabelText("Review result"), "CORRECTIONS");
  await user.click(
    screen.getByRole("button", { name: "Submit review result" }),
  );
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "publish-corrections",
      {},
      expect.any(String),
    ),
  );
  expect(screen.getByText("Legal name · Changed")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "registration.pdf" }),
  ).toHaveAttribute("href", "/api/cases/case/evidence/uploads/file");
  await user.selectOptions(
    screen.getByLabelText("View immutable submission"),
    "1",
  );
  expect(screen.queryByText("Legal name · Changed")).not.toBeInTheDocument();
});
test("officer creates additional evidence, deletes drafts, and records reasoned rejection", async () => {
  const user = userEvent.setup();
  const detail = {
    ...base,
    status: "UNDER_REVIEW" as const,
    latestVersion: 1,
    versions: [version],
    issues: [{ ...issue, state: "DRAFT" as const }],
  };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  vi.mocked(api.caseCommand).mockResolvedValue(detail);
  render(<CasePanel id="case" role="OFFICER" />);
  await user.click(await screen.findByText("Request additional evidence"));
  await user.type(
    screen.getByLabelText(/Additional evidence title/),
    "Consent",
  );
  await user.type(
    screen.getByLabelText("Correction explanation"),
    "Provide signed consent",
  );
  await user.click(screen.getByRole("button", { name: "Save review request" }));
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "save-issue",
      {
        kind: "ADDITIONAL",
        target: undefined,
        text: "Provide signed consent",
        title: "Consent",
      },
      expect.any(String),
    ),
  );
  await user.click(
    screen.getByRole("button", { name: "Remove unpublished request" }),
  );
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "delete-issue",
      { issueId: "issue" },
      expect.any(String),
    ),
  );
  await user.selectOptions(screen.getByLabelText("Review result"), "REJECTED");
  await user.type(
    screen.getByLabelText("Decision explanation (required)"),
    "Insufficient evidence",
  );
  await user.click(
    screen.getByRole("button", { name: "Submit review result" }),
  );
  expect(api.caseCommand).not.toHaveBeenCalledWith(
    detail,
    "decision",
    expect.anything(),
    expect.any(String),
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "This records a final decision and ends the application review.",
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Result: Reject",
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Explanation: Insufficient evidence",
  );
  await user.click(screen.getByRole("button", { name: "Confirm rejection" }));
  await waitFor(() =>
    expect(api.caseCommand).toHaveBeenLastCalledWith(
      detail,
      "decision",
      { outcome: "REJECTED", explanation: "Insufficient evidence" },
      expect.any(String),
    ),
  );
});
test("all statuses stay in the officer queue and filters preserve cases", async () => {
  const user = userEvent.setup();
  vi.mocked(api.listCases).mockResolvedValue(
    Object.keys({
      APPLICATION_RECEIVED: 1,
      UNDER_REVIEW: 1,
      PENDING_PRE_SITE_RESUBMISSION: 1,
      PRE_SITE_RESUBMITTED: 1,
      APPROVED: 1,
      REJECTED: 1,
    }).map((status, index) => ({
      id: String(index),
      revision: 1,
      status: status as api.Draft["status"],
      latestVersion: 1,
      legalName: `Cafe ${index}`,
      updatedAt: "2026-10-04T00:00:00Z",
    })),
  );
  const { rerender } = render(<OfficerCases navigationRequest={0} />);
  await screen.findByText("6 applications");
  await user.selectOptions(
    screen.getByLabelText("Application status"),
    "REJECTED",
  );
  expect(screen.getByText("1 applications")).toBeVisible();
  expect(screen.queryByText("Cafe 0")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Application status"), "ALL");
  await user.click(screen.getByRole("button", { name: /Cafe 0/ }));
  await screen.findByRole("button", { name: "All cases" });
  await user.click(screen.getByRole("button", { name: "All cases" }));
  await screen.findByText("6 applications");
  await user.click(screen.getByRole("button", { name: /Cafe 0/ }));
  await screen.findByRole("button", { name: "All cases" });
  rerender(<OfficerCases navigationRequest={1} />);
  await screen.findByText("6 applications");
  expect(screen.queryByRole("button", { name: "All cases" })).not.toBeInTheDocument();
  expect(statusLabel("APPLICATION_RECEIVED", "OPERATOR")).toBe("Submitted");
});
test("notifications persist and mark read through the API", async () => {
  const user = userEvent.setup();
  const notice = { id: "notice", applicationId: "case", message: "Under Review", createdAt: "2026-10-04T00:00:00Z", readAt: null };
  vi.mocked(api.notifications).mockResolvedValue([notice]);
  vi.mocked(api.readNotification).mockResolvedValue();
  render(<Notifications />);
  await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  vi.mocked(api.notifications).mockResolvedValue([{ ...notice, readAt: "2026-10-04T00:01:00Z" }]);
  await user.click(await screen.findByRole("button", { name: "Mark as read" }));
  await screen.findByText("Notifications · 0 unread");
  expect(api.readNotification).toHaveBeenCalledWith("notice");
  await user.click(screen.getByRole("button", { name: "Refresh notifications" }));
  expect(api.notifications).toHaveBeenCalledTimes(4);
});
test("read errors recover and stale actions require deliberate refresh", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getCase)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue({ ...base, status: "APPLICATION_RECEIVED" });
  vi.mocked(api.caseCommand).mockRejectedValue(new api.ApiError("Stale", 409));
  render(<CasePanel id="case" role="OFFICER" />);
  await user.click(
    await screen.findByRole("button", { name: "Retry application" }),
  );
  await user.click(await screen.findByRole("button", { name: "Start review" }));
  await screen.findByText("Stale");
  expect(
    screen.queryByRole("button", { name: "Retry action" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Refresh case history" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Stale")).not.toBeInTheDocument(),
  );
});

test("a stale officer cannot approve a newer unseen submission without refreshing", async () => {
  const user = userEvent.setup();
  const displayed: api.CaseDetail = {...base, status:"UNDER_REVIEW", latestVersion:1, versions:[version]};
  const newer: api.CaseDetail = {...displayed, revision:8, latestVersion:2, versions:[version,{...version, number:2, snapshot:{...draft, legalName:"New submission"}}]};
  vi.mocked(api.getCase).mockResolvedValueOnce(displayed).mockResolvedValue(newer);
  vi.mocked(api.caseCommand).mockResolvedValue({...newer,status:"APPROVED"});
  render(<CasePanel id="case" role="OFFICER"/>);
  await user.type(await screen.findByLabelText("Decision explanation (required)"),"Document review completed");
  await user.click(screen.getByRole("button",{name:"Submit review result"}));
  await user.click(screen.getByRole("button",{name:"Confirm approval"}));
  await screen.findByText("The saved case changed. Refresh and review the current submission before acting.");
  expect(api.caseCommand).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Under Review · Version 1" })).toBeVisible();
  expect(screen.queryByRole("button",{name:"Retry action"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Refresh case history"}));
  await screen.findByRole("heading", { name: "Under Review · Version 2" });
  await user.click(screen.getByRole("button",{name:"Submit review result"}));
  await user.click(screen.getByRole("button",{name:"Confirm approval"}));
  await waitFor(()=>expect(api.caseCommand).toHaveBeenCalledWith(newer,"decision",{outcome:"APPROVED",explanation:"Document review completed"},expect.any(String)));
});


test("officer feedback links reach retained field and document summaries", async () => {
  vi.mocked(api.getCase).mockResolvedValue({ ...base, status: "UNDER_REVIEW", latestVersion: 1, versions: [version], issues: [issue, { ...issue, id: "document-issue", kind: "DOCUMENT", target: "doc" }] });
  render(<CasePanel id="case" role="OFFICER" />);
  const field = await screen.findByRole("link", { name: "Go to requested field" });
  const document = screen.getByRole("link", { name: "Go to requested document" });
  expect(field).toHaveAttribute("href", "#submitted-legalName");
  expect(document).toHaveAttribute("href", "#submitted-documentRequest.doc");
  expect(window.document.getElementById("submitted-legalName")).toHaveTextContent("Cafe");
  expect(window.document.getElementById("submitted-documentRequest.doc")).toHaveTextContent("registration.pdf");
});


test("failed notification clearing keeps messages available and reports the error", async () => {
  const user = userEvent.setup();
  vi.mocked(api.notifications).mockResolvedValue([{ id: "notice", applicationId: "case", message: "Action required", createdAt: "2026-10-04T00:00:00Z", readAt: null }]);
  vi.mocked(api.clearNotifications).mockRejectedValue(new Error("Please retry"));
  render(<Notifications />);
  await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  await user.click(await screen.findByRole("button", { name: "Clear all" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
  expect(screen.getByText("Action required")).toBeVisible();
});

test("mark all as read targets only unread notifications", async () => {
  const user = userEvent.setup();
  const notice = { id: "unread", applicationId: "case", message: "Action required", createdAt: "2026-10-04T00:00:00Z", readAt: null };
  const read = { ...notice, id: "read", readAt: "2026-10-04T00:01:00Z" };
  vi.mocked(api.notifications).mockResolvedValue([notice, read]);
  render(<Notifications />);
  await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  vi.mocked(api.notifications).mockResolvedValue([{ ...notice, readAt: read.readAt }, read]);
  await user.click(await screen.findByRole("button", { name: "Mark all as read" }));
  await screen.findByText("Notifications · 0 unread");
  expect(api.readNotification).toHaveBeenCalledExactlyOnceWith("unread");
});


test("operator cannot submit a saved revision that has not been reviewed", async () => {
  const user = userEvent.setup();
  render(<CasePanel id="case" role="OPERATOR" />);
  await screen.findByRole("button", { name: "Submit application" });
  await user.click(screen.getByRole("checkbox", { name: "I confirm this application is accurate." }));
  await user.click(screen.getByRole("checkbox", { name: "I am authorised to apply for this business." }));
  vi.mocked(api.getCase).mockResolvedValue({ ...base, revision: 3 });
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh and review the current submission");
  expect(api.caseCommand).not.toHaveBeenCalled();
});

test("saved missing requirements prevent submission before fresh declarations", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getCase).mockResolvedValue({ ...base, working: { ...draft, completion: { completed: 1, required: 2, percentage: 50, unmetItemIds: ["legalName", "declaration.accuracy", "declaration.authority"] } } });
  render(<CasePanel id="case" role="OPERATOR" />);
  await screen.findByText("Complete the remaining requirements");
  await user.click(screen.getByRole("checkbox", { name: "I confirm this application is accurate." }));
  await user.click(screen.getByRole("checkbox", { name: "I am authorised to apply for this business." }));
  expect(screen.getByRole("button", { name: "Submit application" })).toBeDisabled();
  expect(api.caseCommand).not.toHaveBeenCalled();
});

test("operator response synchronizes the panel after a locally committed draft revision", async () => {
  const detail = { ...base, status: "PENDING_PRE_SITE_RESUBMISSION" as const, latestVersion: 1, versions: [version], issues: [issue] };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  const { rerender } = render(<CasePanel id="case" role="OPERATOR" workingRevision={2} />);
  await userEvent.type(await screen.findByLabelText("Response to this request"), "Correction completed");
  const saved = { ...detail, revision: 4, working: { ...draft, revision: 4, legalName: "Corrected Cafe" } };
  vi.mocked(api.getCase).mockResolvedValue(saved);
  vi.mocked(api.caseCommand).mockResolvedValue(saved);
  rerender(<CasePanel id="case" role="OPERATOR" workingRevision={4} />);
  await waitFor(() => expect(screen.getByRole("region", { name: "Review saved application" })).toHaveTextContent("Corrected Cafe"));
  await userEvent.click(screen.getByRole("button", { name: "Save response" }));
  await waitFor(() => expect(api.caseCommand).toHaveBeenCalledWith(saved, "response", { issueId: "issue", response: "Correction completed" }, expect.any(String)));
});


test("officer requests corrections beside the exact submitted field and file, then sends one result", async () => {
  const user = userEvent.setup();
  const detail: api.CaseDetail = { ...base, status: "UNDER_REVIEW", latestVersion: 1, versions: [version] };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  vi.mocked(api.caseCommand).mockResolvedValue(detail);
  render(<CasePanel id="case" role="OFFICER" />);
  const fieldButton = await screen.findByRole("button", { name: "Review Legal name" });
  expect(fieldButton.closest("#submitted-legalName")).toHaveTextContent("Cafe");
  expect(screen.queryByLabelText("Correction explanation for Legal name")).not.toBeInTheDocument();
  await user.click(fieldButton);
  expect(fieldButton).toHaveAttribute("aria-expanded", "true");
  await user.type(screen.getByLabelText("Correction explanation for Legal name"), "Use registered name");
  await user.click(within(fieldButton.parentElement!).getByRole("button", { name: "Save review request" }));
  await waitFor(() => expect(api.caseCommand).toHaveBeenLastCalledWith(detail, "save-issue", { kind: "FIELD", target: "legalName", text: "Use registered name", title: null }, expect.any(String)));
  const fileButton = screen.getByRole("button", { name: "Review BUSINESS REGISTRATION" });
  expect(fileButton.closest("li")).toHaveTextContent("registration.pdf");
  await user.click(fileButton);
  await user.type(screen.getByLabelText("Correction explanation for BUSINESS REGISTRATION"), "Upload legible copy");
  await user.click(within(fileButton.parentElement!).getByRole("button", { name: "Save review request" }));
  await waitFor(() => expect(api.caseCommand).toHaveBeenLastCalledWith(detail, "save-issue", { kind: "DOCUMENT", target: "doc", text: "Upload legible copy", title: null }, expect.any(String)));
  const submit = screen.getByRole("button", { name: "Submit review result" });
  expect(screen.getByRole("heading", { name: "Submitted versions" }).compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Review result"), "CORRECTIONS");
  expect(submit).toBeDisabled();
  expect(api.caseCommand).toHaveBeenCalledTimes(2);
});

test("historical submissions retain feedback without officer mutation controls", async () => {
  const user = userEvent.setup();
  const detail: api.CaseDetail = { ...base, status: "UNDER_REVIEW", latestVersion: 2, versions: [version, { ...version, number: 2 }], issues: [{ ...issue, state: "AWAITING_REVIEW" }, { ...issue, id: "extra", kind: "ADDITIONAL", target: "later-document", title: "Signed consent", text: "Provide consent", state: "AWAITING_REVIEW" }] };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  render(<CasePanel id="case" role="OFFICER" />);
  await screen.findAllByRole("button", { name: "Confirm resolution" });
  await user.selectOptions(screen.getByLabelText("View immutable submission"), "1");
  expect(screen.getByText("Correct legal name")).toBeVisible();
  expect(screen.getByText("Provide consent")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Confirm resolution" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Review BUSINESS REGISTRATION" })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("View immutable submission"), "2");
  expect(screen.getAllByRole("button", { name: "Confirm resolution" })).toHaveLength(2);
});


test("operator review places comments and response controls beside each saved field and document", async () => {
  const detail: api.CaseDetail = { ...base, status: "PENDING_PRE_SITE_RESUBMISSION", latestVersion: 1, versions: [version], working: { ...draft, legalName: "Saved corrected Cafe" }, issues: [issue, { ...issue, id: "document-issue", kind: "DOCUMENT", target: "doc", text: "Replace registration file" }] };
  vi.mocked(api.getCase).mockResolvedValue(detail);
  render(<CasePanel id="case" role="OPERATOR" />);
  const review = await screen.findByRole("region", { name: "Review saved application" });
  const fieldFeedback = within(review).getByLabelText("Officer feedback for Legal name");
  expect(fieldFeedback.parentElement).toHaveTextContent("Saved corrected Cafe");
  expect(within(fieldFeedback).getByText("Correct legal name")).toBeVisible();
  expect(within(fieldFeedback).getByLabelText("Response to this request")).toBeVisible();
  const fileFeedback = within(review).getByLabelText("Officer feedback for BUSINESS REGISTRATION");
  expect(fileFeedback.closest("li")).toHaveTextContent("registration.pdf");
  expect(within(fileFeedback).getByText("Replace registration file")).toBeVisible();
  expect(screen.getAllByText("Correct legal name")).toHaveLength(1);
  expect(screen.queryByRole("region", { name: "Officer feedback" })).not.toBeInTheDocument();
});
