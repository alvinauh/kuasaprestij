import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Skor" },
      { name: "description", content: "What Skor collects, why, who processes it, and your rights under Malaysia's PDPA." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Skor is a revision platform for Malaysian secondary school students (KSSM). This page explains what
        personal data we collect, why, who handles it, and the choices you have, in line with the Personal Data
        Protection Act 2010 (PDPA). Many of our users are under 18; parents and guardians are welcome to read
        this alongside their child.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> name, email address, role (student or teacher), form level, and your sign-in credentials (passwords are stored hashed by our authentication provider, never in plain text).</li>
        <li><b>Learning activity:</b> the questions you answer, whether each answer was right, the topic, time taken, mastery scores, quiz and game results, points and streaks.</li>
        <li><b>Class information:</b> the classes you join and, for teachers, the classes you create.</li>
        <li><b>Preferences:</b> language, theme, avatar and accessibility settings.</li>
        <li><b>Technical data:</b> error logs and request timings used to keep the service working.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account and show you questions suited to your level.</li>
        <li>To explain mistakes and track progress over time.</li>
        <li>To let teachers see how their own class is doing so they can help.</li>
        <li>To show a leaderboard. Other students only see a short display name, never your full name or ID.</li>
        <li>To find and fix faults and keep the service safe.</li>
      </ul>
      <p>We do not sell personal data and we do not show advertising.</p>

      <h2>Who can see it</h2>
      <ul>
        <li><b>You</b> can see your own data.</li>
        <li><b>Your teachers</b> can see learning data for students in their own classes.</li>
        <li><b>Skor administrators</b> can access data as needed to run and support the service.</li>
        <li><b>Other students</b> only see your leaderboard display name and score.</li>
      </ul>

      <h2>Service providers</h2>
      <p>We use trusted providers to run Skor. They process data on our behalf:</p>
      <ul>
        <li>Supabase: database and sign-in.</li>
        <li>AI language-model providers (for example DeepSeek, Mistral, Groq, Google Gemini and OpenRouter): to write and mark questions and explanations. Question text and your answer are sent to them; we do not send your name or email.</li>
        <li>Pexels (stock video), Google Cloud (hosting) and our web hosting provider.</li>
      </ul>
      <p>Some of these providers are outside Malaysia, so data may be processed abroad.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and learning history while your account is active. When an account is deleted, we
        delete or anonymise its personal data, except where the law requires us to keep something.
      </p>

      <h2>Your rights</h2>
      <p>
        You may ask to see the personal data we hold about you, correct it, or have your account and data
        deleted. A parent or guardian may make these requests for a child. Write to{" "}
        <a className="text-primary underline" href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and we will
        reply as soon as we can.
      </p>

      <h2>Security</h2>
      <p>
        Connections use HTTPS, access to data is limited by role, and passwords are never stored in plain text.
        No online service is perfectly secure; if we learn of a breach affecting you we will tell you.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will update the date above and tell signed-in users.</p>
    </LegalPage>
  );
}
