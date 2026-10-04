import { type ReactNode } from "react";
import { Files, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Notifications } from "@/Notifications";
import type { User } from "@/lib/api";

export function WorkspaceShell({
  user,
  heading,
  error,
  signingOut,
  onSignOut,
  children,
}: {
  user: User;
  heading: string;
  error: string;
  signingOut: boolean;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:block focus:p-4"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5" aria-hidden="true" />
            <span className="font-semibold">Licensing platform</span>
            <Badge variant="outline">
              {user.role === "OPERATOR" ? "Operator" : "Officer"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Notifications />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" aria-label="Profile menu" />}
              >
                <UserRound data-icon="inline-start" aria-hidden="true" />
                <span>{user.username}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    Signed in as {user.username}
                  </DropdownMenuLabel>
                  <DropdownMenuLabel>
                    {user.role === "OPERATOR"
                      ? "Operator account"
                      : "Officer account"}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onSignOut} disabled={signingOut}>
                    <LogOut aria-hidden="true" />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main
        id="workspace-content"
        tabIndex={-1}
        className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12"
      >
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">
          {heading}
        </h1>
        {error && (
          <Alert variant="destructive" className="mb-6" role="alert">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <nav aria-label="Workspace navigation" className="mb-8">
          <a
            href="#workspace-content"
            className="inline-flex items-center gap-2 border-b-2 py-2 text-sm font-medium"
            aria-current="page"
          >
            <Files className="size-4" aria-hidden="true" />
            {user.role === "OPERATOR" ? "Applications" : "Review queue"}
          </a>
        </nav>
        {children}
      </main>
    </div>
  );
}
