import fs from 'fs';
import path from 'path';
import { Locator, Page } from 'playwright';
import { env } from '../config/env';
import { REPORTS_DIR } from '../config/paths';
import { FrameworkLogger } from '../logger/logger';
import { chatLlm } from '../ai/llmClient';
import { getActivityReporter } from '../reports/extent/ActivityReporter';

export type HealStrategy = 'cache' | 'role' | 'text' | 'placeholder' | 'label' | 'css' | 'llm';

export interface HealCandidate {
  strategy: HealStrategy;
  description: string;
  locator: Locator;
}

export interface HealResult {
  strategy: HealStrategy;
  description: string;
  locator: Locator;
  fromCache: boolean;
}

interface CachedHeal {
  key: string;
  name: string;
  urlPath: string;
  strategy: HealStrategy;
  description: string;
  /** Playwright selector engine string, e.g. role=button[name="Sign in"] */
  selector: string;
  healedAt: string;
  hits: number;
}

const STORE_DIR = path.join(REPORTS_DIR, 'self-heal');
const STORE_FILE = path.join(STORE_DIR, 'healed-locators.json');

function pageKey(page: Page, name: string): string {
  let pathname = '/';
  try {
    pathname = new URL(page.url()).pathname;
  } catch {
    pathname = page.url() || '/';
  }
  return `${pathname}::${name.trim().toLowerCase()}`;
}

function loadCache(): Record<string, CachedHeal> {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Record<string, CachedHeal>;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CachedHeal>): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function remember(page: Page, name: string, strategy: HealStrategy, description: string, selector: string): void {
  const cache = loadCache();
  const key = pageKey(page, name);
  const existing = cache[key];
  cache[key] = {
    key,
    name,
    urlPath: (() => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return page.url();
      }
    })(),
    strategy,
    description,
    selector,
    healedAt: new Date().toISOString(),
    hits: (existing?.hits || 0) + 1,
  };
  saveCache(cache);
}

function locatorFromSelector(page: Page, selector: string): Locator {
  return page.locator(selector).first();
}

function heuristicCandidates(page: Page, name: string): Array<{ strategy: HealStrategy; description: string; selector: string; locator: Locator }> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const roleNames = ['button', 'link', 'tab', 'textbox', 'combobox', 'menuitem', 'option', 'checkbox', 'radio'] as const;
  const out: Array<{ strategy: HealStrategy; description: string; selector: string; locator: Locator }> = [];

  for (const role of roleNames) {
    const selector = `role=${role}[name="${trimmed}"]`;
    out.push({
      strategy: 'role',
      description: `getByRole('${role}', { name: '${trimmed}' })`,
      selector,
      locator: page.getByRole(role, { name: new RegExp(escapeRegExp(trimmed), 'i') }).first(),
    });
  }

  out.push(
    {
      strategy: 'text',
      description: `getByText('${trimmed}')`,
      selector: `text=${trimmed}`,
      locator: page.getByText(trimmed, { exact: false }).first(),
    },
    {
      strategy: 'placeholder',
      description: `getByPlaceholder('${trimmed}')`,
      selector: `placeholder=${trimmed}`,
      locator: page.getByPlaceholder(new RegExp(escapeRegExp(trimmed), 'i')).first(),
    },
    {
      strategy: 'label',
      description: `getByLabel('${trimmed}')`,
      selector: `label=${trimmed}`,
      locator: page.getByLabel(new RegExp(escapeRegExp(trimmed), 'i')).first(),
    },
    {
      strategy: 'css',
      description: `[aria-label*='${trimmed}']`,
      selector: `[aria-label*="${trimmed}" i]`,
      locator: page.locator(`[aria-label*="${trimmed}" i]`).first(),
    },
    {
      strategy: 'css',
      description: `[title*='${trimmed}']`,
      selector: `[title*="${trimmed}" i]`,
      locator: page.locator(`[title*="${trimmed}" i]`).first(),
    },
  );

  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function isActionable(locator: Locator, timeout: number): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    const count = await locator.count();
    if (count < 1) return false;
    const enabled = await locator.isEnabled().catch(() => true);
    return enabled;
  } catch {
    return false;
  }
}

async function collectDomHints(page: Page): Promise<string> {
  try {
    const hints = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('button, a, input, select, textarea, [role], [aria-label], label'),
      ).slice(0, 80);
      return nodes.map((el) => {
        const html = el as HTMLElement;
        return {
          tag: html.tagName.toLowerCase(),
          role: html.getAttribute('role') || '',
          name:
            html.getAttribute('aria-label') ||
            html.getAttribute('name') ||
            html.getAttribute('placeholder') ||
            html.getAttribute('title') ||
            (html.textContent || '').trim().slice(0, 80),
          type: html.getAttribute('type') || '',
          id: html.id || '',
          testId: html.getAttribute('data-testid') || '',
        };
      });
    });
    return JSON.stringify(hints, null, 2);
  } catch {
    return '[]';
  }
}

async function suggestWithLlm(
  page: Page,
  name: string,
  action: string,
  errorMessage: string,
  logger?: FrameworkLogger,
): Promise<{ strategy: HealStrategy; description: string; selector: string; locator: Locator } | undefined> {
  if (!env.selfHealUseLlm || !env.llmEnabled || !env.llmApiKey) {
    return undefined;
  }

  const domHints = await collectDomHints(page);
  const prompt = [
    {
      role: 'system' as const,
      content:
        'You repair broken Playwright locators. Reply with JSON only: {"selector":"playwright selector","reason":"..."}. Prefer role=/text=/placeholder=/label=/css selectors. No markdown.',
    },
    {
      role: 'user' as const,
      content: `Action: ${action}\nElement name: ${name}\nURL: ${page.url()}\nError: ${errorMessage}\nInteractive DOM hints:\n${domHints}`,
    },
  ];

  try {
    const raw = await chatLlm(prompt, { format: 'json', skipRoute: true, model: env.llmRouterModel });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return undefined;
    const parsed = JSON.parse(jsonMatch[0]) as { selector?: string; reason?: string };
    const selector = parsed.selector?.trim();
    if (!selector) return undefined;
    logger?.info(`Self-heal LLM suggested selector: ${selector} (${parsed.reason || 'no reason'})`);
    return {
      strategy: 'llm',
      description: `LLM: ${selector}`,
      selector,
      locator: locatorFromSelector(page, selector),
    };
  } catch (error) {
    logger?.warn(`Self-heal LLM suggestion failed: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

/**
 * When SELF_HEAL_ENABLED=true, find an alternative locator after the original fails.
 * Order: cache → heuristics → optional LLM.
 */
export async function resolveHealedLocator(
  page: Page,
  name: string,
  action: string,
  error: unknown,
  logger?: FrameworkLogger,
): Promise<HealResult | undefined> {
  if (!env.selfHealEnabled) {
    return undefined;
  }

  const timeout = env.selfHealTimeoutMs;
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger?.warn(`Self-heal starting for "${name}" after ${action} failure`);

  const cache = loadCache();
  const cached = cache[pageKey(page, name)];
  if (cached?.selector) {
    const locator = locatorFromSelector(page, cached.selector);
    if (await isActionable(locator, timeout)) {
      remember(page, name, cached.strategy, cached.description, cached.selector);
      logger?.info(`Self-heal cache hit: ${cached.description}`);
      getActivityReporter()?.logAction({
        action: 'selfHeal',
        locator: name,
        url: page.url(),
        status: 'pass',
        durationMs: 0,
      });
      return {
        strategy: 'cache',
        description: cached.description,
        locator,
        fromCache: true,
      };
    }
  }

  for (const candidate of heuristicCandidates(page, name)) {
    if (await isActionable(candidate.locator, timeout)) {
      remember(page, name, candidate.strategy, candidate.description, candidate.selector);
      logger?.info(`Self-heal healed "${name}" via ${candidate.strategy}: ${candidate.description}`);
      getActivityReporter()?.logAction({
        action: 'selfHeal',
        locator: `${name} → ${candidate.description}`,
        url: page.url(),
        status: 'pass',
        durationMs: 0,
      });
      return {
        strategy: candidate.strategy,
        description: candidate.description,
        locator: candidate.locator,
        fromCache: false,
      };
    }
  }

  const llmCandidate = await suggestWithLlm(page, name, action, errorMessage, logger);
  if (llmCandidate && (await isActionable(llmCandidate.locator, timeout))) {
    remember(page, name, 'llm', llmCandidate.description, llmCandidate.selector);
    logger?.info(`Self-heal healed "${name}" via LLM: ${llmCandidate.description}`);
    getActivityReporter()?.logAction({
      action: 'selfHeal',
      locator: `${name} → ${llmCandidate.description}`,
      url: page.url(),
      status: 'pass',
      durationMs: 0,
    });
    return {
      strategy: 'llm',
      description: llmCandidate.description,
      locator: llmCandidate.locator,
      fromCache: false,
    };
  }

  logger?.warn(`Self-heal could not find an alternative for "${name}"`);
  getActivityReporter()?.logAction({
    action: 'selfHeal',
    locator: name,
    url: page.url(),
    status: 'fail',
    durationMs: 0,
    error: 'No alternative locator found',
  });
  return undefined;
}
