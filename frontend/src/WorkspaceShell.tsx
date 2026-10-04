import { useState, type ReactNode } from "react";
import { Bell, Files, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Notifications } from "@/Workflow";
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
  const [view, setView] = useState("applications");
  const [unread, setUnread] = useState(0);
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
            <Button
              variant="ghost"
              aria-label={`Notifications, ${unread} unread`}
              onClick={() => setView("notifications")}
            >
              <Bell data-icon="inline-start" aria-hidden="true" />
              {unread > 0 && (
                <Badge variant="info">
                  {unread}
                  <span className="sr-only"> new</span>
                </Badge>
              )}
            </Button>
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
        <Tabs value={view} onValueChange={(value) => setView(String(value))}>
          <TabsList
            variant="line"
            aria-label="Workspace navigation"
            className="mb-8"
          >
            <TabsTrigger value="applications">
              <Files data-icon="inline-start" />
              {user.role === "OPERATOR" ? "Applications" : "Review queue"}
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell data-icon="inline-start" />
              Notifications
            </TabsTrigger>
          </TabsList>
          <TabsContent value="applications" keepMounted>
            {children}
          </TabsContent>
          <TabsContent value="notifications" keepMounted>
            <Notifications
              onUnreadChange={setUnread}
              active={view === "notifications"}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
