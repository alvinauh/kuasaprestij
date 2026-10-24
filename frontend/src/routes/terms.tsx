import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Skor" },
      { name: "description", content: "The rules for using Skor, the KSSM revision platform." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>By creating an account or using Skor you agree to these terms. If you are under 18, please read them with a parent or guardian.</p>

      <h2>What Skor is</h2>
      <p>
        Skor is a study aid for KSSM revision. Questions, explanations and feedback are written with the help of
        AI and checked automatically, but they can still contain mistakes. Always check important facts against
        your textbook and teacher. Skor does not replace your school or guarantee exam results.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate information and keep your password private.</li>
        <li>You are responsible for activity on your account.</li>
        <li>Teachers must only add or invite students they teach.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to break, overload or probe the service, or access other people's data.</li>
        <li>Do not share answer keys in bulk, scrape the service, or use bots to play for you.</li>
        <li>Be respectful in live games and class features. No harassment, hate or inappropriate content.</li>
      </ul>

      <h2>Content</h2>
      <p>
        Skor's questions, design and software belong to Skor or its licensors. You may use them for your own
        study. Your answers and activity stay yours, and you let us use them to provide the service as described
        in the <a className="text-primary underline" href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Availability</h2>
      <p>We work to keep Skor running but cannot promise it will always be available or error-free. We may change or stop features.</p>

      <h2>Ending your account</h2>
      <p>You can ask us to delete your account at any time. We may suspend accounts that break these terms.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, Skor is provided "as is" and we are not liable for indirect losses from using it.</p>

      <h2>Governing law and contact</h2>
      <p>
        These terms are governed by the laws of Malaysia. Questions:{" "}
        <a className="text-primary underline" href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
