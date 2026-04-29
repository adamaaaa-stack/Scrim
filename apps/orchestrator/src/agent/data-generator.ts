import type {
  ChatCompletionRequest,
  OpenRouterClient,
  ToolDef,
} from "@ai-testing/shared/openrouter";
import { logger } from "../logger.js";

export type DataFlavor =
  | "default"
  | "edge_case_unicode"
  | "edge_case_long"
  | "edge_case_special_chars";

export interface FieldRequest {
  key: string;
  description: string;
}

export interface GenerateDataInput {
  fields: FieldRequest[];
  flavor?: DataFlavor;
}

export const GENERATE_TEST_DATA_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "generateTestData",
    description:
      "Generate realistic test data for filling forms. Returns an object keyed by your requested field names. Use this INSTEAD of inventing values like 'Test User' or 'asdf' — it produces realistic names (Aoife O'Brien, Sarah Chen, 이지원), valid-looking emails, formatted phone numbers, etc. Use 'flavor' to request adversarial edge cases.",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          description: "One entry per field you need.",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description:
                  "Key in the returned object, e.g. 'fullName', 'email'. Use camelCase.",
              },
              description: {
                type: "string",
                description:
                  "What this field should contain, e.g. 'Realistic full name', 'Valid email address', 'US phone number with formatting', 'Multi-line message between 50-200 characters'",
              },
            },
            required: ["key", "description"],
          },
        },
        flavor: {
          type: "string",
          enum: [
            "default",
            "edge_case_unicode",
            "edge_case_long",
            "edge_case_special_chars",
          ],
          description:
            "default = realistic everyday values. edge_case_unicode = non-Latin scripts (Korean, Arabic, etc). edge_case_long = near-max-length values. edge_case_special_chars = apostrophes, hyphens, diacritics, plus signs.",
        },
      },
      required: ["fields"],
    },
  },
};

const SYSTEM_PROMPT = `You generate realistic test data for QA. Output ONE JSON object keyed by the requested field keys, no commentary, no markdown.

Rules:
- Realistic > obviously fake. Prefer "Sarah Chen" / "Marcus Williams" / "Aoife O'Brien" over "Test User" / "John Doe".
- Emails: use @example.com or @test.local domains. Lowercase. No spaces.
- Phones: format like "+1 (555) 234-5678" for US.
- Multi-line text: actual sentences, not lorem ipsum.

Flavor adjustments:
- "edge_case_unicode": names from non-Latin scripts (이지원, 中村, محمد, Σοφία). Emails can include + tags.
- "edge_case_long": fields near max realistic length (255 chars), still valid format.
- "edge_case_special_chars": apostrophes (O'Brien, D'Angelo), hyphens (Mary-Beth), accents (José, Müller, Łukasz), plus tags in emails.

Output is consumed by code — return STRICTLY valid JSON with only the requested keys, all string values.`;

export async function generateTestData(
  llm: OpenRouterClient,
  input: GenerateDataInput,
): Promise<Record<string, string>> {
  if (input.fields.length === 0) return {};

  const flavor = input.flavor ?? "default";
  const fieldList = input.fields
    .map((f) => `- "${f.key}": ${f.description}`)
    .join("\n");

  const userMsg = `Flavor: ${flavor}\n\nFields:\n${fieldList}`;

  const req: ChatCompletionRequest = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    temperature: flavor === "default" ? 0.6 : 0.8,
    max_tokens: 1024,
  };

  const resp = await llm.chat(req);
  const raw = resp.choices[0]?.message.content?.trim() ?? "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn({ err: e, raw }, "generateTestData: invalid JSON, returning empty");
    return {};
  }

  // Coerce to string-only and only return the requested keys
  const out: Record<string, string> = {};
  for (const f of input.fields) {
    const v = parsed[f.key];
    if (v === undefined || v === null) continue;
    out[f.key] = typeof v === "string" ? v : String(v);
  }
  return out;
}
