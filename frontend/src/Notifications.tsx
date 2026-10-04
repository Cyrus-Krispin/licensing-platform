import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import * as api from "@/lib/api";

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const inFlight = useRef(false);
  const unread = items.filter((item) => !item.readAt);
  const load = useCallback(async () => {
    const generation = ++request.current;
    setLoading(true);
    try {
      const next = await api.notifications();
      if (generation === request.current) {
        setItems(next);
        setError("");
      }
    } catch (cause) {
      if (generation === request.current) setError((cause as Error).message);
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function change(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
      await load();
    } catch (cause) {
      await load();
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void load();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            aria-label={`Notifications, ${unread.length} unread`}
          />
        }
      >
        <Bell data-icon="inline-start" aria-hidden="true" />
        {unread.length > 0 && (
          <Badge variant="info">
            {unread.length}
            <span className="sr-only"> new</span>
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(32rem,var(--available-height))] overflow-y-auto p-4"
      >
        <PopoverHeader>
          <PopoverTitle>Notifications · {unread.length} unread</PopoverTitle>
          <PopoverDescription>
            Application updates. Clearing notifications keeps your application
            history.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || loading}
            onClick={load}
          >
            Refresh notifications
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || loading || !unread.length}
            onClick={() =>
              change(() =>
                Promise.all(
                  unread.map((item) => api.readNotification(item.id)),
                ),
              )
            }
          >
            Mark all as read
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || loading || !items.length}
            onClick={() => change(api.clearNotifications)}
          >
            Clear all
          </Button>
        </div>
        {loading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading notifications…
          </p>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Notifications could not be updated</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !items.length && !error && (
          <p className="py-4 text-sm text-muted-foreground">
            You’re all caught up. New application updates will appear here.
          </p>
        )}
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 py-4 text-sm">
              <p className="break-words">
                {!item.readAt && (
                  <Badge variant="info" className="mr-2">
                    New
                  </Badge>
                )}
                {item.message}
              </p>
              <p className="text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()} ·{" "}
                {item.readAt ? "Read" : "Unread"}
              </p>
              {!item.readAt && (
                <Button
                  className="self-start"
                  size="sm"
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() => change(() => api.readNotification(item.id))}
                >
                  Mark as read
                </Button>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
