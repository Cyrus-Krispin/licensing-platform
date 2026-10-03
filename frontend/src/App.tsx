import { FormEvent, useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import * as api from "@/lib/api"

export default function App() {
  const [user, setUser] = useState<api.User | null>(null)
  const [workspace, setWorkspace] = useState<api.Workspace | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const loadWorkspace = useCallback(async (currentUser: api.User) => {
    setWorkspaceLoading(true)
    setError("")
    try {
      setWorkspace(await api.workspace(currentUser.role))
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  useEffect(() => {
    api.me()
      .then((currentUser) => {
        setUser(currentUser)
        if (currentUser) return loadWorkspace(currentUser)
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setRestoring(false))
  }, [loadWorkspace])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    const form = new FormData(event.currentTarget)
    try {
      const currentUser = await api.login(
        String(form.get("username")),
        String(form.get("password")),
      )
      setUser(currentUser)
      if (currentUser) await loadWorkspace(currentUser)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function signOut() {
    setSubmitting(true)
    setError("")
    try {
      await api.logout()
      setUser(null)
      setWorkspace(null)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (restoring) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6">
        <p role="status" className="text-sm text-muted-foreground">
          Restoring your session…
        </p>
      </main>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4 sm:p-8">
      <Card className="w-full max-w-md border-border bg-card shadow-2xl">
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
                <p className="text-sm leading-6">{workspace.message}</p>
              ) : (
                <Button variant="outline" onClick={() => loadWorkspace(user)}>
                  Retry workspace
                </Button>
              )}
              <Button className="w-full" onClick={signOut} disabled={submitting}>
                {submitting ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={signIn}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" autoComplete="username" required autoFocus />
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
  )
}
