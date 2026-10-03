export type User = { username: string; role: "OPERATOR" | "OFFICER" };
export type Workspace = { heading: string; message: string; username: string };

type Csrf = { token: string; headerName: string };

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  if (response.status >= 500)
    return new Error(
      "The service is temporarily unavailable. Please try again.",
    );
  return new Error(fallback);
}

export async function getCsrf(): Promise<Csrf> {
  const response = await fetch("/api/auth/csrf");
  if (!response.ok)
    throw await responseError(response, "Unable to start a secure session");
  return response.json();
}

export async function me(): Promise<User | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok)
    throw await responseError(response, "Unable to restore your session");
  return response.json();
}

export async function login(
  username: string,
  password: string,
): Promise<User | null> {
  const csrf = await getCsrf();
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      [csrf.headerName]: csrf.token,
    },
    body: new URLSearchParams({ username, password }),
  });
  if (!response.ok) {
    throw await responseError(
      response,
      response.status === 401
        ? "Incorrect username or password"
        : "Sign in failed",
    );
  }

  // Spring Security rotates the session and CSRF token on authentication.
  await getCsrf();
  return me();
}

export async function workspace(role: User["role"]): Promise<Workspace> {
  const response = await fetch(`/api/workspaces/${role.toLowerCase()}`);
  if (!response.ok)
    throw await responseError(response, "Workspace could not be loaded");
  return response.json();
}

export async function logout(): Promise<void> {
  // Never reuse a pre-authentication token: fetch the token bound to the current session.
  const csrf = await getCsrf();
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { [csrf.headerName]: csrf.token },
  });
  if (!response.ok) throw await responseError(response, "Sign out failed");
}
