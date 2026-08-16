import { env } from '../config/env';
import { getLlmHealth } from './llmClient';
import { describeCatalog } from './modelRouter';
import { logger } from '../logger/logger';

export async function printLlmHealth(): Promise<void> {
  const health = await getLlmHealth();
  const class32 = (health.catalog || []).filter(
    (item) => item.parameterBillion && item.parameterBillion >= 27 && item.parameterBillion <= 40,
  );
  logger.info(
    [
      `LLM host: ${health.host}`,
      `Enabled: ${env.llmEnabled}`,
      `Model: ${health.model}`,
      `Provider: ${health.provider || env.llmApi}`,
      `Reachable: ${health.reachable}`,
      health.catalog?.length ? `Installed: ${describeCatalog(health.catalog)}` : health.models.length ? `Installed: ${health.models.join(', ')}` : '',
      class32.length ? `32B-class: ${describeCatalog(class32)}` : '',
      `Prefer: ${env.llmPreferBillion}B for complex / ${env.llmComplexModel} fallback`,
      health.error ? `Error: ${health.error}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  );
  if (!health.reachable) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  printLlmHealth().catch((error) => {
    logger.error(`LLM health check failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
