import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
] as const;
type DraftField = (typeof fieldNames)[number];
type DraftValues = Record<DraftField, string | boolean | null>;

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
};

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

function OperatorDrafts() {
  const [drafts, setDrafts] = useState<api.Draft[]>([]);
  const [draft, setDraft] = useState<api.Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading your drafts…");
  const [pendingCreateKey, setPendingCreateKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<api.Draft | null>(null);
  const [conflictEdits, setConflictEdits] = useState<Partial<DraftValues>>({});
  const [editDefaults, setEditDefaults] = useState<api.Draft | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const createInFlight = useRef(false);

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
    setStatus(pendingCreateKey ? "Retrying draft creation…" : "Creating draft…");
    try {
      const created = await api.createDraft(key);
      setDrafts((current) => [created, ...current.filter((item) => item.id !== created.id)]);
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (saving || conflict) return;
    setSaving(true);
    setStatus("Saving…");
    setErrors({});
    const data = new FormData(event.currentTarget);
    const localValues = Object.fromEntries(
      fieldNames.map((field) => [
        field,
        formValue(field, data.get(field)),
      ]),
    ) as DraftValues;
    const baseValues = draftValues(draft);
    const fields = Object.fromEntries(
      fieldNames
        .filter((field) => localValues[field] !== baseValues[field])
        .map((field) => [field, localValues[field]]),
    ) as Partial<DraftValues>;
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
        const committed = fieldNames.every(
          (field) => localValues[field] === (latest[field] ?? null),
        );
        if (failure.status !== 409 && committed) {
          setDraft(latest);
          setEditDefaults(null);
          setDrafts((current) =>
            current.map((item) => (item.id === latest.id ? latest : item)),
          );
          setStatus(
            `Recovered saved revision ${latest.revision} after the response was lost.`,
          );
        } else {
          setConflict(latest);
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
              <span className="shrink-0">Revision {item.revision}</span>
            </Button>
          ))}
        </div>
      </section>
    );
  }

  const input = (
    name: DraftField,
    label: string,
    required = false,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required ? " (required to submit)" : ""}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={
          String(editDefaults ? (editDefaults[name] ?? "") : (draft[name] ?? ""))
        }
        disabled={saving || !!conflict}
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
    <form key={editorGeneration} className="space-y-6" onSubmit={save}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Application draft</h2>
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
                  <dd className="truncate" title={String(conflict[field] ?? "Not set")}>
                    {String(conflict[field] ?? "Not set")}
                  </dd>
                </div>
              ))}
            </dl>
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
                  setDraft(conflict);
                  setEditDefaults({ ...conflict, ...conflictEdits } as api.Draft);
                  setDrafts((current) =>
                    current.map((item) =>
                      item.id === conflict.id ? conflict : item,
                    ),
                  );
                  setConflict(null);
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
            disabled={saving || !!conflict}
            aria-invalid={!!errors.structure}
            aria-describedby={errors.structure ? "structure-error" : undefined}
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
            disabled={saving || !!conflict}
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
          <Label htmlFor="unitApplicable">Does the premises have a unit number?</Label>
          <NativeSelect id="unitApplicable" name="unitApplicable"
            defaultValue={String((editDefaults ? editDefaults.unitApplicable : draft.unitApplicable) ?? "")}
            disabled={saving || !!conflict} aria-invalid={!!errors.unitApplicable}
            aria-describedby={errors.unitApplicable ? "unitApplicable-error" : undefined} className="w-full">
            <NativeSelectOption value="">Not set</NativeSelectOption>
            <NativeSelectOption value="true">Yes</NativeSelectOption>
            <NativeSelectOption value="false">No</NativeSelectOption>
          </NativeSelect>
          {errors.unitApplicable && <p id="unitApplicable-error" className="text-sm text-destructive">{errors.unitApplicable}</p>}
        </div>
        <div>
          {input("unitNumber", "Unit number (required to submit when applicable)")}
          <p className="mt-2 text-xs text-muted-foreground">If you choose no unit, clear a retained unit number before saving.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenure">Tenure (required to submit)</Label>
          <NativeSelect id="tenure" name="tenure"
            defaultValue={String((editDefaults ? editDefaults.tenure : draft.tenure) ?? "")}
            disabled={saving || !!conflict} aria-invalid={!!errors.tenure}
            aria-describedby={errors.tenure ? "tenure-error" : undefined} className="w-full">
            <NativeSelectOption value="">Not set</NativeSelectOption>
            <NativeSelectOption value="OWNED">Owned</NativeSelectOption>
            <NativeSelectOption value="RENTED">Rented</NativeSelectOption>
          </NativeSelect>
          {errors.tenure && <p id="tenure-error" className="text-sm text-destructive">{errors.tenure}</p>}
        </div>
      </fieldset>
      <section aria-labelledby="requirements-heading" className="space-y-3">
        <div>
          <h3 id="requirements-heading" className="font-medium">Evidence requirements</h3>
          <p className="text-sm text-muted-foreground">Requirements update when this draft is saved. File upload is not available yet.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(draft.documentRequests ?? []).map((request) => (
            <li key={request.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{request.type.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ")}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{request.applicability === "NEEDS_INPUT" ? "More information needed" : request.applicability === "APPLICABLE" ? "Required" : "Not required"}</p>
              <p className="mt-1 text-muted-foreground">{request.reason}</p>
            </li>
          ))}
        </ul>
      </section>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      <Button type="submit" disabled={saving || !!conflict}>
        {saving ? "Saving…" : "Save draft"}
      </Button>
    </form>
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

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4 sm:p-8">
      <Card
        className={`w-full ${
          user?.role === "OPERATOR" ? "max-w-4xl" : "max-w-md"
        } border-border bg-card shadow-2xl`}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Regulatory and licensing platform
          </p>
          <CardTitle>
            <h1 className="text-2xl">
              {user ? (workspace?.heading ?? "Workspace") : "Sign in"}
            </h1>
          </CardTitle>
          <CardDescription>
            {user
              ? `Signed in as ${user.username} · ${user.role.toLowerCase()}`
              : "Use your development operator or officer account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4" role="alert">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {user ? (
            <div className="space-y-5">
              {workspaceLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading workspace…
                </p>
              ) : workspace ? (
                user.role === "OPERATOR" ? (
                  <>
                    <p className="text-sm leading-6">{workspace.message}</p>
                    <OperatorDrafts />
                  </>
                ) : (
                  <p className="text-sm leading-6">{workspace.message}</p>
                )
              ) : (
                <Button variant="outline" onClick={() => loadWorkspace(user)}>
                  Retry workspace
                </Button>
              )}
              <Button
                className="w-full"
                onClick={signOut}
                disabled={submitting}
              >
                {submitting ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </main>
  );
}
