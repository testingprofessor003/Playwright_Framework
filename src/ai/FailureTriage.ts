import { chatLlm } from './llmClient';
import { selectModelForTask } from './modelRouter';
import { HistoryScenario, HistoryInsight } from '../reports/historyStore';
import { logger } from '../logger/logger';

const SYSTEM_PROMPT = `You are a senior test automation failure triage assistant.
Analyze Playwright/Cucumber failures and respond with STRICT JSON only:
{
  "likelyCause": "one paragraph",
  "category": "locator|timeout|app-bug|environment|data|browser|unknown",
  "suggestedFix": "concrete next action",
  "confidence": "high|medium|low"
}`;

export async function triageFailure(scenario: HistoryScenario): Promise<HistoryInsight> {
  const user = [
    `Scenario: ${scenario.name}`,
    `Feature: ${scenario.feature}`,
    `Browser: ${scenario.browser}`,
    `Error code: ${scenario.errorCode}`,
    `Category: ${scenario.errorCategory}`,
    `Message: ${scenario.errorMessage}`,
    `Locator: ${scenario.locator}`,
    `URL: ${scenario.url}`,
    `Stack: ${scenario.stack || 'n/a'}`,
  ].join('\n');

  const routed = await selectModelForTask({ kind: 'failure-triage', text: user });
  logger.info(`LLM route: ${routed.model} (${routed.complexity}, ${routed.source}) — ${routed.reason}`);

  const content = await chatLlm(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    { model: routed.model, format: 'json', skipRoute: true },
  );

  const parsed = parseInsight(content);
  return {
    runId: scenario.runId,
    scenarioId: scenario.id,
    likelyCause: parsed.likelyCause,
    category: parsed.category,
    suggestedFix: parsed.suggestedFix,
    confidence: parsed.confidence,
    rawResponse: content,
    model: routed.model,
  };
}

function stripFence(content: string): string {
  return content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function parseInsight(content: string): {
  likelyCause: string;
  category: string;
  suggestedFix: string;
  confidence: string;
} {
  const cleaned = stripFence(content);
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : cleaned);
    return {
      likelyCause: json.likelyCause || cleaned,
      category: json.category || 'unknown',
      suggestedFix: json.suggestedFix || '',
      confidence: json.confidence || 'low',
    };
  } catch (error) {
    logger.warn(`Could not parse LLM JSON: ${error instanceof Error ? error.message : error}`);
    return {
      likelyCause: cleaned.slice(0, 1000),
      category: 'unknown',
      suggestedFix: 'Review the stack trace and locator stability.',
      confidence: 'low',
    };
  }
}
