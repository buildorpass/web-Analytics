import type { ClassifiedDailyChangeReport } from "./daily-change-report";

export interface AiReportChange {
  label: string;
  verdict: "good" | "bad" | "neutral";
  detail: string;
}

export interface AiDailyReport {
  headline: string;
  summary: string;
  changes: AiReportChange[];
  actionItems: string[];
  confidenceNote: string;
}

export type AiConfigStatus =
  | { configured: true; apiKey: string; model: string }
  | { configured: false };

const SYSTEM_PROMPT = `You interpret pre-computed website analytics deltas for a single UTC day.

Rules:
- Do NOT compute or invent numbers. Only use values provided in the input JSON.
- Respect each metric's "direction" and "confidence" labels exactly.
- Do NOT upgrade a low-confidence change into a firm good/bad call. For low-confidence items, describe them as within normal daily variation.
- When sampleSize is small, say variation may be noise in confidenceNote and avoid alarmist language.
- For new referrers (label "verify"), recommend checking they are not bots/scrapers — verdict must be neutral.
- Action items must be specific and grounded in the provided data. Return an empty actionItems array if nothing meaningful warrants action.
- No hype, no filler. Plain English, 2-4 sentences in summary.
- Return STRICT JSON only matching the required schema. No markdown.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          verdict: { type: "string", enum: ["good", "bad", "neutral"] },
          detail: { type: "string" },
        },
        required: ["label", "verdict", "detail"],
        additionalProperties: false,
      },
    },
    actionItems: { type: "array", items: { type: "string" } },
    confidenceNote: { type: "string" },
  },
  required: ["headline", "summary", "changes", "actionItems", "confidenceNote"],
  additionalProperties: false,
} as const;

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function getAiConfig(): AiConfigStatus {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false };
  }
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  return { configured: true, apiKey, model };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function isValidReport(value: unknown): value is AiDailyReport {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.headline !== "string" || typeof r.summary !== "string") return false;
  if (typeof r.confidenceNote !== "string") return false;
  if (!Array.isArray(r.changes) || !Array.isArray(r.actionItems)) return false;
  return r.changes.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof (c as AiReportChange).label === "string" &&
      typeof (c as AiReportChange).detail === "string" &&
      ["good", "bad", "neutral"].includes((c as AiReportChange).verdict)
  );
}

export function parseAiReportResponse(raw: string): AiDailyReport | null {
  try {
    const parsed: unknown = JSON.parse(stripCodeFences(raw));
    return isValidReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Calls OpenAI Chat Completions API (POST /v1/chat/completions) with json_schema
 * structured output. Verified against OpenAI docs on 2026-07-05.
 * Model defaults to gpt-4o-mini; override with OPENAI_MODEL env if needed.
 */
export async function generateAiDailyReport(
  input: ClassifiedDailyChangeReport
): Promise<{ ok: true; report: AiDailyReport } | { ok: false; error: string }> {
  const config = getAiConfig();
  if (!config.configured) {
    return { ok: false, error: "not_configured" };
  }

  const userContent = JSON.stringify(input, null, 2);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Interpret this daily analytics delta JSON for site ${input.siteId} on ${input.date}:\n\n${userContent}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "daily_change_report",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: message };
  }

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: `OpenAI ${response.status}: ${body.slice(0, 200)}` };
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false, error: "Empty response from OpenAI" };
  }

  const report = parseAiReportResponse(content);
  if (!report) {
    return { ok: false, error: "Could not parse AI response as valid report JSON" };
  }

  return { ok: true, report };
}
