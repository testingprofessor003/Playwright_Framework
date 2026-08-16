import { env } from '../config/env';
import { logger } from '../logger/logger';
import {
  chatLlm,
  InstalledModel,
  listInstalledModelCatalog,
  parseParameterBillion,
} from './llmClient';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface LlmTask {
  kind: string;
  text: string;
  complexityHint?: TaskComplexity;
}

export interface RoutedModel {
  model: string;
  complexity: TaskComplexity;
  reason: string;
  source: 'fixed' | 'router' | 'heuristic';
  catalog: string[];
}

const ROUTER_FAMILIES = [/^llama3\.2\b/i, /^llama3\.1\b/i, /^llama3\b/i];

export function matchInstalledModel(wanted: string, installed: string[]): string | undefined {
  if (!wanted || wanted.toLowerCase() === 'auto') return undefined;
  const needle = wanted.toLowerCase();
  const exact = installed.find((name) => name.toLowerCase() === needle);
  if (exact) return exact;
  const family = needle.split(':')[0];
  const latest = installed.find((name) => name.toLowerCase() === `${family}:latest`);
  if (latest) return latest;
  return installed.find((name) => {
    const lower = name.toLowerCase();
    return lower === family || lower.startsWith(`${family}:`) || lower.startsWith(`${family}-`);
  });
}

export function estimateComplexity(task: LlmTask): TaskComplexity {
  if (task.complexityHint) return task.complexityHint;
  const text = task.text || '';
  const length = text.length;
  const hasStack = /\n\s+at\s+\S+/.test(text);
  const unknown = /PW_UNKNOWN|\bunknown\b/i.test(text);
  if (unknown || (hasStack && length > 1500) || length > 4000) return 'complex';
  if (length < 600 && /TIMEOUT|ELEMENT_NOT_FOUND|PW_TIMEOUT|PW_ELEMENT/i.test(text)) return 'simple';
  return 'medium';
}

function formatModel(model: InstalledModel): string {
  return model.parameterBillion ? `${model.name} (${model.parameterBillion}B)` : model.name;
}

function names(catalog: InstalledModel[]): string[] {
  return catalog.map((item) => item.name);
}

function findByName(catalog: InstalledModel[], wanted: string): InstalledModel | undefined {
  const matched = matchInstalledModel(wanted, names(catalog));
  return matched ? catalog.find((item) => item.name === matched) : undefined;
}

function preferBillion(): number {
  return env.llmPreferBillion || 32;
}

/** 32B-class band: 27B–40B so gemma2:27b and qwen:32b both count. */
function isTargetClass(model: InstalledModel, target = preferBillion()): boolean {
  if (!model.parameterBillion) return false;
  return model.parameterBillion >= target - 5 && model.parameterBillion <= target + 8;
}

function closestTo(target: number, catalog: InstalledModel[]): InstalledModel | undefined {
  const sized = catalog.filter((item) => typeof item.parameterBillion === 'number');
  if (!sized.length) return undefined;
  return [...sized].sort(
    (a, b) => Math.abs((a.parameterBillion || 0) - target) - Math.abs((b.parameterBillion || 0) - target),
  )[0];
}

function smallest(catalog: InstalledModel[], maxBillion = 9): InstalledModel | undefined {
  const sized = catalog
    .filter((item) => typeof item.parameterBillion === 'number' && (item.parameterBillion || 0) <= maxBillion)
    .sort((a, b) => (a.parameterBillion || 0) - (b.parameterBillion || 0));
  return sized[0];
}

function pickRouterModel(catalog: InstalledModel[]): InstalledModel | undefined {
  const configured = findByName(catalog, env.llmRouterModel);
  if (configured && (!configured.parameterBillion || configured.parameterBillion <= 9)) return configured;

  for (const family of ROUTER_FAMILIES) {
    const matches = catalog
      .filter((item) => family.test(item.name) && (!item.parameterBillion || item.parameterBillion <= 9))
      .sort((a, b) => (a.parameterBillion || 99) - (b.parameterBillion || 99));
    if (matches[0]) return matches[0];
  }
  return smallest(catalog, 9);
}

function pickComplexModel(catalog: InstalledModel[]): InstalledModel | undefined {
  const target = preferBillion();
  const class32 = catalog
    .filter((item) => isTargetClass(item, target))
    .sort((a, b) => Math.abs((a.parameterBillion || 0) - target) - Math.abs((b.parameterBillion || 0) - target));
  if (class32[0]) return class32[0];

  const named = findByName(catalog, env.llmComplexModel) || findByName(catalog, 'gemma4:latest');
  if (named) return named;

  const atOrAbove = catalog
    .filter((item) => (item.parameterBillion || 0) >= target)
    .sort((a, b) => (a.parameterBillion || 0) - (b.parameterBillion || 0));
  return atOrAbove[0] || closestTo(target, catalog);
}

function heuristicPick(complexity: TaskComplexity, catalog: InstalledModel[]): string {
  const configured = findByName(catalog, env.llmModel);
  const router = pickRouterModel(catalog);
  const complex = pickComplexModel(catalog);
  const medium = closestTo(8, catalog) || router || configured;
  if (complexity === 'complex') return complex?.name || configured?.name || catalog[0]?.name || env.llmComplexModel;
  if (complexity === 'simple') return router?.name || smallest(catalog)?.name || configured?.name || env.llmRouterModel;
  return medium?.name || configured?.name || complex?.name || catalog[0]?.name || env.llmComplexModel;
}

function parseRouterChoice(
  content: string,
  catalog: InstalledModel[],
): { model?: string; complexity?: TaskComplexity; reason?: string } {
  const installed = names(catalog);
  try {
    const match = content.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : content) as {
      model?: string;
      complexity?: TaskComplexity;
      reason?: string;
    };
    const model = json.model ? matchInstalledModel(json.model, installed) : undefined;
    const complexity =
      json.complexity === 'simple' || json.complexity === 'medium' || json.complexity === 'complex'
        ? json.complexity
        : undefined;
    return { model, complexity, reason: json.reason };
  } catch {
    const mentioned = installed.find((name) => content.toLowerCase().includes(name.toLowerCase()));
    return { model: mentioned };
  }
}

function catalogForPrompt(catalog: InstalledModel[]): string {
  const target = preferBillion();
  return catalog
    .map((item) => {
      const size = item.parameterBillion ? `${item.parameterBillion}B` : 'size unknown';
      const mark = isTargetClass(item, target) ? ' [preferred for complex ~32B work]' : '';
      return `- ${item.name} (${size})${mark}`;
    })
    .join('\n');
}

export async function selectModelForTask(task: LlmTask): Promise<RoutedModel> {
  const catalog = await listInstalledModelCatalog().catch(() => [] as InstalledModel[]);
  const installed = names(catalog);
  const complexity = estimateComplexity(task);

  if (!env.llmRoute && env.llmModel && env.llmModel.toLowerCase() !== 'auto') {
    const fixed = matchInstalledModel(env.llmModel, installed) || env.llmModel;
    return {
      model: fixed,
      complexity,
      reason: `LLM_ROUTE=false — using configured LLM_MODEL=${fixed}`,
      source: 'fixed',
      catalog: installed,
    };
  }

  const heuristicModel = heuristicPick(complexity, catalog);
  const router = pickRouterModel(catalog);
  const class32 = catalog.filter((item) => isTargetClass(item)).map(formatModel);

  if (!router || !catalog.length) {
    return {
      model: heuristicModel,
      complexity,
      reason: catalog.length
        ? `llama3 router is not installed; heuristic picked ${heuristicModel} for ${complexity} ${task.kind}` +
          (class32.length ? ` · 32B-class: ${class32.join(', ')}` : '')
        : `Could not list Ollama models; using ${heuristicModel} for ${complexity} ${task.kind}`,
      source: 'heuristic',
      catalog: installed,
    };
  }

  try {
    const content = await chatLlm(
      [
        {
          role: 'system',
          content: `You route test-automation LLM work to one installed Ollama model.
Installed models:
${catalogForPrompt(catalog)}
Rules:
- Complex debugging/stack analysis: prefer a ~${preferBillion()}B parameter model when listed (for example qwen2.5:32b, llama3.1:32b, gemma3:27b). If none, prefer ${env.llmComplexModel}.
- Simple JSON classification: prefer a small llama3* model (8B or less), not a 32B model.
- Medium: llama3.1 8B or similar, unless the failure looks ambiguous then use ~${preferBillion()}B.
Respond with STRICT JSON only: {"model":"exact-installed-name","complexity":"simple|medium|complex","reason":"one sentence"}`,
        },
        {
          role: 'user',
          content: [
            `Task kind: ${task.kind}`,
            `Heuristic complexity: ${complexity}`,
            `Preferred complex size: ${preferBillion()}B`,
            `Preferred named complex model: ${env.llmComplexModel}`,
            `32B-class installed: ${class32.join(', ') || 'none detected'}`,
            `Task preview:`,
            task.text.slice(0, 2000),
          ].join('\n'),
        },
      ],
      { model: router.name, format: 'json', skipRoute: true },
    );
    const choice = parseRouterChoice(content, catalog);
    const model = choice.model || heuristicModel;
    return {
      model,
      complexity: choice.complexity || complexity,
      reason: choice.reason || `llama3 routed ${task.kind} to ${model}`,
      source: 'router',
      catalog: installed,
    };
  } catch (error) {
    logger.warn(`llama3 model routing failed: ${error instanceof Error ? error.message : error}`);
    return {
      model: heuristicModel,
      complexity,
      reason: `Router failed; heuristic picked ${heuristicModel} for ${complexity} ${task.kind}` +
        (class32.length ? ` · 32B-class: ${class32.join(', ')}` : ''),
      source: 'heuristic',
      catalog: installed,
    };
  }
}

export function describeCatalog(catalog: InstalledModel[]): string {
  return catalog.map(formatModel).join(', ');
}

export { parseParameterBillion };
