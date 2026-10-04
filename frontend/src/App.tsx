import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
        <div className="grid gap-3 sm:grid-cols-3">
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

function EvidenceUpload({
  applicationId,
  revision,
  request,
  disabled,
  onCommitted,
  onBusyChange,
}: {
  applicationId: string;
  revision: number;
  request: NonNullable<api.Draft["documentRequests"]>[number];
  disabled: boolean;
  onCommitted: (result: api.UploadResult) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<api.ProcessingStatus | null>(
    null,
  );
  const [pollWarning, setPollWarning] = useState("");
  const [retryingCheck, setRetryingCheck] = useState(false);
  const processingRetryKey = useRef<string | null>(null);
  const currentUploadId = request.currentUpload?.id;
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let running = false;
    const poll = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const statuses = await api.processingStatuses(applicationId);
        if (!stopped) {
          setProcessing(
            statuses.find((item) => item.uploadId === currentUploadId) ?? null,
          );
          setPollWarning("");
        }
      } catch {
        if (!stopped)
          setPollWarning("Status refresh paused; retrying automatically.");
      } finally {
        running = false;
      }
      if (!stopped) timer = window.setTimeout(poll, 700);
    };
    if (currentUploadId) void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [applicationId, currentUploadId]);
  async function retryCheck() {
    if (!request.currentUpload || retryingCheck) return;
    setRetryingCheck(true);
    try {
      const retryKey = processingRetryKey.current ?? crypto.randomUUID();
      processingRetryKey.current = retryKey;
      const result = await api.retryProcessing(applicationId, request.currentUpload.id, retryKey);
      processingRetryKey.current = null;
      setProcessing(result.status);
      setPollWarning("");
    } catch (cause) {
      setPollWarning((cause as Error).message);
    } finally {
      setRetryingCheck(false);
    }
  }
  function choose(next: File | null) {
    if (disabled || uploading) return;
    setFile(next);
    setKey(next ? crypto.randomUUID() : null);
    setMessage(next ? `${next.name} selected. Not uploaded yet.` : "");
  }
  async function upload() {
    if (!file || uploading) return;
    const retryKey = key ?? crypto.randomUUID();
    setKey(retryKey);
    setUploading(true);
    onBusyChange(true);
    setProgress(0);
    setMessage("Uploading…");
    try {
      const result = await api.uploadEvidence(
        applicationId,
        request.id,
        revision,
        retryKey,
        file,
        setProgress,
      );
      onCommitted(result);
      setFile(null);
      setKey(null);
      setProgress(100);
      const currentUpload = result.currentDraft.documentRequests?.find(
        (item) => item.id === request.id,
      )?.currentUpload;
      setMessage(
        currentUpload && currentUpload.id !== result.upload.id
          ? `Recovered ${result.upload.filename}; the current file remains ${currentUpload.filename}. Review the current revision.`
          : `Saved ${result.upload.filename}. Local form edits were not saved or cleared.`,
      );
    } catch (cause) {
      setMessage(
        `${(cause as Error).message} Choose Retry to safely resend this file.`,
      );
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  }
  const inputId = `evidence-${request.id}`;
  return (
    <div className="mt-3 min-w-0 space-y-2">
      {request.currentUpload && (
        <p className="min-w-0 text-xs">
          <a
            className="block max-w-full truncate underline"
            title={request.currentUpload.filename}
            target="_blank"
            rel="noreferrer"
            href={`/api/applications/${applicationId}/evidence/uploads/${request.currentUpload.id}`}
          >
            Open saved {request.currentUpload.filename}
          </a>{" "}
          · {(request.currentUpload.byteSize / 1000).toFixed(1)} KB
        </p>
      )}
      {request.currentUpload && (
        <div
          className="rounded-md border bg-muted/30 p-2 text-xs"
          aria-live="polite"
        >
          <p className="font-medium">Simulated document check</p>
          <p>
            {processing?.state === "COMPLETE"
              ? "Simulated check complete"
              : processing?.state === "CHECKING"
                ? "Checking…"
                : processing?.state === "ERROR"
                  ? "Simulated check could not complete"
                  : "Queued"}
          </p>
          {processing?.state === "COMPLETE" && (
            <p className="text-muted-foreground">
              Completion does not establish document validity or licensing
              compliance.
            </p>
          )}
          {processing?.state === "ERROR" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || retryingCheck}
              onClick={retryCheck}
            >
              {retryingCheck ? "Retrying…" : "Retry simulated check"}
            </Button>
          )}
          {pollWarning && (
            <p className="text-muted-foreground">{pollWarning}</p>
          )}
        </div>
      )}
      {request.applicability === "APPLICABLE" && (
        <>
          <div
            className="rounded-md border border-dashed p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!disabled && !uploading) {
                choose(event.dataTransfer.files.item(0));
              }
            }}
          >
            <Label htmlFor={inputId}>
              {request.currentUpload ? "Replace evidence" : "Upload evidence"}
            </Label>
            <Input
              id={inputId}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={disabled || uploading}
              className="min-w-0 max-w-full"
              onChange={(event) => choose(event.target.files?.item(0) ?? null)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, JPEG, or PNG · maximum 10,000,000 bytes. You can also drop a
              file here.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!file || disabled || uploading}
            onClick={upload}
          >
            {uploading
              ? `Uploading ${progress ?? 0}%…`
              : message.includes("Retry")
                ? "Retry upload"
                : request.currentUpload
                  ? "Replace file"
                  : "Upload file"}
          </Button>
          {progress !== null && (
            <progress
              className="w-full"
              max="100"
              value={progress}
              aria-label="Upload progress"
            />
          )}
          {message && (
            <p
              role="status"
              className="break-words text-xs [overflow-wrap:anywhere]"
            >
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function OperatorDrafts() {
  const [drafts, setDrafts] = useState<api.Draft[]>([]);
  const [draft, setDraft] = useState<api.Draft | null>(null);
  const [caseDetail, setCaseDetail] = useState<api.CaseDetail | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
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
    if (!draft) return;
    if (saving || uploadingEvidence || conflict) return;
    setSaving(true);
    setStatus("Saving…");
    setErrors({});
    const fields = editsFrom(event.currentTarget, draft);
    try {
      const saved = await api.saveDraft(draft.id, draft.revision, fields);
      setDraft(saved);
      setEditDefaults(null);
      setEditorGeneration((current) => current + 1);
      setDrafts((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setStatus(
        `Saved revision ${saved.revision}. Your draft will be available after sign in or reload.`,
      );
    } catch (cause) {
      const failure = cause as api.ApiError;
      setErrors(failure.fieldErrors ?? {});
      if (failure.status === 400 || failure.status === 422) {
        setStatus(failure.message);
        setSaving(false);
        return;
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
            `Recovered saved revision ${latest.revision} after the response was lost.`,
          );
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
  }

  if (!draft) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your applications</h2>
          <Button onClick={create} disabled={creating}>
            {creating
              ? "Creating…"
              : pendingCreateKey
                ? "Retry create"
                : "Create draft"}
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
              className="w-full min-w-0 justify-between overflow-hidden"
              onClick={() => {
                setDraft(item);
                setShowWorkflow(item.status !== "DRAFT");
                setCaseDetail(null);
                setEditDefaults(null);
                setStatus("Saved draft opened.");
              }}
            >
              <span
                className="min-w-0 truncate"
                title={item.legalName || "Untitled draft"}
              >
                {item.legalName || "Untitled draft"}
              </span>
              <span className="shrink-0">
                {statusLabel(item.status, "OPERATOR")} · Revision{" "}
                {item.revision}
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
        {required ? " (required to submit)" : ""}
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

  return (
    <div className="space-y-6">
      {showWorkflow && (
        <CasePanel
          id={draft.id}
          role="OPERATOR"
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
        key={editorGeneration}
        className="space-y-6"
        onSubmit={save}
      >
        <div className="flex items-center justify-between">
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
            onClick={() => setDraft(null)}
          >
            All drafts
          </Button>
        </div>
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
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-medium">Business</legend>
          {input("legalName", "Legal name", true)}
          {input("tradingName", "Trading name")}
          {input("registrationNumber", "Registration number", true)}
          <div className="space-y-2">
            <Label htmlFor="structure">
              Business structure (required to submit)
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
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-medium">Applicant</legend>
          {input("applicantName", "Name", true)}
          <div className="space-y-2">
            <Label htmlFor="applicantRole">Role (required to submit)</Label>
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
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-medium">Premises</legend>
          {input("premisesAddress", "Address", true)}
          {input("premisesName", "Premises name")}
          <div className="space-y-2">
            <Label htmlFor="unitApplicable">
              Does the premises have a unit number?
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
              "Unit number (required to submit when applicable)",
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              If you choose no unit, clear a retained unit number before saving.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenure">Tenure (required to submit)</Label>
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
        <fieldset className="space-y-4">
          <legend className="font-medium">Operations</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="businessType">
                Business type (required to submit)
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
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset
              id="preparationActivities"
              aria-describedby={
                errors.preparationActivities
                  ? "preparationActivities-error"
                  : undefined
              }
            >
              <legend className="mb-2 text-sm font-medium">
                Preparation activities (choose at least one)
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
                Service modes (choose at least one)
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
            <legend className="font-medium">Opening hours</legend>
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
            files.
          </p>
          <ul className="list-inside list-disc text-sm">
            {(draft.completion?.unmetItemIds ?? []).map((id) => (
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
        </section>
        <section aria-labelledby="requirements-heading" className="space-y-3">
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
          <ul className="grid gap-2 sm:grid-cols-2">
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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {request.applicability === "NEEDS_INPUT"
                    ? "More information needed"
                    : request.applicability === "APPLICABLE"
                      ? "Required"
                      : "Not required"}
                </p>
                <p className="mt-1 text-muted-foreground">{request.reason}</p>
                <EvidenceUpload
                  applicationId={draft.id}
                  revision={draft.revision}
                  request={request}
                  disabled={
                    saving ||
                    uploadingEvidence ||
                    !!conflict ||
                    !canEdit(request.id)
                  }
                  onBusyChange={setUploadingEvidence}
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
        <Button
          type="button"
          variant="outline"
          disabled={saving || uploadingEvidence || !!conflict}
          onClick={() => setShowWorkflow(true)}
        >
          Submission and history
        </Button>
        <section aria-labelledby="declarations-heading" className="space-y-2">
          <h3 id="declarations-heading" className="font-medium">
            Declarations
          </h3>
          <p id="declaration.accuracy" tabIndex={-1} className="text-sm">
            Accuracy: You will confirm these when submitting.
          </p>
          <p id="declaration.authority" tabIndex={-1} className="text-sm">
            Authority: You will confirm these when submitting.
          </p>
        </section>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
        <Button
          type="submit"
          disabled={saving || uploadingEvidence || !!conflict}
        >
          {saving ? "Saving…" : "Save draft"}
        </Button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<api.User | null>(null);
  const [workspace, setWorkspace] = useState<api.Workspace | null>(null);
  const [restoring, setRestoring] = useState(true);
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
      <WorkspaceShell user={user} heading={workspace?.heading ?? "Workspace"} error={error} signingOut={submitting} onSignOut={signOut}>
        {workspaceLoading ? (
          <p role="status" className="text-muted-foreground">Loading workspace…</p>
        ) : workspace ? (
          <div className="flex flex-col gap-8">
            <p className="text-muted-foreground">{workspace.message}</p>
            {user.role === "OPERATOR" ? <OperatorDrafts /> : <OfficerCases />}
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
