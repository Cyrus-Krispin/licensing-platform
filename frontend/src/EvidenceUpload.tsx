import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";

export function EvidenceUpload({
  applicationId,
  revision,
  request,
  disabled,
  onCommitted,
  onBusyChange,
  onPendingChange,
}: {
  applicationId: string;
  revision: number;
  request: NonNullable<api.Draft["documentRequests"]>[number];
  disabled: boolean;
  onCommitted: (result: api.UploadResult) => void;
  onBusyChange: (busy: boolean) => void;
  onPendingChange: (pending: boolean) => void;
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const discardSelection = useEffectEvent(() => {
    setFile(null);
    setKey(null);
    setMessage("");
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    onPendingChange(false);
  });
  useEffect(() => {
    if (request.applicability !== "APPLICABLE" && file) {
      void Promise.resolve().then(() => discardSelection());
    }
  }, [request.applicability, file]);
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
      const result = await api.retryProcessing(
        applicationId,
        request.currentUpload.id,
        retryKey,
      );
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
    onPendingChange(!!next);
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
      if (inputRef.current) inputRef.current.value = "";
      onPendingChange(false);
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
        <p className="min-w-0 text-sm">
          <Badge variant="success" className="mb-2">
            Saved file
          </Badge>
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
        <p className="text-xs text-muted-foreground">
          Your saved file stays attached when you save the draft. Choose another
          file only to replace it.
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
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={disabled || uploading}
              className="min-w-0 max-w-full"
              onChange={(event) => choose(event.target.files?.item(0) ?? null)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Choosing a file does not upload it. Use{" "}
              {request.currentUpload ? "Replace file" : "Upload file"} below to
              save it. PDF, JPEG, or PNG · maximum 10,000,000 bytes. You can
              also drop a file here.
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
