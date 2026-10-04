import { Badge } from "@/components/ui/badge";
import type { Draft } from "@/lib/api";

const variants = {
  DRAFT: "secondary",
  APPLICATION_RECEIVED: "info",
  UNDER_REVIEW: "info",
  PENDING_PRE_SITE_RESUBMISSION: "warning",
  PRE_SITE_RESUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

export function StatusBadge({
  status,
  children,
}: {
  status: Draft["status"];
  children: string;
}) {
  return (
    <Badge
      variant={variants[status]}
      className="h-auto max-w-full whitespace-normal text-left"
    >
      {children}
    </Badge>
  );
}
