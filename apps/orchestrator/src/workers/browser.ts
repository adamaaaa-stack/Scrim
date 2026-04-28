import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { z } from "zod";
import { uploadScreenshot } from "../storage/screenshots.js";
import { logger } from "../logger.js";

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

export type ToolName =
  | "navigate"
  | "click"
  | "type"
  | "wait"
  | "screenshot"
  | "getDom";

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}

export interface Observation {
  ok: boolean;
  screenshotPath?: string;
  domSnippet?: string;
  consoleLog?: string[];
  url?: string;
  error?: string;
}

// ============================================================
// BrowserWorker
// ============================================================

export interface BrowserWorkerOptions {
  runId: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export class BrowserWorker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private stepIndex = 0;
  private consoleBuffer: string[] = [];

  constructor(private opts: BrowserWorkerOptions) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.opts.headless ?? true });
    this.context = await this.browser.newContext({
      viewport: this.opts.viewport ?? { width: 1280, height: 800 },
    });
    this.page = await this.context.newPage();

    this.page.on("console", (msg) => {
      this.consoleBuffer.push(`[${msg.type()}] ${msg.text()}`);
      if (this.consoleBuffer.length > 200) this.consoleBuffer.shift();
    });

    this.page.on("pageerror", (err) => {
      this.consoleBuffer.push(`[pageerror] ${err.message}`);
    });

    logger.info({ runId: this.opts.runId }, "browser worker started");
  }

  async stop(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
    logger.info({ runId: this.opts.runId }, "browser worker stopped");
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
            ? await this.page.locator(selector).first().innerHTML()
            : await this.page.content();
          return {
            ok: true,
            url: this.page.url(),
            domSnippet: html.slice(0, maxChars),
            consoleLog: [...this.consoleBuffer],
          };
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

  /** Capture screenshot + small DOM excerpt + console for the LLM to observe. */
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
    };
  }
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
];
