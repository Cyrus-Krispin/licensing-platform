import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import * as api from "@/lib/api";

export const labels: Record<api.Draft["status"], string> = {
  DRAFT: "Draft",
  APPLICATION_RECEIVED: "Application Received",
  UNDER_REVIEW: "Under Review",
  PENDING_PRE_SITE_RESUBMISSION: "Pending Pre-Site Resubmission",
  PRE_SITE_RESUBMITTED: "Pre-Site Resubmitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
export function statusLabel(
  status: api.Draft["status"],
  role: api.User["role"],
) {
  return status === "APPLICATION_RECEIVED" && role === "OPERATOR"
    ? "Submitted"
    : labels[status];
}
const fieldLabels: Record<string, string> = {
  legalName: "Legal name",
  tradingName: "Trading name",
  registrationNumber: "Registration number",
  structure: "Business structure",
  applicantName: "Applicant name",
  applicantRole: "Applicant role",
  applicantEmail: "Contact email",
  applicantPhone: "Phone",
  premisesAddress: "Premises address",
  premisesName: "Premises name",
  unitApplicable: "Unit applicable",
  unitNumber: "Unit number",
  tenure: "Tenure",
  businessType: "Business type",
  proposedOpeningDate: "Proposed opening date",
  preparationActivities: "Preparation activities",
  serviceModes: "Service modes",
  ...Object.fromEntries(
    [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ].map((day) => [
      `operatingHours.${day}`,
      `${day[0]}${day.slice(1).toLowerCase()} hours`,
    ]),
  ),
};
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(display).join(", ") || "None";
  if (typeof value === "object") {
    const hours = value as {
      closed?: boolean;
      opens?: string;
      closes?: string;
      closesNextDay?: boolean;
    };
    return hours.closed
      ? "Closed"
      : `${hours.opens ?? "Not set"}–${hours.closes ?? "Not set"}${hours.closesNextDay ? " next day" : ""}`;
  }
  return String(value).split("_").join(" ");
}
function valueAt(snapshot: api.Draft, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown> | undefined)?.[part],
      snapshot,
    );
}
function Snapshot({
  detail,
  role,
}: {
  detail: api.CaseDetail;
  role: api.User["role"];
}) {
  const [number, setNumber] = useState(0);
  const version =
    detail.versions.find((item) => item.number === number) ??
    detail.versions.at(-1);
  const prior = detail.versions.find(
    (item) => item.number === (version?.number ?? 0) - 1,
  );
  const [checks, setChecks] = useState<api.ProcessingStatus[]>([]);
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/cases/${detail.id}/checks`);
        if (response.ok && !stopped) setChecks(await response.json());
      } catch {
        /* A retained snapshot remains usable when polling is unavailable. */
      }
      if (!stopped) timer = window.setTimeout(poll, 2000);
    };
    if (detail.versions.length) void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [detail.id, detail.versions.length]);
  if (!version)
    return <p>No submissions yet. Save the draft before submitting.</p>;
  return (
    <section className="space-y-4" aria-labelledby="snapshot-heading">
      <h3 id="snapshot-heading" className="font-medium">
        Submitted versions
      </h3>
      <Label htmlFor="version-select">View immutable submission</Label>
      <NativeSelect
        id="version-select"
        value={version.number}
        onChange={(event) => setNumber(Number(event.target.value))}
      >
        {detail.versions.map((item) => (
          <NativeSelectOption key={item.number} value={item.number}>
            Version {item.number}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-sm text-muted-foreground">
        Version {version.number} · {version.submittedBy} ·{" "}
        {new Date(version.submittedAt).toLocaleString()} · Accuracy and
        authority confirmed
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {Object.entries(fieldLabels).map(([path, label]) => {
          const current = valueAt(version.snapshot, path);
          const previous = prior ? valueAt(prior.snapshot, path) : undefined;
          const changed =
            prior && JSON.stringify(current) !== JSON.stringify(previous);
          return (
            <div key={path} className="min-w-0 rounded-md border p-3 text-sm">
              <dt className="font-medium">
                {label}
                {changed ? " · Changed" : ""}
              </dt>
              <dd className="break-words">{display(current)}</dd>
              {changed && (
                <dd className="text-muted-foreground">
                  Previous: {display(previous)}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      <h4 className="font-medium">Retained submitted files</h4>
      <ul className="space-y-2">
        {version.snapshot.documentRequests?.map((request) => {
          const upload = request.currentUpload;
          const previous = prior?.snapshot.documentRequests?.find(
            (item) => item.id === request.id,
          )?.currentUpload;
          return (
            <li key={request.id} className="rounded-md border p-3 text-sm">
              <p>
                {display(request.type)} ·{" "}
                {request.applicability === "APPLICABLE"
                  ? "Required"
                  : display(request.applicability)}
              </p>
              {upload ? (
                <>
                  <a
                    className="break-all underline"
                    href={`/api/${role === "OFFICER" ? "cases" : "applications"}/${detail.id}/evidence/uploads/${upload.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {upload.filename}
                  </a>
                  {prior && previous?.id !== upload.id && (
                    <p>File changed since version {prior.number}</p>
                  )}
                  <p className="text-muted-foreground">
                    Simulated document check:{" "}
                    {checks.find((item) => item.uploadId === upload.id)
                      ?.state ?? "Status unavailable"}
                    . Completion does not establish validity.
                  </p>
                </>
              ) : (
                <p>No file in this version</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CasePanel({
  id,
  role,
  beforeCommand,
  onChanged,
  onDetail,
}: {
  id: string;
  role: api.User["role"];
  beforeCommand?: (latest: api.CaseDetail) => void;
  onChanged?: (detail: api.CaseDetail) => void;
  onDetail?: (detail: api.CaseDetail) => void;
}) {
  const [detail, setDetail] = useState<api.CaseDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    command: string;
    fields: Record<string, unknown>;
    key: string;
    base: api.CaseDetail;
  } | null>(null);
  const [accuracy, setAccuracy] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [message, setMessage] = useState("");
  const [issueKind, setIssueKind] = useState("FIELD");
  const inFlight = useRef(false);
  const onDetailRef = useRef(onDetail);
  useEffect(() => {
    onDetailRef.current = onDetail;
  }, [onDetail]);
  const load = useCallback(async () => {
    try {
      const current = await api.getCase(id);
      setDetail(current);
      onDetailRef.current?.(current);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function command(
    name: string,
    fields: Record<string, unknown>,
    retry = false,
  ) {
    if (!detail || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let request = retry ? pending : null;
    try {
      if (!request) {
        const base = await api.getCase(id);
        if (role === "OFFICER" && (
          base.revision !== detail.revision ||
          base.latestVersion !== detail.latestVersion ||
          base.status !== detail.status
        )) {
          throw new api.ApiError("The saved case changed. Refresh and review the current submission before acting.", 409);
        }
        beforeCommand?.(base);
        request = { command: name, fields, key: crypto.randomUUID(), base };
      }
      setPending(request);
      const result = await api.caseCommand(
        request.base,
        request.command,
        request.fields,
        request.key,
      );
      setDetail(result);
      setPending(null);
      setAccuracy(false);
      setAuthority(false);
      onDetailRef.current?.(result);
      onChanged?.(result);
      setMessage("Action saved. History and status updated.");
    } catch (cause) {
      const failure = cause as api.ApiError;
      setError(
        `${failure.message}${Object.values(failure.fieldErrors ?? {}).length ? ` · ${Object.values(failure.fieldErrors).join(" · ")}` : ""}`,
      );
      if (failure.status && failure.status < 500) {
        setPending(null);
        if (failure.status === 409)
          setMessage(
            "The saved case changed. Refresh and review it before acting again.",
          );
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const kind = String(data.get("kind"));
    void command("save-issue", {
      kind,
      target: kind === "ADDITIONAL" ? undefined : data.get("target"),
      text: data.get("text"),
      title: data.get("title"),
    });
  }
  if (!detail)
    return (
      <section className="space-y-3">
        <p role="status">{error || "Loading application…"}</p>
        <Button type="button" variant="outline" onClick={load}>
          Retry application
        </Button>
      </section>
    );
  const operatorRound =
    role === "OPERATOR" && detail.status === "PENDING_PRE_SITE_RESUBMISSION";
  const reviewing = role === "OFFICER" && detail.status === "UNDER_REVIEW";
  const latest = detail.versions.at(-1)?.snapshot;
  return (
    <section className="space-y-6" aria-label="Application workflow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {statusLabel(detail.status, role)} · Version {detail.latestVersion}
        </h2>
        <Button type="button" variant="outline" disabled={busy} onClick={load}>
          Refresh case history
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Action could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {pending && (
        <Alert>
          <AlertTitle>Result unknown</AlertTitle>
          <AlertDescription>
            <p>Retry the same action safely before starting another action.</p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => command(pending.command, pending.fields, true)}
            >
              Retry action
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      {!!detail.issues.length && (
        <section className="space-y-3" aria-label="Officer feedback">
          <h3 className="font-medium">
            Officer feedback · fixed correction rounds
          </h3>
          {detail.issues.map((item) => (
            <div
              key={item.id}
              className="space-y-2 rounded-md border p-4 text-sm"
            >
              <p className="font-medium">
                Round {item.round} · {item.state} ·{" "}
                {fieldLabels[item.target ?? ""] ??
                  item.title ??
                  display(item.kind)}
              </p>
              <p className="break-words">{item.text}</p>
              {item.target && (
                <a
                  className="underline"
                  href={`#${item.kind === "FIELD" ? item.target : `documentRequest.${item.target}`}`}
                >
                  Go to requested {item.kind === "FIELD" ? "field" : "document"}
                </a>
              )}
              {item.response && (
                <p className="break-words">
                  Operator response: {item.response}
                </p>
              )}
              {operatorRound && item.state === "OPEN" && (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void command("response", {
                      issueId: item.id,
                      response: new FormData(event.currentTarget).get(
                        "response",
                      ),
                    });
                  }}
                >
                  <Label htmlFor={`response-${item.id}`}>
                    Response to this request
                  </Label>
                  <Input
                    id={`response-${item.id}`}
                    name="response"
                    required
                    maxLength={2000}
                    defaultValue={item.response ?? ""}
                  />
                  <Button type="submit" size="sm" disabled={busy || !!pending}>
                    Save response
                  </Button>
                </form>
              )}
              {reviewing && item.state === "DRAFT" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !!pending}
                  onClick={() => command("delete-issue", { issueId: item.id })}
                >
                  Remove unpublished request
                </Button>
              )}
              {reviewing && item.state === "AWAITING_REVIEW" && (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void command("reissue", {
                      issueId: item.id,
                      text: new FormData(event.currentTarget).get("text"),
                    });
                  }}
                >
                  <Label htmlFor={`reissue-${item.id}`}>
                    Further correction explanation
                  </Label>
                  <Input
                    id={`reissue-${item.id}`}
                    name="text"
                    required
                    maxLength={2000}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={busy || !!pending}
                  >
                    Request further correction next round
                  </Button>
                </form>
              )}
              {reviewing && item.state === "AWAITING_REVIEW" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !!pending}
                  onClick={() => command("resolve", { issueId: item.id })}
                >
                  Confirm resolution
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      {role === "OPERATOR" && (detail.status === "DRAFT" || operatorRound) && (
        <section
          className="space-y-3 rounded-md border p-4"
          aria-label="Submission declarations"
        >
          <h3 className="font-medium">
            {operatorRound ? "Resubmit corrections" : "Submit application"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Save your field changes and finish uploads first. Confirm both
            declarations afresh for this submission.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="accuracy"
              checked={accuracy}
              onCheckedChange={(value) => setAccuracy(value === true)}
            />
            <Label htmlFor="accuracy">
              I confirm this application is accurate.
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="authority"
              checked={authority}
              onCheckedChange={(value) => setAuthority(value === true)}
            />
            <Label htmlFor="authority">
              I am authorised to apply for this business.
            </Label>
          </div>
          <Button
            type="button"
            disabled={busy || !!pending || !accuracy || !authority}
            onClick={() =>
              command(operatorRound ? "resubmit" : "submit", {
                accuracy,
                authority,
              })
            }
          >
            {operatorRound ? "Resubmit application" : "Submit application"}
          </Button>
        </section>
      )}
      {role === "OFFICER" &&
        ["APPLICATION_RECEIVED", "PRE_SITE_RESUBMITTED"].includes(
          detail.status,
        ) && (
          <Button
            type="button"
            disabled={busy || !!pending}
            onClick={() => command("start-review", {})}
          >
            Start review
          </Button>
        )}
      {reviewing && (
        <section className="space-y-4" aria-label="Review actions">
          <h3 className="font-medium">Review actions</h3>
          <form className="space-y-3 rounded-md border p-4" onSubmit={issue}>
            <Label htmlFor="issue-kind">Correction kind</Label>
            <NativeSelect
              id="issue-kind"
              name="kind"
              value={issueKind}
              onChange={(event) => setIssueKind(event.target.value)}
            >
              <NativeSelectOption value="FIELD">
                Field correction
              </NativeSelectOption>
              <NativeSelectOption value="DOCUMENT">
                Document correction
              </NativeSelectOption>
              <NativeSelectOption value="ADDITIONAL">
                Additional evidence
              </NativeSelectOption>
            </NativeSelect>
            <Label htmlFor="issue-target">Requested field or document</Label>
            <NativeSelect
              id="issue-target"
              name="target"
              key={issueKind}
              disabled={issueKind === "ADDITIONAL"}
            >
              {issueKind === "FIELD" &&
                Object.entries(fieldLabels).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              {issueKind === "DOCUMENT" &&
                latest?.documentRequests?.map((request) => (
                  <NativeSelectOption key={request.id} value={request.id}>
                    {display(request.type)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            <Label htmlFor="issue-title">
              Additional evidence title (required for additional evidence)
            </Label>
            <Input id="issue-title" name="title" maxLength={200} />
            <Label htmlFor="issue-text">Correction explanation</Label>
            <Input id="issue-text" name="text" required maxLength={2000} />
            <Button type="submit" disabled={busy || !!pending}>
              Save review request
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            Publish all requests together. The issued set stays fixed until the
            operator resubmits.
          </p>
          <Button
            type="button"
            disabled={
              busy ||
              !!pending ||
              !detail.issues.some(
                (item) =>
                  item.state === "DRAFT" || item.state === "AWAITING_REVIEW",
              )
            }
            onClick={() => command("publish-corrections", {})}
          >
            Publish fixed correction round
          </Button>
          <form
            className="space-y-3 rounded-md border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void command("decision", {
                outcome: data.get("outcome"),
                explanation: data.get("explanation"),
              });
            }}
          >
            <Label htmlFor="outcome">Final decision</Label>
            <NativeSelect id="outcome" name="outcome">
              <NativeSelectOption value="APPROVED">Approve</NativeSelectOption>
              <NativeSelectOption value="REJECTED">Reject</NativeSelectOption>
            </NativeSelect>
            <Label htmlFor="decision-explanation">
              Decision explanation (required)
            </Label>
            <Input
              id="decision-explanation"
              name="explanation"
              required
              maxLength={2000}
            />
            <Button type="submit" disabled={busy || !!pending}>
              Record final decision
            </Button>
          </form>
        </section>
      )}
      <Snapshot detail={detail} role={role} />
      <section className="space-y-3" aria-label="Application history">
        <h3 className="font-medium">Application history</h3>
        <ol className="space-y-2">
          {detail.events.map((event) => (
            <li
              key={event.id}
              className="break-words rounded-md border p-3 text-sm"
            >
              <p className="font-medium">
                {display(event.type)} · {event.actor} · Version{" "}
                {event.versionNumber}
              </p>
              <p>
                {Object.entries(event.detail)
                  .map(
                    ([key, value]) =>
                      `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
                  )
                  .join(" · ")}
              </p>
              <p className="text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

export function OfficerCases() {
  const [cases, setCases] = useState<api.CaseSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setCases(await api.listCases());
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  if (selected)
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => {
            setSelected(null);
            void load();
          }}
        >
          All cases
        </Button>
        <CasePanel id={selected} role="OFFICER" />
      </div>
    );
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Received applications</h2>
      <Label htmlFor="case-filter">Application status</Label>
      <NativeSelect
        id="case-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        <NativeSelectOption value="ALL">All statuses</NativeSelectOption>
        {Object.entries(labels)
          .filter(([key]) => key !== "DRAFT")
          .map(([key, label]) => (
            <NativeSelectOption key={key} value={key}>
              {label}
            </NativeSelectOption>
          ))}
      </NativeSelect>
      <Button variant="outline" onClick={load}>
        Refresh queue
      </Button>
      {error && <p role="alert">{error}</p>}
      <p className="text-sm text-muted-foreground">
        {
          cases.filter((item) => filter === "ALL" || item.status === filter)
            .length
        }{" "}
        applications
      </p>
      <ul className="space-y-2">
        {cases
          .filter((item) => filter === "ALL" || item.status === filter)
          .map((item) => (
            <li key={item.id}>
              <Button
                variant="outline"
                className="h-auto w-full justify-between gap-3 whitespace-normal text-left"
                onClick={() => setSelected(item.id)}
              >
                <span className="min-w-0 break-words">
                  {item.legalName ?? "Untitled application"}
                </span>
                <span>
                  {statusLabel(item.status, "OFFICER")} · Version{" "}
                  {item.latestVersion}
                </span>
              </Button>
            </li>
          ))}
      </ul>
    </section>
  );
}
export function Notifications() {
  const [items, setItems] = useState<api.Notification[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setItems(await api.notifications());
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <section className="space-y-3 border-t pt-4" aria-label="Notifications">
      <h2 className="font-semibold">
        Notifications · {items.filter((item) => !item.readAt).length} unread
      </h2>
      <Button variant="outline" onClick={load}>
        Refresh notifications
      </Button>
      {error && <p role="alert">{error}</p>}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border p-3 text-sm">
            <p>{item.message}</p>
            <p className="text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()} ·{" "}
              {item.readAt ? "Read" : "Unread"}
            </p>
            {!item.readAt && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api.readNotification(item.id);
                    await load();
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              >
                Mark as read
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
