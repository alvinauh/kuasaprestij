import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  question: z.string().min(1).max(4000),
  conceptNote: z.string().max(4000).optional().default(""),
  subject: z.string().max(200).optional().default(""),
  topic: z.string().max(200).optional().default(""),
  language: z.string().max(20).optional().default("en"),
});

const MindNode: z.ZodType<{ label: string; children?: { label: string; children?: unknown[] }[] }> = z.lazy(() =>
  z.object({
    label: z.string(),
    children: z.array(MindNode).optional(),
  }),
);

const StudyPackSchema = z.object({
  mindMap: z.object({
    root: z.string(),
    branches: z.array(
      z.object({
        label: z.string(),
        children: z.array(z.object({ label: z.string() })).optional(),
      }),
    ),
  }),
  slides: z.array(
    z.object({
      title: z.string(),
      bullets: z.array(z.string()).min(1).max(6),
    }),
  ).min(3).max(7),
  notes: z.array(z.string()).min(3).max(10),
});

export type StudyPack = z.infer<typeof StudyPackSchema>;

export const generateStudyPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<StudyPack> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const isMs = data.language?.toLowerCase().startsWith("ms") || data.language?.toLowerCase().includes("malay");
    const langInstruction = isMs
      ? "Reply entirely in Bahasa Melayu."
      : "Reply entirely in English.";

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const prompt = `You are a teaching assistant. Generate a focused study pack for the following question.

Subject: ${data.subject || "(unspecified)"}
Topic: ${data.topic || "(unspecified)"}
Question: ${data.question}
Concept note: ${data.conceptNote || "(none provided)"}

Produce:
1) mindMap: a central root concept with 4-6 branches, each having 2-4 sub-nodes covering key sub-concepts, formulas, examples, and common pitfalls.
2) slides: 4-6 short teaching slides (title + 3-5 bullets each) that explain the concept progressively without revealing the final answer to the question.
3) notes: 5-8 concise important notes (key facts, formulas, definitions, exam tips).

Do NOT reveal the answer to the question. ${langInstruction}`;

    const { experimental_output } = await generateText({
      model,
      prompt,
      experimental_output: Output.object({ schema: StudyPackSchema }),
    });

    return experimental_output;
  });
