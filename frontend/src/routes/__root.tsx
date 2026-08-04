import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { toast } from "sonner";

import appCss from "../styles.css?url";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isViewingAsStudent } from "@/lib/viewAs";
import { supabase } from "@/integrations/supabase/client";
import { installGlobalErrorLogger } from "@/lib/log-app-error";
import { Toaster } from "@/components/ui/sonner";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description", content: "A gamified AI learning platform for high school students, offering interactive lessons and analytics." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "A gamified AI learning platform for high school students, offering interactive lessons and analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lovable App" },
      { name: "twitter:description", content: "A gamified AI learning platform for high school students, offering interactive lessons and analytics." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6f778d41-7e80-4afe-971c-accbc658a6b4/id-preview-a3e6fa16--cceb4829-0739-4970-91b6-4280f8430747.lovable.app-1780365122547.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6f778d41-7e80-4afe-971c-accbc658a6b4/id-preview-a3e6fa16--cceb4829-0739-4970-91b6-4280f8430747.lovable.app-1780365122547.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installGlobalErrorLogger();
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <RouteGuard>
            <Outlet />
          </RouteGuard>
          <Toaster />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

const PUBLIC_PATHS = new Set(["/login", "/reset-password"]);

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const isPublic = PUBLIC_PATHS.has(path);

  useEffect(() => {
    // Capture an invite code the instant it appears in the URL — before the
    // login redirect / email-confirmation round-trip strips the query string.
    // Stashed in localStorage and consumed below once a student profile loads.
    if (typeof window !== "undefined") {
      const invite = new URLSearchParams(window.location.search).get("invite");
      if (invite?.trim()) {
        localStorage.setItem("kp_pending_invite", invite.trim());
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url.toString());
      }
    }

    if (loading) return;
    if (!user) {
      if (!isPublic) void navigate({ to: "/login" });
      return;
    }
    // Signed in as a student: consume any pending invite (survives redirects).
    // Only students self-enroll — the RPC inserts auth.uid() as the member, so
    // a teacher/admin opening the link would enroll themselves; skip them.
    if (typeof window !== "undefined" && profile?.role === "student") {
      const pending = localStorage.getItem("kp_pending_invite");
      if (pending) {
        localStorage.removeItem("kp_pending_invite");
        void (async () => {
          // RPC is SECURITY DEFINER + idempotent (ON CONFLICT DO NOTHING).
          const { data, error } = await supabase.rpc("join_classroom_by_code", { _code: pending });
          if (error) {
            console.warn("[Skor] invite-link join failed:", error.message);
            toast.error("Couldn't join the class — check the invite code with your teacher.");
            return;
          }
          const row = Array.isArray(data) ? data[0] : data;
          const name = (row?.classroom_name as string) ?? "the class";
          toast.success(row?.already_member ? `You're already in ${name}.` : `Joined ${name}!`);
        })();
      }
    }
    // Signed in: enforce role-based home
    if (!profile) return;
    // Never redirect away from the password recovery page — Supabase
    // establishes a temporary session here so the user can update their password.
    if (path === "/reset-password") return;
    if (path === "/login") {
      void navigate({ to: (profile.role === "teacher" || profile.role === "admin") ? "/teacher" : "/" });
      return;
    }
    if (profile.role === "student" && path.startsWith("/teacher")) {
      void navigate({ to: "/" });
    }
    // Teachers/admins are bounced from the student routes to their dashboard,
    // UNLESS they've deliberately switched to "view as student" (the swap
    // toggle). This is also why a teacher/admin never silently lands on the
    // student view: without the toggle they're always routed to /teacher.
    if (
      (profile.role === "teacher" || profile.role === "admin") &&
      (path === "/" || path === "/dashboard") &&
      !isViewingAsStudent()
    ) {
      void navigate({ to: "/teacher" });
    }
  }, [user, profile, loading, path, isPublic, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!user && !isPublic) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
