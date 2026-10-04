import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
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
  renderReview,
  renderUnplaced,
}: {
  detail: api.CaseDetail;
  role: api.User["role"];
  renderReview?: (kind: "FIELD" | "DOCUMENT", target: string, label: string, current: boolean) => ReactNode;
  renderUnplaced?: (snapshot: api.Draft, current: boolean) => ReactNode;
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
      <div className="flex flex-col divide-y">
        {Object.entries(fieldLabels).map(([path, label]) => {
          const current = valueAt(version.snapshot, path);
          const previous = prior ? valueAt(prior.snapshot, path) : undefined;
          const changed =
            prior && JSON.stringify(current) !== JSON.stringify(previous);
          return (
            <div key={path} id={`submitted-${path}`} tabIndex={-1} className={`min-w-0 scroll-mt-36 py-4 text-sm ${renderReview ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
              <dl>
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
              </dl>
              {renderReview?.("FIELD", path, label, version.number === detail.latestVersion)}
            </div>
          );
        })}
      </div>
      <h4 className="font-medium">Retained submitted files</h4>
      <ul className="space-y-2">
        {version.snapshot.documentRequests?.map((request) => {
          const upload = request.currentUpload;
          const previous = prior?.snapshot.documentRequests?.find(
            (item) => item.id === request.id,
          )?.currentUpload;
          return (
            <li key={request.id} id={`submitted-documentRequest.${request.id}`} tabIndex={-1} className={`scroll-mt-36 border-t py-4 text-sm ${renderReview ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
              <div className="min-w-0">
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
              </div>
              {renderReview?.("DOCUMENT", request.id, display(request.type), version.number === detail.latestVersion)}
            </li>
          );
        })}
      </ul>
      {renderUnplaced?.(version.snapshot, version.number === detail.latestVersion)}
    </section>
  );
}

function TargetReview({ kind, target, label, disabled, onSave }: {
  kind: "FIELD" | "DOCUMENT";
  target: string;
  label: string;
  disabled: boolean;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const inputId = `correction-${kind}-${target}`;
  return <div className="space-y-3">
    <Button type="button" variant="outline" size="sm" aria-label={`Review ${label}`} aria-expanded={open} aria-controls={`${inputId}-form`} onClick={() => setOpen(!open)}>Review</Button>
    {open && <form id={`${inputId}-form`} className="space-y-3" onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void onSave({ kind, target, text: new FormData(event.currentTarget).get("text"), title: null });
    }}>
      <Label htmlFor={inputId}>Correction explanation for {label}</Label>
      <Textarea id={inputId} name="text" required maxLength={2000} />
      <p className="text-xs text-muted-foreground">Request a correction to this submitted {kind === "FIELD" ? "field" : "document"}.</p>
      <Button type="submit" size="sm" disabled={disabled}>Save review request</Button>
    </form>}
  </div>;
}

function SavedApplicationReview({ detail, renderReview, renderUnplaced }: { detail: api.CaseDetail; renderReview: (kind: "FIELD" | "DOCUMENT", target: string, label: string, current: boolean) => ReactNode; renderUnplaced: (snapshot: api.Draft, current: boolean) => ReactNode }) {
  const draft = detail.working;
  if (!draft) return null;
  return (
    <section className="flex flex-col gap-4" aria-label="Review saved application">
      <h3 className="font-semibold">Review saved application</h3>
      <p className="text-sm text-muted-foreground">These are your saved details and uploaded files. Review them, then confirm the declarations and submit. Saving a draft does not submit it.</p>
      <a href="#application-business" className="text-sm underline">Back to application details</a>
      <div className="flex flex-col divide-y">
        {Object.entries(fieldLabels).map(([path, label]) => <div key={path} className="grid min-w-0 gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl><dt className="font-medium">{label}</dt><dd className="break-words">{display(valueAt(draft, path))}</dd></dl>
          {renderReview("FIELD", path, label, true)}
        </div>)}
      </div>
      <h4 className="font-medium">Saved evidence</h4>
      <ul className="flex flex-col gap-3">
        {draft.documentRequests?.filter((item) => item.applicability === "APPLICABLE").map((item) => <li key={item.id} className="grid min-w-0 gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="min-w-0"><p>{display(item.type)}</p>{item.currentUpload ? <a className="break-words underline" href={`/api/applications/${detail.id}/evidence/uploads/${item.currentUpload.id}`} target="_blank" rel="noreferrer">{item.currentUpload.filename}</a> : <p className="text-status-warning">No saved file yet</p>}</div>{renderReview("DOCUMENT", item.id, display(item.type), true)}</li>)}
      </ul>
      {renderUnplaced(draft, true)}
    </section>
  );
}

export function CasePanel({
  id,
  role,
  beforeCommand,
  onChanged,
  onDetail,
  refreshRequest = 0,
  onActivityChange,
  workingRevision,
  submissionTarget,
  saveAction,
  submissionBlocked = false,
}: {
  id: string;
  role: api.User["role"];
  beforeCommand?: (latest: api.CaseDetail) => void;
  onChanged?: (detail: api.CaseDetail) => void;
  onDetail?: (detail: api.CaseDetail) => void;
  refreshRequest?: number;
  onActivityChange?: (active: boolean) => void;
  workingRevision?: number;
  submissionTarget?: HTMLElement | null;
  saveAction?: ReactNode;
  submissionBlocked?: boolean;
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
  const [outcome, setOutcome] = useState("APPROVED");
  const inFlight = useRef(false);
  const loadGeneration = useRef(0);
  const onDetailRef = useRef(onDetail);
  useEffect(() => {
    onDetailRef.current = onDetail;
  }, [onDetail]);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const current = await api.getCase(id);
      if (generation !== loadGeneration.current) return;
      setDetail(current);
      setAccuracy(false);
      setAuthority(false);
      onDetailRef.current?.(current);
      setError("");
    } catch (cause) {
      if (generation === loadGeneration.current) setError((cause as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, refreshRequest]);
  const synchronizeWorking = useEffectEvent(() => {
    if (detail && workingRevision !== undefined && detail.revision !== workingRevision) void load();
  });
  useEffect(() => {
    void Promise.resolve().then(() => synchronizeWorking());
  }, [workingRevision, detail?.revision]);
  useEffect(() => {
    void Promise.resolve().then(() => onActivityChange?.(busy || !!pending));
  }, [busy, pending, onActivityChange]);
  async function command(
    name: string,
    fields: Record<string, unknown>,
    retry = false,
  ) {
    if (!detail || inFlight.current || (workingRevision !== undefined && detail.revision !== workingRevision)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let request = retry ? pending : null;
    try {
      if (!request) {
        const base = await api.getCase(id);
        if ((
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
      loadGeneration.current++;
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
  if (!detail)
    return (
      <>
      <section id="application-workflow" tabIndex={-1} className="space-y-3">
        <p role="status">{error || "Loading application…"}</p>
        <Button type="button" variant="outline" onClick={load}>
          Retry application
        </Button>
      </section>
      {submissionTarget && createPortal(saveAction, submissionTarget)}
      </>
    );
  const operatorRound =
    role === "OPERATOR" && detail.status === "PENDING_PRE_SITE_RESUBMISSION";
  const reviewing = role === "OFFICER" && detail.status === "UNDER_REVIEW";
  const unmetSavedItems = detail.working?.completion?.unmetItemIds.filter((item) => !item.startsWith("declaration.")) ?? [];
  const synchronizing = workingRevision !== undefined && detail.revision !== workingRevision;
  const disabled = busy || synchronizing || !!pending;
  const renderIssue = (item: api.CaseIssue, actionable = true) => (
    <div
      key={item.id}
      className="space-y-3 border-t py-4 text-sm"
    >
      <p className="font-medium">
        Round {item.round} · <Badge variant={item.state === "RESOLVED" ? "success" : item.state === "OPEN" ? "warning" : item.state === "AWAITING_REVIEW" ? "info" : "secondary"}>{display(item.state)}</Badge> ·{" "}
        {fieldLabels[item.target ?? ""] ??
          item.title ??
          display(item.kind)}
      </p>
      <p className="break-words">{item.text}</p>
      {item.target && (
        <a
          className="underline"
          href={`#${role === "OFFICER" ? "submitted-" : ""}${item.kind === "FIELD" ? item.target : `documentRequest.${item.target}`}`}
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
          <Textarea
            id={`response-${item.id}`}
            name="response"
            required
            maxLength={2000}
            defaultValue={item.response ?? ""}
          />
          <Button type="submit" size="sm" disabled={busy || synchronizing || !!pending}>
            Save response
          </Button>
        </form>
      )}
      {reviewing && actionable && item.state === "DRAFT" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || synchronizing || !!pending}
          onClick={() => command("delete-issue", { issueId: item.id })}
        >
          Remove unpublished request
        </Button>
      )}
      {reviewing && actionable && item.state === "AWAITING_REVIEW" && (
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
          <Textarea
            id={`reissue-${item.id}`}
            name="text"
            required
            maxLength={2000}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={busy || synchronizing || !!pending}
          >
            Request further correction next round
          </Button>
        </form>
      )}
      {reviewing && actionable && item.state === "AWAITING_REVIEW" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || synchronizing || !!pending}
          onClick={() => command("resolve", { issueId: item.id })}
        >
          Confirm resolution
        </Button>
      )}
    </div>
  );
  const renderReview = (kind: "FIELD" | "DOCUMENT", target: string, label: string, current: boolean) => {
    const requests = detail.issues.filter((item) => (item.kind === kind || (kind === "DOCUMENT" && item.kind === "ADDITIONAL")) && item.target === target);
    if (!requests.length && !reviewing) return null;
    return <section className="min-w-0 space-y-3 sm:pl-4" aria-label={`Officer feedback for ${label}`}>
      {requests.map((item) => renderIssue(item, current))}
      {reviewing && current && !requests.some((item) => item.state === "DRAFT" || item.state === "AWAITING_REVIEW") && <TargetReview kind={kind} target={target} label={label} disabled={disabled} onSave={(fields) => command("save-issue", fields)} />}
      {reviewing && !current && <p className="text-sm text-muted-foreground">Select the latest version to request a correction.</p>}
    </section>;
  };
  const savedReview = role === "OPERATOR" && (detail.status === "DRAFT" || operatorRound);
  const renderUnplaced = (snapshot: api.Draft, current: boolean) => {
    const issues = detail.issues.filter((item) => item.kind !== "FIELD" && !snapshot.documentRequests?.some((request) => request.id === item.target));
    return !!issues.length && <section className="space-y-3" aria-label="Other officer feedback">
      <h3 className="font-medium">Additional review requests</h3>
      {issues.map((item) => renderIssue(item, current))}
    </section>;
  };
  const submission = role === "OPERATOR" && (detail.status === "DRAFT" || operatorRound) ? (
    <section className="space-y-3 border-t pt-6" aria-label="Submission declarations">
      <h3 className="font-medium">{operatorRound ? "Resubmit corrections" : "Submit application"}</h3>
      <p className="text-sm text-muted-foreground">Save changes and finish uploads first. <a className="underline" href="#application-workflow">Review saved details</a>, then confirm both declarations afresh.</p>
      {!!unmetSavedItems.length && <Alert><AlertTitle>Complete the remaining requirements</AlertTitle><AlertDescription>{unmetSavedItems.length} required item(s) are missing from your saved application. Complete the details or upload required evidence, then save.</AlertDescription></Alert>}
      <div className="flex items-center gap-2"><Checkbox id="accuracy" checked={accuracy} onCheckedChange={(value) => setAccuracy(value === true)} /><Label htmlFor="accuracy">I confirm this application is accurate.</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="authority" checked={authority} onCheckedChange={(value) => setAuthority(value === true)} /><Label htmlFor="authority">I am authorised to apply for this business.</Label></div>
      <div className="flex gap-3" aria-label="Save and submit actions">
        {saveAction}
        <Button type="button" disabled={busy || synchronizing || submissionBlocked || !!pending || !accuracy || !authority || !!unmetSavedItems.length} onClick={() => command(operatorRound ? "resubmit" : "submit", { accuracy, authority })}>{operatorRound ? "Resubmit application" : "Submit application"}</Button>
      </div>
    </section>
  ) : saveAction;
  return (
    <section id="application-workflow" tabIndex={-1} className="scroll-mt-36 space-y-6" aria-label="Application workflow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          <StatusBadge status={detail.status}>{statusLabel(detail.status, role)}</StatusBadge> <span className="ml-2 text-sm text-muted-foreground">{detail.status === "DRAFT" ? `Saved revision ${detail.revision}` : `· Version ${detail.latestVersion}`}</span>
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
      {savedReview && <SavedApplicationReview detail={detail} renderReview={renderReview} renderUnplaced={renderUnplaced} />}
      {role === "OPERATOR" && ["APPLICATION_RECEIVED", "PRE_SITE_RESUBMITTED"].includes(detail.status) && <Alert><AlertTitle>{detail.status === "APPLICATION_RECEIVED" ? "Application submitted" : "Corrections resubmitted"}</AlertTitle><AlertDescription>Your submission has been received. There is nothing more to submit now; an officer will review it. Check this application or the notification bell for updates.</AlertDescription></Alert>}
      {submissionTarget ? createPortal(submission, submissionTarget) : submission}
      {role === "OFFICER" &&
        ["APPLICATION_RECEIVED", "PRE_SITE_RESUBMITTED"].includes(
          detail.status,
        ) && (
          <Button
            type="button"
            disabled={busy || synchronizing || !!pending}
            onClick={() => command("start-review", {})}
          >
            Start review
          </Button>
        )}
      {detail.status !== "DRAFT" && <Snapshot detail={detail} role={role} renderReview={!savedReview ? renderReview : undefined} renderUnplaced={!savedReview ? renderUnplaced : undefined} />}
      {reviewing && (
        <section className="space-y-4 border-t pt-6" aria-label="Complete officer review">
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-medium">Request additional evidence</summary>
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void command("save-issue", { kind: "ADDITIONAL", target: undefined, title: data.get("title"), text: data.get("text") });
            }}>
              <Label htmlFor="issue-title">Additional evidence title</Label>
              <Input id="issue-title" name="title" required maxLength={200} />
              <Label htmlFor="issue-text">Correction explanation</Label>
              <Textarea id="issue-text" name="text" required maxLength={2000} />
              <Button type="submit" disabled={disabled}>Save review request</Button>
            </form>
          </details>
          <h3 className="font-medium">Submit review result</h3>
          <p className="text-sm text-muted-foreground">Review the fields and files above, then submit one result. Saved requests are unpublished until you send the fixed correction round.</p>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void command(outcome === "CORRECTIONS" ? "publish-corrections" : "decision", outcome === "CORRECTIONS" ? {} : { outcome, explanation: data.get("explanation") });
          }}>
            <Label htmlFor="outcome">Review result</Label>
            <NativeSelect id="outcome" name="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              <NativeSelectOption value="CORRECTIONS">Request corrections</NativeSelectOption>
              <NativeSelectOption value="APPROVED">Approve</NativeSelectOption>
              <NativeSelectOption value="REJECTED">Reject</NativeSelectOption>
            </NativeSelect>
            {outcome === "CORRECTIONS" ? <p className="text-sm text-muted-foreground">Publish all saved requests together. The issued set stays fixed until the operator resubmits.</p> : <>
              <Label htmlFor="decision-explanation">Decision explanation (required)</Label>
              <Textarea id="decision-explanation" name="explanation" required maxLength={2000} />
            </>}
            <Button type="submit" disabled={disabled || (outcome === "CORRECTIONS" && !detail.issues.some((item) => item.state === "DRAFT" || item.state === "AWAITING_REVIEW"))}>Submit review result</Button>
          </form>
        </section>
      )}
      <section className="space-y-3" aria-label="Application history">
        <h3 className="font-medium">Application history</h3>
        <ol className="space-y-2">
          {detail.events.map((event) => (
            <li
              key={event.id}
              className="break-words border-l-2 py-3 pl-4 text-sm"
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

export function OfficerCases({ navigationRequest = 0 }: { navigationRequest?: number } = {}) {
  const [cases, setCases] = useState<api.CaseSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
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
  const seenNavigation = useRef(navigationRequest);
  useEffect(() => {
    if (seenNavigation.current === navigationRequest) return;
    seenNavigation.current = navigationRequest;
    void Promise.resolve().then(() => { if (workflowBusy) { setError("Finish or retry the current action before returning to the queue."); return; } setSelected(null); return load(); });
  }, [navigationRequest, load, workflowBusy]);
  if (selected)
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          disabled={workflowBusy}
          onClick={() => {
            setSelected(null);
            void load();
          }}
        >
          All cases
        </Button>
        {error && <p role="alert">{error}</p>}
        <CasePanel id={selected} role="OFFICER" onActivityChange={setWorkflowBusy} />
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
                className="h-auto w-full flex-col items-start justify-between gap-3 whitespace-normal px-4 py-4 text-left sm:flex-row sm:items-center"
                onClick={() => setSelected(item.id)}
              >
                <span className="min-w-0 break-words">
                  {item.legalName ?? "Untitled application"}
                </span>
                <span>
                  <StatusBadge status={item.status}>{statusLabel(item.status, "OFFICER")}</StatusBadge> <span className="text-xs text-muted-foreground">Version {item.latestVersion}</span>
                </span>
              </Button>
            </li>
          ))}
      </ul>
    </section>
  );
}
export { Notifications } from "@/Notifications";
