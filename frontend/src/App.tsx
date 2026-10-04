import { FormEvent, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/StatusBadge";
import { EvidenceUpload } from "@/EvidenceUpload";
import { WorkspaceShell } from "@/WorkspaceShell";
import {
  CasePanel,
  OfficerCases,
  statusLabel,
} from "@/Workflow";

const fieldNames = [
  "legalName",
  "tradingName",
  "registrationNumber",
  "structure",
  "applicantName",
  "applicantRole",
  "applicantEmail",
  "applicantPhone",
  "premisesAddress",
  "premisesName",
  "unitApplicable",
  "unitNumber",
  "tenure",
  "businessType",
  "proposedOpeningDate",
] as const;
type DraftField = (typeof fieldNames)[number];
type DraftValues = Record<DraftField, string | boolean | null>;
type PatchFields = Record<string, unknown>;
type DayHours = NonNullable<api.Draft["operatingHours"]>[string];

const fieldLabels: Record<DraftField, string> = {
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
  unitApplicable: "Does the premises have a unit number?",
  unitNumber: "Unit number",
  tenure: "Tenure",
  businessType: "Business type",
  proposedOpeningDate: "Proposed opening date",
};

const activities = [
  "BEVERAGE_PREPARATION",
  "COOKING",
  "BAKING",
  "REHEATING",
  "COLD_FOOD_PREPARATION",
  "PREPACKAGED_FOOD_SALE",
];
const modes = ["DINE_IN", "TAKEAWAY", "DELIVERY"];
const days = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value].sort();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.closed === true) return { closed: true };
    return Object.fromEntries(
      Object.entries(record)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value ?? null;
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function dayState(value: DayHours | undefined) {
  if (!value) return "NOT_SET";
  return value.closed ? "CLOSED" : "OPEN";
}

function operationValues(data: FormData): PatchFields {
  return {
    preparationActivities: data
      .getAll("preparationActivities")
      .map(String)
      .sort(),
    serviceModes: data.getAll("serviceModes").map(String).sort(),
    operatingHours: Object.fromEntries(
      [...days].sort().flatMap((day) => {
        const state = String(data.get(`${day}.state`) ?? "NOT_SET");
        if (state === "NOT_SET") return [];
        const hours =
          state === "CLOSED"
            ? { closed: true }
            : {
                closed: false,
                opens: String(data.get(`${day}.opens`) ?? ""),
                closes: String(data.get(`${day}.closes`) ?? ""),
                closesNextDay: data.get(`${day}.closesNextDay`) === "true",
              };
        return [[day, hours]];
      }),
    ),
  };
}

function mergeConflictEdits(
  base: api.Draft,
  latest: api.Draft,
  edits: PatchFields,
): api.Draft {
  const merged = { ...latest, ...edits } as api.Draft;
  (["preparationActivities", "serviceModes"] as const).forEach((field) => {
    if (!edits[field]) return;
    const original = new Set(base[field] ?? []);
    const local = new Set(edits[field] as string[]);
    const result = new Set(latest[field] ?? []);
    local.forEach((item) => {
      if (!original.has(item)) result.add(item);
    });
    original.forEach((item) => {
      if (!local.has(item)) result.delete(item);
    });
    merged[field] = [...result].sort();
  });
  if (edits.operatingHours) {
    const local = edits.operatingHours as Record<string, DayHours>;
    const baseHours = base.operatingHours ?? {};
    const hours = { ...(latest.operatingHours ?? {}) };
    new Set([...Object.keys(baseHours), ...Object.keys(local)]).forEach(
      (day) => {
        const baseDay = baseHours[day];
        const localDay = local[day];
        const latestDay = hours[day];
        const original = canonicalValue(baseHours[day]) as Record<
          string,
          unknown
        > | null;
        const changed = canonicalValue(local[day]) as Record<
          string,
          unknown
        > | null;
        if (canonical(original) === canonical(changed)) return;
        const remoteStateChanged = dayState(latestDay) !== dayState(baseDay);
        const localStateChanged = dayState(localDay) !== dayState(baseDay);
        if (remoteStateChanged || localStateChanged) {
          if (localDay) hours[day] = localDay;
          else delete hours[day];
          return;
        }
        if (!changed) {
          delete hours[day];
          return;
        }
        const current = {
          ...((canonicalValue(hours[day]) as Record<string, unknown> | null) ??
            {}),
        };
        const keys = new Set([
          ...Object.keys(original ?? {}),
          ...Object.keys(changed),
        ]);
        keys.forEach((key) => {
          if (canonical(original?.[key]) !== canonical(changed[key])) {
            if (changed[key] === undefined) delete current[key];
            else current[key] = changed[key];
          }
        });
        hours[day] = current as DayHours;
      },
    );
    merged.operatingHours = hours;
  }
  return merged;
}

function draftValues(draft: api.Draft): DraftValues {
  return Object.fromEntries(
    fieldNames.map((field) => [field, draft[field] ?? null]),
  ) as DraftValues;
}

function formValue(field: DraftField, value: FormDataEntryValue | null) {
  if (field === "unitApplicable") {
    return value === "true" ? true : value === "false" ? false : null;
  }
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    if (field === "tradingName" || field === "premisesName") return null;
    return value !== "" && value !== null ? "" : null;
  }
  return normalized;
}

function documentRequestLabel(type: string) {
  return type
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function describeHours(hours: api.Draft["operatingHours"] = {}) {
  return days
    .map((day) => {
      const value = hours?.[day];
      if (!value) return `${documentRequestLabel(day)}: not set`;
      if (value.closed) return `${documentRequestLabel(day)}: closed`;
      const overnight = value.closesNextDay ? " next day" : "";
      return `${documentRequestLabel(day)}: ${value.opens}–${value.closes}${overnight}`;
    })
    .join("; ");
}

function describeSelection(values: string[] | undefined) {
  return values?.length
    ? values.map(documentRequestLabel).join(", ")
    : "None selected";
}

function unmetLabel(draft: api.Draft, id: string) {
  if (id === "preparationActivities") return "Preparation activities";
  if (id === "serviceModes") return "Service modes";
  if (id.startsWith("operatingHours.")) {
    return `${documentRequestLabel(id.split(".")[1])} hours`;
  }
  if (id.startsWith("documentRequest.")) {
    const requestId = id.slice("documentRequest.".length);
    const request = draft.documentRequests?.find(
      (item) => item.id === requestId,
    );
    return request
      ? `${documentRequestLabel(request.type)} file`
      : "Required evidence file";
  }
  if (id === "declaration.accuracy") {
    return "Accuracy confirmation — You will confirm this when submitting.";
  }
  if (id === "declaration.authority") {
    return "Authority confirmation — You will confirm this when submitting.";
  }
  return fieldLabels[id as DraftField] ?? documentRequestLabel(id);
}

function focusUnmet(id: string) {
  const target = document.getElementById(id);
  const control = target?.matches("input,select,button")
    ? target
    : target?.querySelector<HTMLElement>("input,select,button");
  (control ?? target)?.focus();
}

function DayHoursFields({
  day,
  initial,
  disabled,
  error,
}: {
  day: string;
  initial?: DayHours;
  disabled: boolean;
  error?: string;
}) {
  const [state, setState] = useState(
    initial ? (initial.closed ? "CLOSED" : "OPEN") : "NOT_SET",
  );
  const errorId = error ? `${day}.error` : undefined;
  const dayLabel = documentRequestLabel(day);
  return (
    <div
      id={`operatingHours.${day}`}
      className="space-y-3 rounded-md border p-3"
    >
      <Label htmlFor={`${day}.state`}>{dayLabel} hours</Label>
      <NativeSelect
        id={`${day}.state`}
        name={`${day}.state`}
        value={state}
        onChange={(event) => setState(event.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className="w-full"
      >
        <NativeSelectOption value="NOT_SET">Not set</NativeSelectOption>
        <NativeSelectOption value="CLOSED">Closed</NativeSelectOption>
        <NativeSelectOption value="OPEN">Open</NativeSelectOption>
      </NativeSelect>
      {state === "OPEN" && (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor={`${day}.opens`}>Opens on {dayLabel}</Label>
            <Input
              id={`${day}.opens`}
              name={`${day}.opens`}
              type="time"
              defaultValue={initial?.opens ?? ""}
              disabled={disabled}
              aria-invalid={!!error}
              aria-describedby={errorId}
            />
          </div>
          <div>
            <Label htmlFor={`${day}.closes`}>Closes on {dayLabel}</Label>
            <Input
              id={`${day}.closes`}
              name={`${day}.closes`}
              type="time"
              defaultValue={initial?.closes ?? ""}
              disabled={disabled}
              aria-invalid={!!error}
              aria-describedby={errorId}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${day}.closesNextDay`}
              name={`${day}.closesNextDay`}
              value="true"
              defaultChecked={!!initial?.closesNextDay}
              disabled={disabled}
              aria-invalid={!!error}
              aria-describedby={errorId}
            />
            <Label htmlFor={`${day}.closesNextDay`}>
              Closes next day for {dayLabel}
            </Label>
          </div>
        </div>
      )}
      {state === "CLOSED" && (
        <p className="text-xs text-muted-foreground">
          Choosing Closed explicitly clears any saved times for this day when
          you save.
        </p>
      )}
      {error && (
        <p id={`${day}.error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function OperatorDrafts({ navigationRequest }: { navigationRequest: number }) {
  const [drafts, setDrafts] = useState<api.Draft[]>([]);
  const [draft, setDraft] = useState<api.Draft | null>(null);
  const [caseDetail, setCaseDetail] = useState<api.CaseDetail | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(0);
  const [submissionTarget, setSubmissionTarget] = useState<HTMLDivElement | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading your drafts…");
  const [pendingCreateKey, setPendingCreateKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [conflict, setConflict] = useState<api.Draft | null>(null);
  const [conflictEdits, setConflictEdits] = useState<PatchFields>({});
  const [conflictBase, setConflictBase] = useState<api.Draft | null>(null);
  const [editDefaults, setEditDefaults] = useState<api.Draft | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const createInFlight = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pendingEvidence, setPendingEvidence] = useState<Record<string, boolean>>({});
  const [confirmExit, setConfirmExit] = useState(false);
  const seenNavigation = useRef(navigationRequest);
  const pendingFileCount = draft?.documentRequests?.filter(
    (request) => request.applicability === "APPLICABLE" && pendingEvidence[request.id],
  ).length ?? 0;

  function returnToList() {
    setDraft(null);
    setShowWorkflow(false);
    setCaseDetail(null);
    setPendingEvidence({});
    setConfirmExit(false);
    window.setTimeout(() => document.getElementById("applications-heading")?.focus(), 0);
  }
  function requestHome() {
    if (saving || uploadingEvidence || conflict || workflowBusy) {
      setStatus("Finish or retry the current action, and resolve saves, uploads or conflicts before leaving.");
      return;
    }
    if (draft && (pendingFileCount || (formRef.current && Object.keys(editsFrom(formRef.current, draft)).length))) {
      setConfirmExit(true);
    } else returnToList();
  }
  const navigateHome = useEffectEvent(requestHome);
  useEffect(() => {
    if (seenNavigation.current === navigationRequest) return;
    seenNavigation.current = navigationRequest;
    void Promise.resolve().then(() => navigateHome());
  }, [navigationRequest]);

  useEffect(() => {
    api
      .listDrafts()
      .then((items) => {
        setDrafts(items);
        setStatus(items.length ? "Saved drafts recovered." : "No drafts yet.");
      })
      .catch((cause: Error) => setStatus(cause.message));
  }, []);

  async function create() {
    if (createInFlight.current) return;
    createInFlight.current = true;
    const key = pendingCreateKey ?? crypto.randomUUID();
    setPendingCreateKey(key);
    setCreating(true);
    setStatus(
      pendingCreateKey ? "Retrying draft creation…" : "Creating draft…",
    );
    try {
      const created = await api.createDraft(key);
      setDrafts((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      setDraft(created);
      setEditDefaults(null);
      setPendingCreateKey(null);
      setStatus("New draft created. Add details, then save explicitly.");
    } catch (cause) {
      setStatus(
        `${(cause as Error).message} The result is unknown. Retry create to safely use the same request.`,
      );
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

  function canEdit(target: string): boolean {
    if (!draft || draft.status === "DRAFT") return true;
    return (
      draft.status === "PENDING_PRE_SITE_RESUBMISSION" &&
      !!caseDetail?.issues.some(
        (issue) => issue.state === "OPEN" && issue.target === target,
      )
    );
  }

  function editsFrom(form: HTMLFormElement, base: api.Draft): PatchFields {
    const data = new FormData(form);
    const localValues = Object.fromEntries(
      fieldNames.map((field) => [field, formValue(field, data.get(field))]),
    ) as DraftValues;
    const operations = operationValues(data);
    const baseValues = draftValues(base);
    const fields: PatchFields = Object.fromEntries(
      fieldNames
        .filter(
          (field) => canEdit(field) && localValues[field] !== baseValues[field],
        )
        .map((field) => [field, localValues[field]]),
    );
    if (base.status !== "DRAFT") {
      const hours = { ...(base.operatingHours ?? {}) };
      const local = operations.operatingHours as Record<string, DayHours>;
      days
        .filter((day) => canEdit(`operatingHours.${day}`))
        .forEach((day) => {
          if (local[day]) hours[day] = local[day];
          else delete hours[day];
        });
      operations.operatingHours = hours;
    }
    Object.entries(operations).forEach(([field, value]) => {
      if (field !== "operatingHours" && !canEdit(field)) return;
      if (
        canonical(value) !==
        canonical(
          base[field as keyof api.Draft] ??
            (field === "operatingHours" ? {} : []),
        )
      ) {
        fields[field] = value;
      }
    });
    return fields;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveValues(event.currentTarget);
  }
  async function saveValues(form: HTMLFormElement): Promise<boolean> {
    if (!draft || saving || uploadingEvidence || conflict || workflowBusy) return false;
    setSaving(true);
    setStatus("Saving…");
    setErrors({});
    const fields = editsFrom(form, draft);
    try {
      const saved = await api.saveDraft(draft.id, draft.revision, fields);
      setDraft(saved);
      setEditDefaults(null);
      setEditorGeneration((current) => current + 1);
      setDrafts((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setStatus(
        `Saved revision ${saved.revision}. Next: upload any selected files, then choose Submit application at the bottom.`,
      );
      return true;
    } catch (cause) {
      const failure = cause as api.ApiError;
      setErrors(failure.fieldErrors ?? {});
      if (failure.status === 400 || failure.status === 422) {
        setStatus(failure.message);
        setSaving(false);
        return false;
      }
      try {
        const latest = await api.getDraft(draft.id);
        const committed = Object.entries(fields).every(
          ([field, value]) =>
            canonical(value) ===
            canonical(latest[field as keyof api.Draft] ?? null),
        );
        if (failure.status !== 409 && committed) {
          setDraft(latest);
          setEditDefaults(null);
          setEditorGeneration((current) => current + 1);
          setDrafts((current) =>
            current.map((item) => (item.id === latest.id ? latest : item)),
          );
          setStatus(
            `Recovered saved revision ${latest.revision} after the response was lost. Next: choose Submit application at the bottom.`,
          );
          return true;
        } else {
          setConflict(latest);
          setConflictBase(draft);
          setConflictEdits(fields);
          setStatus(
            `${failure.message} Review the latest saved values before choosing how to continue.`,
          );
        }
      } catch {
        setStatus(
          `${failure.message} The latest saved revision could not be read. ` +
            "Your unsaved values remain below; retry recovery before saving again.",
        );
      }
    } finally {
      setSaving(false);
    }
    return false;
  }

  async function reviewSubmission() {
    if (!draft || saving || uploadingEvidence || conflict || workflowBusy || pendingFileCount) return;
    if (formRef.current && Object.keys(editsFrom(formRef.current, draft)).length) {
      if (!await saveValues(formRef.current)) return;
    }
    setShowWorkflow(true);
    setReviewRequest((current) => current + 1);
    window.setTimeout(() => document.getElementById("application-actions")?.focus(), 0);
  }

  if (!draft) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="applications-heading" tabIndex={-1} className="text-lg font-semibold">Your applications</h2>
          <Button onClick={create} disabled={creating}>
            {creating
              ? "Creating…"
              : pendingCreateKey
                ? "Retry create"
                : "Create application"}
          </Button>
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
        <div className="space-y-2">
          {drafts.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              disabled={saving}
              className="h-auto w-full min-w-0 flex-col items-start justify-between gap-3 overflow-hidden px-4 py-4 text-left sm:flex-row sm:items-center"
              onClick={() => {
                setDraft(item);
                setShowWorkflow(item.status !== "DRAFT");
                setCaseDetail(null);
                setEditDefaults(null);
                setStatus("Saved draft opened.");
              }}
            >
              <span
                className="min-w-0 max-w-full truncate"
                title={item.legalName || "Untitled draft"}
              >
                {item.legalName || "Untitled draft"}
              </span>
              <span className="flex max-w-full flex-wrap items-center gap-2">
                <StatusBadge status={item.status}>{statusLabel(item.status, "OPERATOR")}</StatusBadge>
                <span className="text-xs text-muted-foreground">Revision {item.revision}</span>
              </span>
            </Button>
          ))}
        </div>
      </section>
    );
  }

  const conflictPreview = conflict
    ? mergeConflictEdits(conflictBase ?? draft, conflict, conflictEdits)
    : null;
  const conflictLocal = conflictBase
    ? ({ ...conflictBase, ...conflictEdits } as api.Draft)
    : null;

  const input = (name: DraftField, label: string, required = false) => (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required && <><span aria-hidden="true" className="text-status-warning"> *</span><span className="sr-only"> (required to submit)</span></>}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={String(
          editDefaults ? (editDefaults[name] ?? "") : (draft[name] ?? ""),
        )}
        disabled={saving || !!conflict || !canEdit(name)}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {errors[name]}
        </p>
      )}
    </div>
  );

  const saveDraftAction = <Button form="application-editor" type="submit" variant="outline" disabled={saving || uploadingEvidence || !!conflict || workflowBusy}>{saving ? "Saving…" : "Save draft"}</Button>;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Application sections" className="flex flex-wrap gap-2 border-b pb-4 lg:sticky lg:top-28 lg:flex-col lg:border-b-0 lg:border-r lg:pr-6">
        <p className="mb-2 w-full font-medium">Application sections</p>
        {["Business", "Applicant", "Premises", "Operations", "Evidence"].map((section) => <a key={section} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-ring" href={`#application-${section.toLowerCase()}`}>{section}</a>)}
      </nav>
      <div className="flex min-w-0 flex-col gap-8">
      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your saved application and uploaded files will remain. Unsaved field changes and files selected but not uploaded will be discarded.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={returnToList}>Discard unsaved changes</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {showWorkflow && (
        <CasePanel
          id={draft.id}
          role="OPERATOR"
          refreshRequest={reviewRequest}
          workingRevision={draft.revision}
          submissionTarget={submissionTarget}
          submissionBlocked={saving || uploadingEvidence || !!conflict || !!pendingFileCount}
          saveAction={saveDraftAction}
          onActivityChange={setWorkflowBusy}
          beforeCommand={(latest) => {
            if (latest.revision !== draft.revision)
              throw new Error(
                "The saved application changed. Reload and review the saved values before taking this action.",
              );
            if (saving || uploadingEvidence || conflict)
              throw new Error(
                "Finish saving or uploading and review conflicts first.",
              );
            if (
              formRef.current &&
              Object.keys(editsFrom(formRef.current, draft)).length
            )
              throw new Error(
                "Save your unsaved field changes before taking a workflow action.",
              );
          }}
          onDetail={(detail) => {
            setCaseDetail(detail);
            setDraft((current) =>
              current ? { ...current, status: detail.status } : current,
            );
          }}
          onChanged={(detail) => {
            if (detail.working) {
              setDraft(detail.working);
              setDrafts((items) =>
                items.map((item) =>
                  item.id === detail.id ? detail.working! : item,
                ),
              );
            } else {
              setDraft({
                ...draft,
                status: detail.status,
                revision: detail.revision,
              });
            }
          }}
        />
      )}
      <form
        ref={formRef}
        id="application-editor"
        key={editorGeneration}
        className="space-y-6"
        onSubmit={save}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {draft.status === "DRAFT"
                ? "Application draft"
                : "Application details"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Drafts may be incomplete · revision {draft.revision}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={saving || !!conflict}
            onClick={requestHome}
          >
            All applications
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">1. Add details and upload files. 2. Save draft. 3. Submit at the bottom.</p>

        </div>
        <p role="status" className="text-sm text-muted-foreground">{status}</p>
        {!!pendingFileCount && <Alert><AlertTitle>Upload your selected files</AlertTitle><AlertDescription>{pendingFileCount} selected file(s) have not been uploaded. Use Upload file or Replace file in Evidence before reviewing for submission. Saving draft keeps your selection while this page stays open.</AlertDescription></Alert>}
        {conflict && (
          <Alert role="alert">
            <AlertTitle>Saved draft changed</AlertTitle>
            <AlertDescription>
              <p className="mb-3">
                Revision {conflict.revision} is saved on the server. Your local
                values remain in the form below.
              </p>
              <dl className="mb-4 grid gap-2 text-xs sm:grid-cols-2">
                {fieldNames.map((field) => (
                  <div key={field} className="min-w-0">
                    <dt className="font-medium">{fieldLabels[field]}</dt>
                    <dd
                      className="truncate"
                      title={String(conflict[field] ?? "Not set")}
                    >
                      {String(conflict[field] ?? "Not set")}
                    </dd>
                  </div>
                ))}
              </dl>
              <dl className="mb-4 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-medium">Preparation activities</dt>
                  <dd>
                    <strong>Saved:</strong>{" "}
                    {describeSelection(conflict.preparationActivities)}
                  </dd>
                  <dd>
                    <strong>After keeping edits:</strong>{" "}
                    {describeSelection(conflictPreview?.preparationActivities)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Service modes</dt>
                  <dd>
                    <strong>Saved:</strong>{" "}
                    {describeSelection(conflict.serviceModes)}
                  </dd>
                  <dd>
                    <strong>After keeping edits:</strong>{" "}
                    {describeSelection(conflictPreview?.serviceModes)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium">Opening hours</dt>
                  <dd>
                    <strong>Original:</strong>{" "}
                    {describeHours(conflictBase?.operatingHours)}
                  </dd>
                  <dd>
                    <strong>Saved:</strong>{" "}
                    {describeHours(conflict.operatingHours)}
                  </dd>
                  <dd>
                    <strong>Your complete local edit:</strong>{" "}
                    {describeHours(conflictLocal?.operatingHours)}
                  </dd>
                  <dd>
                    <strong>After keeping edits:</strong>{" "}
                    {describeHours(conflictPreview?.operatingHours)}
                  </dd>
                </div>
              </dl>
              <p className="mb-4 text-xs text-muted-foreground">
                Keep and review applies only your changed selections and hour
                values over the latest saved revision. If both tabs changed the
                same value, your explicit choice keeps your local value for
                review before saving.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(conflict);
                    setEditDefaults(null);
                    setDrafts((current) =>
                      current.map((item) =>
                        item.id === conflict.id ? conflict : item,
                      ),
                    );
                    setConflict(null);
                    setConflictBase(null);
                    setConflictEdits({});
                    setEditorGeneration((current) => current + 1);
                    setStatus("Reloaded the latest saved draft.");
                  }}
                >
                  Reload saved values
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const retained = conflictPreview ?? conflict;
                    setDraft(conflict);
                    setEditDefaults(retained);
                    setDrafts((current) =>
                      current.map((item) =>
                        item.id === conflict.id ? conflict : item,
                      ),
                    );
                    setConflict(null);
                    setConflictBase(null);
                    setConflictEdits({});
                    setEditorGeneration((current) => current + 1);
                    setStatus(
                      "Latest revision selected. Review the retained local edits, then save deliberately.",
                    );
                  }}
                >
                  Keep and review my edits
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground"><span className="text-status-warning">*</span> Required for submission. Save an incomplete draft at any time.</p>
        <section
          aria-labelledby="progress-heading"
          className="space-y-3 rounded-md border p-4"
        >
          <h3 id="progress-heading" className="font-medium">
            Saved completion: {draft.completion?.completed ?? 0} of{" "}
            {draft.completion?.required ?? 0} (
            {draft.completion?.percentage ?? 0}
            %)
          </h3>
          <p className="text-sm text-muted-foreground">
            Progress reflects the last saved revision, including ready evidence
            files. The total includes two declarations confirmed at submission.
          </p>
          <p className="text-sm font-medium">
            {(draft.completion?.unmetItemIds ?? []).filter((id) => !id.startsWith("declaration.")).length} required details or files remain.
          </p>
          <ul className="list-inside list-disc text-sm">
            {(draft.completion?.unmetItemIds ?? []).filter((id) => !id.startsWith("declaration.")).map((id) => (
              <li key={id}>
                <a
                  className="underline"
                  href={`#${id}`}
                  onClick={() => window.setTimeout(() => focusUnmet(id), 0)}
                >
                  {unmetLabel(draft, id)}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Confirm accuracy and authority at the bottom before submitting. These declarations are not missing draft fields.</p>
        </section>
        <fieldset id="application-business" tabIndex={-1} className="flex scroll-mt-36 flex-col gap-5 border-t pt-6">
          <legend className="mb-3 text-lg font-semibold">Business</legend>
          {input("legalName", "Legal name", true)}
          {input("tradingName", "Trading name")}
          {input("registrationNumber", "Registration number", true)}
          <div className="space-y-2">
            <Label htmlFor="structure">
              Business structure <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span>
            </Label>
            <NativeSelect
              id="structure"
              name="structure"
              defaultValue={
                editDefaults
                  ? (editDefaults.structure ?? "")
                  : (draft.structure ?? "")
              }
              disabled={saving || !!conflict || !canEdit("structure")}
              aria-invalid={!!errors.structure}
              aria-describedby={
                errors.structure ? "structure-error" : undefined
              }
              className="w-full"
            >
              <NativeSelectOption value="">Not set</NativeSelectOption>
              <NativeSelectOption value="SOLE_PROPRIETOR">
                Sole proprietor
              </NativeSelectOption>
              <NativeSelectOption value="PARTNERSHIP">
                Partnership
              </NativeSelectOption>
              <NativeSelectOption value="COMPANY">Company</NativeSelectOption>
              <NativeSelectOption value="OTHER">Other</NativeSelectOption>
            </NativeSelect>
            {errors.structure && (
              <p id="structure-error" className="text-sm text-destructive">
                {errors.structure}
              </p>
            )}
          </div>
        </fieldset>
        <fieldset id="application-applicant" tabIndex={-1} className="flex scroll-mt-36 flex-col gap-5 border-t pt-6">
          <legend className="mb-3 text-lg font-semibold">Applicant</legend>
          {input("applicantName", "Name", true)}
          <div className="space-y-2">
            <Label htmlFor="applicantRole">Role <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span></Label>
            <NativeSelect
              id="applicantRole"
              name="applicantRole"
              defaultValue={
                editDefaults
                  ? (editDefaults.applicantRole ?? "")
                  : (draft.applicantRole ?? "")
              }
              disabled={saving || !!conflict || !canEdit("applicantRole")}
              aria-invalid={!!errors.applicantRole}
              aria-describedby={
                errors.applicantRole ? "applicantRole-error" : undefined
              }
              className="w-full"
            >
              <NativeSelectOption value="">Not set</NativeSelectOption>
              {["OWNER", "DIRECTOR", "EMPLOYEE", "REPRESENTATIVE"].map(
                (role) => (
                  <NativeSelectOption key={role}>{role}</NativeSelectOption>
                ),
              )}
            </NativeSelect>
            {errors.applicantRole && (
              <p id="applicantRole-error" className="text-sm text-destructive">
                {errors.applicantRole}
              </p>
            )}
          </div>
          {input("applicantEmail", "Contact email", true)}
          {input("applicantPhone", "Phone", true)}
        </fieldset>
        <fieldset id="application-premises" tabIndex={-1} className="flex scroll-mt-36 flex-col gap-5 border-t pt-6">
          <legend className="mb-3 text-lg font-semibold">Premises</legend>
          {input("premisesAddress", "Address", true)}
          {input("premisesName", "Premises name")}
          <div className="space-y-2">
            <Label htmlFor="unitApplicable">
              Does the premises have a unit number? <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span>
            </Label>
            <NativeSelect
              id="unitApplicable"
              name="unitApplicable"
              defaultValue={String(
                (editDefaults
                  ? editDefaults.unitApplicable
                  : draft.unitApplicable) ?? "",
              )}
              disabled={saving || !!conflict || !canEdit("unitApplicable")}
              aria-invalid={!!errors.unitApplicable}
              aria-describedby={
                errors.unitApplicable ? "unitApplicable-error" : undefined
              }
              className="w-full"
            >
              <NativeSelectOption value="">Not set</NativeSelectOption>
              <NativeSelectOption value="true">Yes</NativeSelectOption>
              <NativeSelectOption value="false">No</NativeSelectOption>
            </NativeSelect>
            {errors.unitApplicable && (
              <p id="unitApplicable-error" className="text-sm text-destructive">
                {errors.unitApplicable}
              </p>
            )}
          </div>
          <div>
            {input(
              "unitNumber",
              "Unit number",
              draft.unitApplicable === true,
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              If you choose no unit, clear a retained unit number before saving.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenure">Tenure <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span></Label>
            <NativeSelect
              id="tenure"
              name="tenure"
              defaultValue={String(
                (editDefaults ? editDefaults.tenure : draft.tenure) ?? "",
              )}
              disabled={saving || !!conflict || !canEdit("tenure")}
              aria-invalid={!!errors.tenure}
              aria-describedby={errors.tenure ? "tenure-error" : undefined}
              className="w-full"
            >
              <NativeSelectOption value="">Not set</NativeSelectOption>
              <NativeSelectOption value="OWNED">Owned</NativeSelectOption>
              <NativeSelectOption value="RENTED">Rented</NativeSelectOption>
            </NativeSelect>
            {errors.tenure && (
              <p id="tenure-error" className="text-sm text-destructive">
                {errors.tenure}
              </p>
            )}
          </div>
        </fieldset>
        <fieldset id="application-operations" tabIndex={-1} className="flex scroll-mt-36 flex-col gap-5 border-t pt-6">
          <legend className="text-lg font-semibold">Operations</legend>
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <Label htmlFor="businessType">
                Business type <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span>
              </Label>
              <NativeSelect
                id="businessType"
                name="businessType"
                defaultValue={String(
                  (editDefaults
                    ? editDefaults.businessType
                    : draft.businessType) ?? "",
                )}
                disabled={saving || !!conflict || !canEdit("businessType")}
                aria-invalid={!!errors.businessType}
                aria-describedby={
                  errors.businessType ? "businessType-error" : undefined
                }
                className="w-full"
              >
                <NativeSelectOption value="">Not set</NativeSelectOption>
                <NativeSelectOption value="CAFE">Café</NativeSelectOption>
                <NativeSelectOption value="RESTAURANT">
                  Restaurant
                </NativeSelectOption>
              </NativeSelect>
              {errors.businessType && (
                <p id="businessType-error" className="text-sm text-destructive">
                  {errors.businessType}
                </p>
              )}
            </div>
            {input(
              "proposedOpeningDate",
              "Proposed opening date (YYYY-MM-DD)",
              true,
            )}
          </div>
          <div className="flex flex-col gap-5">
            <fieldset
              id="preparationActivities"
              aria-describedby={
                errors.preparationActivities
                  ? "preparationActivities-error"
                  : undefined
              }
            >
              <legend className="mb-2 text-sm font-medium">
                Preparation activities (choose at least one) <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span>
              </legend>
              {activities.map((value) => (
                <div key={value} className="flex items-center gap-2 py-1">
                  <Checkbox
                    id={`preparation-${value}`}
                    name="preparationActivities"
                    value={value}
                    defaultChecked={(
                      editDefaults?.preparationActivities ??
                      draft.preparationActivities ??
                      []
                    ).includes(value)}
                    disabled={
                      saving || !!conflict || !canEdit("preparationActivities")
                    }
                  />
                  <Label htmlFor={`preparation-${value}`}>
                    {documentRequestLabel(value)}
                  </Label>
                </div>
              ))}
              {errors.preparationActivities && (
                <p
                  id="preparationActivities-error"
                  className="text-sm text-destructive"
                >
                  {errors.preparationActivities}
                </p>
              )}
            </fieldset>
            <fieldset
              id="serviceModes"
              aria-describedby={
                errors.serviceModes ? "serviceModes-error" : undefined
              }
            >
              <legend className="mb-2 text-sm font-medium">
                Service modes (choose at least one) <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span>
              </legend>
              {modes.map((value) => (
                <div key={value} className="flex items-center gap-2 py-1">
                  <Checkbox
                    id={`service-${value}`}
                    name="serviceModes"
                    value={value}
                    defaultChecked={(
                      editDefaults?.serviceModes ??
                      draft.serviceModes ??
                      []
                    ).includes(value)}
                    disabled={saving || !!conflict || !canEdit("serviceModes")}
                  />
                  <Label htmlFor={`service-${value}`}>
                    {documentRequestLabel(value)}
                  </Label>
                </div>
              ))}
              {errors.serviceModes && (
                <p id="serviceModes-error" className="text-sm text-destructive">
                  {errors.serviceModes}
                </p>
              )}
            </fieldset>
          </div>
          <fieldset className="space-y-3">
            <legend className="font-medium">Opening hours <span aria-hidden="true" className="text-status-warning">*</span><span className="sr-only"> (required to submit)</span></legend>
            <p className="text-sm text-muted-foreground">Choose Open or Closed for every day. Closed days count as complete; Not set is an unanswered required item.</p>
            {days.map((day) => (
              <DayHoursFields
                key={day}
                day={day}
                initial={
                  (editDefaults?.operatingHours ?? draft.operatingHours ?? {})[
                    day
                  ]
                }
                disabled={
                  saving || !!conflict || !canEdit(`operatingHours.${day}`)
                }
                error={errors[`operatingHours.${day}`]}
              />
            ))}
          </fieldset>
        </fieldset>
      </form>
        <section id="application-evidence" tabIndex={-1} aria-labelledby="requirements-heading" className="flex scroll-mt-36 flex-col gap-4 border-t pt-6">
          <div>
            <h3 id="requirements-heading" className="font-medium">
              Evidence requirements
            </h3>
            <p className="text-sm text-muted-foreground">
              Requirements update when this draft is saved. Ready files count
              toward saved progress; uploads never save or clear local form
              edits.
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {(draft.documentRequests ?? []).map((request) => (
              <li
                id={`documentRequest.${request.id}`}
                tabIndex={-1}
                key={request.id}
                aria-label={`${documentRequestLabel(request.type)} requirement`}
                className="min-w-0 overflow-hidden rounded-md border border-border p-3 text-sm"
              >
                <p className="font-medium">
                  {documentRequestLabel(request.type)}
                </p>
                <Badge variant={request.applicability === "NEEDS_INPUT" ? "warning" : request.applicability === "APPLICABLE" ? "info" : "secondary"}>
                  {request.applicability === "NEEDS_INPUT"
                    ? "More information needed"
                    : request.applicability === "APPLICABLE"
                      ? "Required"
                      : "Not required"}
                </Badge>
                <p className="mt-1 text-muted-foreground">{request.reason}</p>
                <EvidenceUpload
                  applicationId={draft.id}
                  revision={draft.revision}
                  request={request}
                  disabled={
                    saving ||
                    uploadingEvidence ||
                    workflowBusy ||
                    !!conflict ||
                    !canEdit(request.id)
                  }
                  onBusyChange={setUploadingEvidence}
                  onPendingChange={(pending) => setPendingEvidence((current) => ({ ...current, [request.id]: pending }))}
                  onCommitted={(result) => {
                    const current = result.currentDraft;
                    const localEdits = formRef.current
                      ? editsFrom(formRef.current, draft)
                      : {};
                    setDraft(current);
                    setDrafts((items) =>
                      items.map((item) =>
                        item.id === current.id ? current : item,
                      ),
                    );
                    if (current.revision > result.revision) {
                      setConflict(current);
                      setConflictBase(draft);
                      setConflictEdits(localEdits);
                      setStatus(
                        `Upload receipt recovered from revision ${result.revision}, but revision ${current.revision} is current. Review the current file and retained local edits.`,
                      );
                    } else {
                      setStatus(
                        `Saved evidence at revision ${current.revision}. Local form edits were not saved or cleared.`,
                      );
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
        <div id="application-actions" ref={setSubmissionTarget} tabIndex={-1} role="region" aria-label="Application actions" className="scroll-mt-24">
          {!showWorkflow && <div className="flex gap-3">{saveDraftAction}<Button type="button" disabled={saving || uploadingEvidence || !!conflict || workflowBusy || !!pendingFileCount} onClick={reviewSubmission}>Submit application</Button></div>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<api.User | null>(null);
  const [workspace, setWorkspace] = useState<api.Workspace | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async (currentUser: api.User) => {
    setWorkspaceLoading(true);
    setError("");
    try {
      setWorkspace(await api.workspace(currentUser.role));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .me()
      .then((currentUser) => {
        setUser(currentUser);
        if (currentUser) return loadWorkspace(currentUser);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setRestoring(false));
  }, [loadWorkspace]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const currentUser = await api.login(
        String(form.get("username")),
        String(form.get("password")),
      );
      setUser(currentUser);
      if (currentUser) await loadWorkspace(currentUser);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setSubmitting(true);
    setError("");
    try {
      await api.logout();
      setUser(null);
      setWorkspace(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (restoring) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6">
        <p role="status" className="text-sm text-muted-foreground">
          Restoring your session…
        </p>
      </main>
    );
  }

  if (user) {
    return (
      <WorkspaceShell user={user} heading={workspace?.heading ?? "Workspace"} error={error} signingOut={submitting} onSignOut={signOut} onHome={() => setNavigationRequest((current) => current + 1)}>
        {workspaceLoading ? (
          <p role="status" className="text-muted-foreground">Loading workspace…</p>
        ) : workspace ? (
          <div className="flex flex-col gap-8">
            <p className="text-muted-foreground">{workspace.message}</p>
            {user.role === "OPERATOR" ? <OperatorDrafts navigationRequest={navigationRequest} /> : <OfficerCases navigationRequest={navigationRequest} />}
          </div>
        ) : <Button variant="outline" onClick={() => loadWorkspace(user)}>Retry workspace</Button>}
      </WorkspaceShell>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4 sm:p-8">
      <Card
        className="w-full max-w-md border-border bg-card"
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Regulatory and licensing platform
          </p>
          <CardTitle>
            <h1 className="text-2xl">
              Sign in
            </h1>
          </CardTitle>
          <CardDescription>
            Use your development operator or officer account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4" role="alert">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

            <form className="space-y-4" onSubmit={signIn}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
        </CardContent>
      </Card>
    </main>
  );
}
