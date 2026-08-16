import winston from 'winston';
import path from 'path';
import { env } from '../config/env';
import { LOGS_DIR, ensureDirs } from '../config/paths';

ensureDirs();

export interface LogContext {
  runId?: string;
  workerId?: string;
  scenarioId?: string;
  scenarioName?: string;
  browser?: string;
}

const extentFormat = winston.format((info) => {
  const level = String(info.level || '');
  if (level.includes('debug')) {
    return info;
  }
  try {
    const { getActivityReporter, isWinstonSuppressed } = require('../reports/extent/ActivityReporter') as {
      getActivityReporter: () => { logMessage: (level: string, message: string) => void } | undefined;
      isWinstonSuppressed: () => boolean;
    };
    if (!isWinstonSuppressed()) {
      getActivityReporter()?.logMessage(level, String(info.message ?? ''));
    }
  } catch {
    // Activity reporter is optional during early bootstrap.
  }
  return info;
});

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, runId, workerId, scenarioId, ...rest }) => {
    const ids = [runId, workerId, scenarioId].filter(Boolean).join('|');
    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp} [${level}]${ids ? ` [${ids}]` : ''} ${message}${meta}`;
  }),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const baseLogger = winston.createLogger({
  level: env.logLevel,
  defaultMeta: { framework: 'playwright-bdd' },
  format: extentFormat(),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'framework.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 7,
    }),
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'errors.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 7,
    }),
  ],
});

export function createLogger(context: LogContext = {}): winston.Logger {
  return baseLogger.child(context);
}

export const logger = createLogger();
export type FrameworkLogger = winston.Logger;
