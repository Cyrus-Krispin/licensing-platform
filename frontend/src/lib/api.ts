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

export type Draft = {
  id: string;
  revision: number;
  status:
    | "DRAFT"
    | "APPLICATION_RECEIVED"
    | "UNDER_REVIEW"
    | "PENDING_PRE_SITE_RESUBMISSION"
    | "PRE_SITE_RESUBMITTED"
    | "APPROVED"
    | "REJECTED";
  updatedAt: string;
  legalName: string | null;
  tradingName: string | null;
  registrationNumber: string | null;
  structure: string | null;
  applicantName: string | null;
  applicantRole: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  premisesAddress?: string | null;
  premisesName?: string | null;
  unitApplicable?: boolean | null;
  unitNumber?: string | null;
  tenure?: "OWNED" | "RENTED" | null;
  businessType?: "CAFE" | "RESTAURANT" | null;
  preparationActivities?: string[];
  serviceModes?: string[];
  operatingHours?: Record<
    string,
    {
      closed: boolean;
      opens?: string | null;
      closes?: string | null;
      closesNextDay?: boolean | null;
    }
  >;
  proposedOpeningDate?: string | null;
  documentRequests?: Array<{
    id: string;
    type: string;
    applicability: "APPLICABLE" | "NOT_APPLICABLE" | "NEEDS_INPUT";
    reason: string;
    currentUpload?: EvidenceUpload | null;
  }>;
  completion?: {
    completed: number;
    required: number;
    percentage: number;
    unmetItemIds: string[];
  };
};

export type EvidenceUpload = {
  id: string;
  requestId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  ready: boolean;
};
export type UploadResult = {
  upload: EvidenceUpload;
  revision: number;
  currentDraft: Draft;
};
export async function uploadEvidence(
  applicationId: string,
  requestId: string,
  revision: number,
  key: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const csrf = await getCsrf();
  const data = new FormData();
  data.append("file", file);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/applications/${applicationId}/evidence/requests/${requestId}?expectedRevision=${revision}`,
    );
    request.setRequestHeader(csrf.headerName, csrf.token);
    request.setRequestHeader("Idempotency-Key", key);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(Math.round((100 * event.loaded) / event.total));
    };
    request.onerror = () =>
      reject(
        new ApiError("Upload failed. Your previous file is unchanged.", 0),
      );
    request.onload = () => {
      let body: { message?: string; fieldErrors?: Record<string, string> } = {};
      try {
        body = JSON.parse(request.responseText) as typeof body;
      } catch {
        body = {};
      }
      if (request.status >= 200 && request.status < 300)
        resolve(body as UploadResult);
      else
        reject(
          new ApiError(
            body.message ?? "Upload failed. Your previous file is unchanged.",
            request.status,
            body.fieldErrors,
          ),
        );
    };
    request.send(data);
  });
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}
async function draftResponse(response: Response): Promise<Draft> {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  throw new ApiError(
    body.message ?? "The draft could not be saved",
    response.status,
    body.fieldErrors,
  );
}
async function csrfRequest(path: string, init: RequestInit): Promise<Response> {
  const csrf = await getCsrf();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      [csrf.headerName]: csrf.token,
      ...init.headers,
    },
  });
}
export async function listDrafts(): Promise<Draft[]> {
  const response = await fetch("/api/applications");
  if (!response.ok)
    throw await responseError(response, "Drafts could not be loaded");
  return response.json();
}
export async function getDraft(id: string): Promise<Draft> {
  const response = await fetch(`/api/applications/${id}`);
  return draftResponse(response);
}
export async function createDraft(key: string): Promise<Draft> {
  return draftResponse(
    await csrfRequest("/api/applications", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: "{}",
    }),
  );
}
export async function saveDraft(
  id: string,
  revision: number,
  fields: Record<string, unknown>,
): Promise<Draft> {
  return draftResponse(
    await csrfRequest(`/api/applications/${id}/draft`, {
      method: "PATCH",
      body: JSON.stringify({ expectedRevision: revision, fields }),
    }),
  );
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

export type ProcessingStatus = {
  uploadId: string;
  requestId: string;
  state: "QUEUED" | "CHECKING" | "COMPLETE" | "ERROR";
  attempt: number;
  queuedAt: string;
  checkingAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};
export async function processingStatuses(
  applicationId: string,
): Promise<ProcessingStatus[]> {
  const response = await fetch(
    `/api/applications/${applicationId}/evidence/processing`,
  );
  if (!response.ok)
    throw await responseError(
      response,
      "Processing status could not be refreshed",
    );
  return response.json();
}
export async function retryProcessing(
  applicationId: string,
  uploadId: string,
  key: string,
): Promise<{ status: ProcessingStatus; resultingAttempt: number }> {
  const response = await csrfRequest(
    `/api/applications/${applicationId}/evidence/processing/${uploadId}/retry`,
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: "{}",
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.message ?? "The simulated check could not be retried",
      response.status,
    );
  }
  return response.json();
}

export type CaseSummary = {
  id: string;
  status: Draft["status"];
  revision: number;
  latestVersion: number;
  updatedAt: string;
  legalName: string | null;
};
export type CaseIssue = {
  id: string;
  kind: "FIELD" | "DOCUMENT" | "ADDITIONAL";
  target: string | null;
  text: string;
  title: string | null;
  state: "DRAFT" | "OPEN" | "AWAITING_REVIEW" | "RESOLVED" | "REISSUED";
  round: number;
  reviewedVersion: number;
  response: string | null;
};
export type CaseDetail = Omit<CaseSummary, "legalName" | "updatedAt"> & {
  round: number;
  working: Draft | null;
  versions: Array<{
    number: number;
    submittedBy: string;
    submittedAt: string;
    snapshot: Draft;
    accuracy: boolean;
    authority: boolean;
  }>;
  issues: CaseIssue[];
  events: Array<{
    id: string;
    type: string;
    actor: string;
    createdAt: string;
    versionNumber: number;
    detail: Record<string, unknown>;
  }>;
};
export type Notification = {
  id: string;
  applicationId: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};
async function workflowResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  throw new ApiError(
    body.message ?? "The workflow request failed. Please retry.",
    response.status,
    body.fieldErrors,
  );
}
export async function listCases(): Promise<CaseSummary[]> {
  return workflowResponse(await fetch("/api/cases"));
}
export async function getCase(id: string): Promise<CaseDetail> {
  return workflowResponse(await fetch(`/api/cases/${id}`));
}
export async function caseCommand(
  detail: CaseDetail,
  command: string,
  fields: Record<string, unknown>,
  key: string,
): Promise<CaseDetail> {
  return workflowResponse(
    await csrfRequest(`/api/cases/${detail.id}/${command}`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        expectedRevision: detail.revision,
        expectedVersion: detail.latestVersion,
        ...fields,
      }),
    }),
  );
}
export async function notifications(): Promise<Notification[]> {
  return workflowResponse(await fetch("/api/notifications"));
}
export async function readNotification(id: string): Promise<void> {
  const response = await csrfRequest(`/api/notifications/${id}/read`, {
    method: "POST",
    body: "{}",
  });
  if (!response.ok) await workflowResponse(response);
}
