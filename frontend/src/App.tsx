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
] as const;

function OperatorDrafts() {
  const [drafts, setDrafts] = useState<api.Draft[]>([]);
  const [draft, setDraft] = useState<api.Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading your drafts…");
  const [pendingCreateKey, setPendingCreateKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
    setStatus("Saving…");
    setErrors({});
    const data = new FormData(event.currentTarget);
    const fields = Object.fromEntries(
      fieldNames.map((field) => [
        field,
        String(data.get(field) ?? "") || null,
      ]),
    );
    try {
      const saved = await api.saveDraft(draft.id, draft.revision, fields);
      setDraft(saved);
      setDrafts((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setStatus(
        `Saved revision ${saved.revision}. Your draft will be available after sign in or reload.`,
      );
    } catch (cause) {
      const failure = cause as api.ApiError;
      setErrors(failure.fieldErrors ?? {});
      setStatus(
        failure.status === 409
          ? `${failure.message} Reload this page when you are ready; the values below are still here.`
          : failure.message,
      );
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
              className="w-full justify-between"
              onClick={() => {
                setDraft(item);
                setStatus("Saved draft opened.");
              }}
            >
              <span>{item.legalName || "Untitled draft"}</span>
              <span>Revision {item.revision}</span>
            </Button>
          ))}
        </div>
      </section>
    );
  }

  const input = (
    name: (typeof fieldNames)[number],
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
        defaultValue={draft[name] ?? ""}
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
    <form className="space-y-6" onSubmit={save}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Application draft</h2>
          <p className="text-xs text-muted-foreground">
            Drafts may be incomplete · revision {draft.revision}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setDraft(null)}>
          All drafts
        </Button>
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-medium">Business</legend>
        {input("legalName", "Legal name", true)}
        {input("tradingName", "Trading name")}
        {input("registrationNumber", "Registration number", true)}
        <div className="space-y-2">
          <Label htmlFor="structure">
            Business structure (required to submit)
          </Label>
          <select
            id="structure"
            name="structure"
            defaultValue={draft.structure ?? ""}
            aria-describedby={errors.structure ? "structure-error" : undefined}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Not set</option>
            <option value="SOLE_PROPRIETOR">Sole proprietor</option>
            <option value="PARTNERSHIP">Partnership</option>
            <option value="COMPANY">Company</option>
            <option value="OTHER">Other</option>
          </select>
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
          <select
            id="applicantRole"
            name="applicantRole"
            defaultValue={draft.applicantRole ?? ""}
            aria-describedby={
              errors.applicantRole ? "applicantRole-error" : undefined
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Not set</option>
            {["OWNER", "DIRECTOR", "EMPLOYEE", "REPRESENTATIVE"].map(
              (role) => (
                <option key={role}>{role}</option>
              ),
            )}
          </select>
          {errors.applicantRole && (
            <p id="applicantRole-error" className="text-sm text-destructive">
              {errors.applicantRole}
            </p>
          )}
        </div>
        {input("applicantEmail", "Contact email", true)}
        {input("applicantPhone", "Phone", true)}
      </fieldset>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      <Button type="submit">Save draft</Button>
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
      <Card className={`w-full ${user?.role === "OPERATOR" ? "max-w-4xl" : "max-w-md"} border-border bg-card shadow-2xl`}>
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
                user.role === "OPERATOR" ? <><p className="text-sm leading-6">{workspace.message}</p><OperatorDrafts /></> : <p className="text-sm leading-6">{workspace.message}</p>
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
