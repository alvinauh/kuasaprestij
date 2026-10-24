import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

// Single place to set the contact address shown on the legal pages.
export const LEGAL_CONTACT = "privacy@skor.space";
export const LEGAL_UPDATED = "24 October 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link
          to="/login"
          className="mb-6 inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
        <div className="mt-10 flex gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
        </div>
      </div>
    </main>
  );
}
