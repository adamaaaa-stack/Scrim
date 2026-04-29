import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright";
import { z } from "zod";
import { uploadScreenshot } from "../storage/screenshots.js";
import { uploadTrace } from "../storage/traces.js";
import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

export type DevicePreset = "desktop" | "iphone" | "ipad" | "android";

const DEVICE_PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  iphone: devices["iPhone 14 Pro"],
  ipad: devices["iPad Pro 11"],
  android: devices["Pixel 7"],
} as const;

// ============================================================
// Tool argument schemas — these double as JSON-schema for the LLM
// ============================================================

export const NavigateArgs = z.object({ url: z.string().url() });
export const ClickArgs = z.object({
  selector: z.string().min(1),
  description: z.string().optional(),
});
export const TypeArgs = z.object({
  selector: z.string().min(1),
  text: z.string(),
  pressEnter: z.boolean().default(false),
});
export const WaitArgs = z.object({
  selector: z.string().optional(),
  ms: z.number().int().positive().max(30000).optional(),
});
export const ScreenshotArgs = z.object({ fullPage: z.boolean().default(false) });
export const GetDomArgs = z.object({
  selector: z.string().optional(),
  maxChars: z.number().int().positive().max(50000).default(8000),
});
export const EvaluateArgs = z.object({
  expression: z.string().min(1),
  description: z.string().optional(),
});
export const GetAccessibilityArgs = z.object({
  selector: z.string().default("body"),
});
export const SetViewportArgs = z
  .object({
    width: z.number().int().min(320).max(3840).optional(),
    height: z.number().int().min(240).max(2160).optional(),
    preset: z.enum(["iphone", "ipad", "desktop", "android"]).optional(),
  })
  .refine(
    (d) => d.preset !== undefined || (d.width !== undefined && d.height !== undefined),
    { message: "Provide either preset or both width and height" },
  );

export const SignInArgs = z.object({
  credentialName: z.string().min(1),
  fields: z
    .array(
      z.object({
        credentialField: z.string().min(1),
        selector: z.string().min(1),
      }),
    )
    .min(1, "fields must include at least one entry"),
  submitSelector: z.string().optional(),
  pressEnterAfter: z.boolean().default(false),
});

export type ToolName =
  | "navigate"
  | "click"
  | "type"
  | "wait"
  | "screenshot"
  | "getDom"
  | "evaluate"
  | "getAccessibility"
  | "setViewport"
  | "signIn";

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}

export interface NetworkEntry {
  ts: number;
  method?: string;
  status?: number;
  url: string;
  resourceType?: string;
  failed?: boolean;
}

export interface Observation {
  ok: boolean;
  screenshotPath?: string;
  domSnippet?: string;
  consoleLog?: string[];
  networkLog?: NetworkEntry[];
  url?: string;
  error?: string;
  evaluateResult?: unknown;
  accessibilitySnippet?: string;
  viewport?: { width: number; height: number };
}

// ============================================================
// BrowserWorker
// ============================================================

export interface BrowserWorkerOptions {
  runId: string;
  projectId: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  devicePreset?: DevicePreset;
  recordTrace?: boolean;
}

const VIEWPORT_PRESETS = {
  iphone: { width: 390, height: 844 },
  ipad: { width: 1024, height: 1366 },
  android: { width: 412, height: 915 },
  desktop: { width: 1280, height: 800 },
} as const;

export class BrowserWorker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private stepIndex = 0;
  private consoleBuffer: string[] = [];
  private networkBuffer: NetworkEntry[] = [];
  private viewport: { width: number; height: number };
  private traceDir: string | null = null;
  private tracePath: string | null = null;

  constructor(private opts: BrowserWorkerOptions) {
    const preset = opts.devicePreset ?? "desktop";
    const profile = DEVICE_PROFILES[preset];
    const profileViewport = "viewport" in profile && profile.viewport ? profile.viewport : undefined;
    this.viewport = opts.viewport ?? profileViewport ?? VIEWPORT_PRESETS.desktop;
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.opts.headless ?? true });
    const preset = this.opts.devicePreset ?? "desktop";
    const profile = DEVICE_PROFILES[preset];
    this.context = await this.browser.newContext({
      ...profile,
      viewport: this.viewport,
    });
    if (this.opts.recordTrace) {
      this.traceDir = await mkdtemp(join(tmpdir(), `trace-${this.opts.runId}-`));
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });
    }
    this.page = await this.context.newPage();

    this.page.on("console", (msg) => {
      this.consoleBuffer.push(`[${msg.type()}] ${msg.text()}`);
      if (this.consoleBuffer.length > 200) this.consoleBuffer.shift();
    });

    this.page.on("pageerror", (err) => {
      this.consoleBuffer.push(`[pageerror] ${err.message}`);
    });

    this.page.on("request", (req) => {
      this.networkBuffer.push({
        ts: Date.now(),
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
      });
      if (this.networkBuffer.length > 500) this.networkBuffer.shift();
    });

    this.page.on("response", (res) => {
      this.networkBuffer.push({
        ts: Date.now(),
        status: res.status(),
        url: res.url(),
        failed: res.status() >= 400,
      });
      if (this.networkBuffer.length > 500) this.networkBuffer.shift();
    });

    this.page.on("requestfailed", (req) => {
      this.networkBuffer.push({
        ts: Date.now(),
        method: req.method(),
        url: req.url(),
        failed: true,
      });
      if (this.networkBuffer.length > 500) this.networkBuffer.shift();
    });

    logger.info({ runId: this.opts.runId }, "browser worker started");
  }

  async stop(): Promise<void> {
    if (this.context && this.opts.recordTrace && this.traceDir) {
      const localPath = join(this.traceDir, "trace.zip");
      try {
        await this.context.tracing.stop({ path: localPath });
        this.tracePath = await uploadTrace({ runId: this.opts.runId, localPath });
      } catch (err) {
        logger.warn({ err, runId: this.opts.runId }, "trace upload failed");
      }
    }
    await this.context?.close();
    await this.browser?.close();
    if (this.traceDir) {
      await rm(this.traceDir, { recursive: true, force: true }).catch(() => {});
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    logger.info({ runId: this.opts.runId, tracePath: this.tracePath }, "browser worker stopped");
  }

  /** Available after stop() if recordTrace was true. */
  getTracePath(): string | null {
    return this.tracePath;
  }

  async execute(call: ToolCall): Promise<Observation> {
    if (!this.page) throw new Error("Worker not started");
    this.stepIndex += 1;

    try {
      switch (call.name) {
        case "navigate": {
          const { url } = NavigateArgs.parse(call.args);
          await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          return await this.snapshot();
        }
        case "click": {
          const { selector } = ClickArgs.parse(call.args);
          await this.page.click(selector, { timeout: 10000 });
          return await this.snapshot();
        }
        case "type": {
          const { selector, text, pressEnter } = TypeArgs.parse(call.args);
          await this.page.fill(selector, text, { timeout: 10000 });
          if (pressEnter) await this.page.press(selector, "Enter");
          return await this.snapshot();
        }
        case "wait": {
          const { selector, ms } = WaitArgs.parse(call.args);
          if (selector) {
            await this.page.waitForSelector(selector, { timeout: 15000 });
          } else if (ms) {
            await this.page.waitForTimeout(ms);
          }
          return await this.snapshot();
        }
        case "screenshot": {
          const { fullPage } = ScreenshotArgs.parse(call.args);
          return await this.snapshot({ fullPage });
        }
        case "getDom": {
          const { selector, maxChars } = GetDomArgs.parse(call.args);
          const html = selector
            ? await this.page
                .locator(selector)
                .first()
                .innerHTML({ timeout: 5000 })
            : await this.page.content();
          return {
            ok: true,
            url: this.page.url(),
            domSnippet: html.slice(0, maxChars),
            consoleLog: [...this.consoleBuffer],
            networkLog: this.recentNetwork(),
          };
        }
        case "evaluate": {
          const { expression } = EvaluateArgs.parse(call.args);
          const decoded = decodeHtmlEntities(expression);
          // Wrap so both single expressions ("document.title") and multi-
          // statement bodies ("const x = 1; return x;") work. If the user's
          // input doesn't contain `return`, prepend one for the common case.
          const looksLikeBody = /\breturn\b/.test(decoded) || decoded.trim().startsWith("(");
          const body = looksLikeBody ? decoded : `return (${decoded});`;
          const result = await this.page.evaluate(
            new Function(`return (async () => { ${body} })();`) as () => Promise<unknown>,
          );
          const obs = await this.snapshot();
          return { ...obs, evaluateResult: serializeForLLM(result) };
        }
        case "getAccessibility": {
          const { selector } = GetAccessibilityArgs.parse(call.args);
          const snapshot = await this.page.locator(selector).ariaSnapshot();
          const obs = await this.snapshot();
          return { ...obs, accessibilitySnippet: snapshot.slice(0, 8000) };
        }
        case "setViewport": {
          const args = SetViewportArgs.parse(call.args);
          let size: { width: number; height: number };
          if (args.preset) {
            size = VIEWPORT_PRESETS[args.preset];
          } else {
            // refine() guarantees both are defined here
            size = { width: args.width!, height: args.height! };
          }
          await this.page.setViewportSize(size);
          this.viewport = size;
          const obs = await this.snapshot();
          return { ...obs, viewport: size };
        }
        case "signIn": {
          const args = SignInArgs.parse(call.args);
          const credFields = await loadCredentialFields(
            this.opts.projectId,
            args.credentialName,
          );
          if (!credFields) {
            const available = await listAvailableCredentialNames(this.opts.projectId);
            return {
              ok: false,
              error:
                `Credential '${args.credentialName}' not found for this project. ` +
                (available.length > 0
                  ? `Available credential names: [${available.join(", ")}]. Use one of these EXACT names.`
                  : `No credentials are configured. Ask the user to add one in the project settings.`),
            };
          }
          const orderedSelectors: string[] = [];
          for (const { credentialField, selector } of args.fields) {
            const value = credFields[credentialField];
            if (value === undefined) {
              return {
                ok: false,
                error: `Credential '${args.credentialName}' has no field '${credentialField}'. Available fields: ${Object.keys(credFields).join(", ")}`,
              };
            }
            await this.page.fill(selector, value, { timeout: 10000 });
            orderedSelectors.push(selector);
          }
          if (args.submitSelector) {
            await this.page.click(args.submitSelector, { timeout: 10000 });
          } else if (args.pressEnterAfter && orderedSelectors.length > 0) {
            const last = orderedSelectors[orderedSelectors.length - 1]!;
            await this.page.press(last, "Enter");
          }
          // Wait for any navigation triggered by submit, then snapshot.
          await this.page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
          return await this.snapshot();
        }
        default: {
          const _exhaustive: never = call.name;
          return { ok: false, error: `Unknown tool: ${_exhaustive}` };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ runId: this.opts.runId, call, err: message }, "tool call failed");
      const obs = await this.snapshot().catch(() => ({} as Observation));
      return { ...obs, ok: false, error: message };
    }
  }

  /** Capture screenshot + small DOM excerpt + console + network for the LLM to observe. */
  private async snapshot(opts: { fullPage?: boolean } = {}): Promise<Observation> {
    if (!this.page) throw new Error("Page closed");
    const buffer = await this.page.screenshot({
      type: "png",
      fullPage: opts.fullPage ?? false,
    });
    const screenshotPath = await uploadScreenshot({
      runId: this.opts.runId,
      stepIndex: this.stepIndex,
      buffer,
    });
    const html = await this.page.content();
    return {
      ok: true,
      url: this.page.url(),
      screenshotPath,
      domSnippet: html.slice(0, 8000),
      consoleLog: [...this.consoleBuffer],
      networkLog: this.recentNetwork(),
      viewport: this.viewport,
    };
  }

  /** Last 30 network entries — enough for the agent to reason about, small enough for tokens. */
  private recentNetwork(): NetworkEntry[] {
    return this.networkBuffer.slice(-30);
  }
}

/** Make page.evaluate results LLM-safe (truncate, strip non-JSON). */
function serializeForLLM(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    if (json.length > 4000) return JSON.parse(json.slice(0, 4000) + '"...[truncated]"');
    return value;
  } catch {
    return String(value).slice(0, 4000);
  }
}

/** Decode the most common HTML entities Grok sometimes emits in tool args. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Look up a stored credential set by name for the given project.
 * Returns the field map ({username, password, ...}) or null if not found.
 * Never logs the values — only the lookup attempt.
 */
async function loadCredentialFields(
  projectId: string,
  name: string,
): Promise<Record<string, string> | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("credentials")
    .select("fields")
    .eq("project_id", projectId)
    .eq("name", name)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error.message, projectId, name }, "credential lookup failed");
    return null;
  }
  if (!data?.fields) return null;
  return data.fields as Record<string, string>;
}

/** List all credential names for a project (used in error messages). */
async function listAvailableCredentialNames(projectId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("credentials")
    .select("name")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
  return (data ?? []).map((row) => row.name as string);
}

// ============================================================
// JSON Schemas for OpenRouter tool definitions
// (kept here so the agent loop can import them alongside the worker)
// ============================================================

export const BROWSER_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "navigate",
      description: "Load a URL in the browser. Use this to start a flow.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute URL to load" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "click",
      description: "Click the first element matching the CSS selector.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector or Playwright locator" },
          description: { type: "string", description: "What this click is meant to accomplish" },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "type",
      description: "Fill a form field with text. Optionally press Enter after.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          text: { type: "string" },
          pressEnter: { type: "boolean", description: "Press Enter after typing" },
        },
        required: ["selector", "text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "wait",
      description: "Wait for a selector to appear, or wait a fixed time.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Wait for this selector" },
          ms: { type: "integer", description: "Or wait this many milliseconds" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "screenshot",
      description: "Capture the current page state. Use to verify visual outcomes.",
      parameters: {
        type: "object",
        properties: {
          fullPage: { type: "boolean", description: "Capture full scrollable page" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getDom",
      description: "Read the page DOM (or a specific element). Use to assert text content.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          maxChars: { type: "integer", description: "Truncate to this many chars" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "evaluate",
      description:
        "Run a JavaScript expression in the page context and return its value. Use for programmatic checks like \"document.images.length\", \"performance.timing.loadEventEnd - performance.timing.navigationStart\", or \"Array.from(document.querySelectorAll('img')).every(i => i.complete && i.naturalHeight > 0)\". Result is JSON-serialized.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "JS expression (await is allowed)" },
          description: { type: "string", description: "What this check is verifying" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getAccessibility",
      description:
        "Get the page's aria snapshot (semantic YAML tree of roles, names, landmarks, headings, interactive elements). Better than raw DOM for understanding navigation. Default selector is 'body' for the whole page.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Locator (default 'body')" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "setViewport",
      description:
        "Resize the browser viewport. Use a preset (iphone, ipad, desktop) for responsive checks, or pass explicit width/height.",
      parameters: {
        type: "object",
        properties: {
          preset: { type: "string", enum: ["iphone", "ipad", "desktop"] },
          width: { type: "integer" },
          height: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "signIn",
      description:
        "Sign into an authenticated app using a stored credential set. Values are filled internally and NEVER appear in step history or your reasoning. Provide credentialName plus an array of {credentialField, selector} pairs — one entry per form field to fill. Then optionally submit via submitSelector or pressEnterAfter.",
      parameters: {
        type: "object",
        properties: {
          credentialName: {
            type: "string",
            description: "Name of the stored credential set (configured in project settings)",
          },
          fields: {
            type: "array",
            description:
              "One entry per form field. credentialField is the name in the stored credential (e.g. 'username', 'password'); selector is the CSS selector to type that value into.",
            items: {
              type: "object",
              properties: {
                credentialField: {
                  type: "string",
                  description: "Field name from the stored credential, e.g. 'username' or 'password'",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for the input element to fill",
                },
              },
              required: ["credentialField", "selector"],
            },
            minItems: 1,
          },
          submitSelector: {
            type: "string",
            description: "Optional selector to click after filling all fields",
          },
          pressEnterAfter: {
            type: "boolean",
            description: "Press Enter on the last filled field instead of clicking a submit selector",
          },
        },
        required: ["credentialName", "fields"],
      },
    },
  },
];
