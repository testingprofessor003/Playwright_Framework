import { env } from '../config/env';
import { logger } from '../logger/logger';
import { AiServiceError } from '../errors/errors';

export type LlmProvider = 'openai' | 'ollama';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InstalledModel {
  name: string;
  parameterBillion?: number;
}

export interface LlmHealth {
  reachable: boolean;
  provider?: LlmProvider;
  host: string;
  model: string;
  models: string[];
  catalog: InstalledModel[];
  error?: string;
}

export interface ChatLlmOptions {
  model?: string;
  format?: 'json' | 'text';
  skipRoute?: boolean;
}

let detectedProvider: LlmProvider | undefined;
let cachedCatalog: { at: number; provider: LlmProvider; catalog: InstalledModel[] } | undefined;
const CATALOG_TTL_MS = 60_000;

function baseUrl(): string {
  return env.llmHost.replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.llmApiKey) {
    headers.Authorization = `Bearer ${env.llmApiKey}`;
    headers['X-API-Key'] = env.llmApiKey;
  }
  return headers;
}

async function fetchLlm(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.llmTimeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiServiceError(`LLM request timed out after ${env.llmTimeoutMs}ms`, { action: 'llm.fetch' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function probeProvider(provider: LlmProvider): Promise<boolean> {
  const url = provider === 'openai' ? `${baseUrl()}/v1/models` : `${baseUrl()}/api/tags`;
  try {
    const response = await fetchLlm(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveLlmProvider(): Promise<LlmProvider> {
  if (env.llmApi === 'openai' || env.llmApi === 'ollama') return env.llmApi;
  if (detectedProvider) return detectedProvider;
  if (await probeProvider('openai')) {
    detectedProvider = 'openai';
    return detectedProvider;
  }
  if (await probeProvider('ollama')) {
    detectedProvider = 'ollama';
    return detectedProvider;
  }
  // Hosted localaiserver exposes OpenAI-compatible /v1/models (401 without a key).
  detectedProvider = 'openai';
  return detectedProvider;
}

export function parseParameterBillion(name: string, parameterSize?: string): number | undefined {
  const fromDetails = parseSizeToken(parameterSize);
  if (fromDetails) return fromDetails;
  const moe = name.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b/i);
  if (moe) return Number(moe[1]) * Number(moe[2]);
  const matches = [...name.matchAll(/(\d+(?:\.\d+)?)\s*b\b/gi)];
  const last = matches[matches.length - 1];
  return last ? Number(last[1]) : undefined;
}

function parseSizeToken(raw?: string): number | undefined {
  if (!raw) return undefined;
  const match = String(raw).match(/(\d+(?:\.\d+)?)\s*b/i);
  return match ? Number(match[1]) : undefined;
}

function parseOpenAiCatalog(payload: unknown): InstalledModel[] {
  const data = (payload as { data?: Array<{ id?: string }> })?.data || [];
  return data
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id))
    .map((name) => ({ name, parameterBillion: parseParameterBillion(name) }));
}

function parseOllamaCatalog(payload: unknown): InstalledModel[] {
  const models =
    (payload as {
      models?: Array<{ name?: string; model?: string; details?: { parameter_size?: string } }>;
    })?.models || [];
  const catalog: InstalledModel[] = [];
  for (const item of models) {
    const name = item.name || item.model;
    if (!name) continue;
    catalog.push({
      name,
      parameterBillion: parseParameterBillion(name, item.details?.parameter_size),
    });
  }
  return catalog;
}

export async function listLlmModels(): Promise<{ provider: LlmProvider; models: string[]; catalog: InstalledModel[] }> {
  if (cachedCatalog && Date.now() - cachedCatalog.at < CATALOG_TTL_MS) {
    return {
      provider: cachedCatalog.provider,
      models: cachedCatalog.catalog.map((item) => item.name),
      catalog: cachedCatalog.catalog,
    };
  }

  const preferOllama = env.llmApi !== 'openai';
  const attempts: LlmProvider[] = preferOllama ? ['ollama', 'openai'] : ['openai', 'ollama'];
  let lastError = '';

  for (const provider of attempts) {
    try {
      const url = provider === 'ollama' ? `${baseUrl()}/api/tags` : `${baseUrl()}/v1/models`;
      const response = await fetchLlm(url, { method: 'GET' });
      if (!response.ok) {
        lastError = await describeHttpError('List models', response);
        continue;
      }
      const payload = await response.json();
      const catalog = provider === 'ollama' ? parseOllamaCatalog(payload) : parseOpenAiCatalog(payload);
      cachedCatalog = { at: Date.now(), provider, catalog };
      return { provider, models: catalog.map((item) => item.name), catalog };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new AiServiceError(lastError || 'Could not list models from the local AI server', { action: 'llm.models' });
}

export async function listInstalledOllamaModels(): Promise<string[]> {
  const { models } = await listLlmModels();
  return models;
}

export async function listInstalledModelCatalog(): Promise<InstalledModel[]> {
  const { catalog } = await listLlmModels();
  return catalog;
}

export async function isLlmReachable(): Promise<boolean> {
  const health = await getLlmHealth();
  return health.reachable;
}

export async function getLlmHealth(): Promise<LlmHealth> {
  const host = baseUrl();
  if (!env.llmEnabled) {
    return { reachable: false, host, model: env.llmModel, models: [], catalog: [], error: 'LLM_ENABLED=false' };
  }
  if (!env.llmApiKey) {
    logger.warn(`LLM_API_KEY is required for ${host}`);
    return {
      reachable: false,
      host,
      model: env.llmModel,
      models: [],
      catalog: [],
      error: `Unauthorized: set LLM_API_KEY for ${host}`,
    };
  }
  try {
    const { provider, models, catalog } = await listLlmModels();
    return { reachable: true, provider, host, model: env.llmModel, models, catalog };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`LLM not reachable at ${host}: ${message}`);
    return { reachable: false, host, model: env.llmModel, models: [], catalog: [], error: message };
  }
}

export async function chatLlm(
  messages: LlmMessage[],
  modelOrOptions: string | ChatLlmOptions = {},
): Promise<string> {
  if (!env.llmEnabled) {
    throw new AiServiceError('LLM is disabled. Set LLM_ENABLED=true.', { action: 'llm.chat' });
  }
  if (!env.llmApiKey) {
    throw new AiServiceError(`LLM_API_KEY is required for ${baseUrl()}`, { action: 'llm.chat' });
  }

  const options: ChatLlmOptions = typeof modelOrOptions === 'string' ? { model: modelOrOptions } : modelOrOptions;
  const model =
    options.model ||
    (env.llmModel && env.llmModel.toLowerCase() !== 'auto' ? env.llmModel : env.llmComplexModel);
  const format = options.format || 'text';
  const provider = await resolveChatProvider(model);

  try {
    if (provider === 'openai') {
      return await chatOpenAi(messages, model);
    }
    return await chatOllamaNative(messages, model, format);
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError(`LLM request failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'llm.chat',
      cause: error,
    });
  }
}

async function resolveChatProvider(model: string): Promise<LlmProvider> {
  if (env.llmApi === 'openai') return 'openai';
  if (env.llmApi === 'ollama') return 'ollama';
  if (model.includes(':')) return 'ollama';
  return resolveLlmProvider();
}

async function chatOpenAi(messages: LlmMessage[], model: string): Promise<string> {
  const response = await fetchLlm(`${baseUrl()}/v1/chat/completions`, {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      stream: false,
    }),
  });
  if (!response.ok) {
    throw new AiServiceError(await describeHttpError('Chat', response), { action: 'llm.chat' });
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content || '';
}

async function chatOllamaNative(messages: LlmMessage[], model: string, format: 'json' | 'text' = 'text'): Promise<string> {
  const body: Record<string, unknown> = { model, messages, stream: false };
  if (format === 'json') body.format = 'json';
  const response = await fetchLlm(`${baseUrl()}/api/chat`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new AiServiceError(await describeHttpError('Chat', response), { action: 'llm.chat' });
  }
  const payload = (await response.json()) as { message?: { content?: string } };
  return payload.message?.content || '';
}

async function describeHttpError(action: string, response: Response): Promise<string> {
  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    return `${action} unauthorized (${response.status}). Set a valid LLM_API_KEY for ${baseUrl()}. ${body}`.trim();
  }
  return `${action} HTTP ${response.status}: ${body}`;
}

/** @deprecated Use chatLlm */
export const chatOllama = chatLlm;
/** @deprecated Use isLlmReachable */
export const isOllamaReachable = isLlmReachable;
