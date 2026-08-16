import {
  FrameworkError,
  ElementNotFoundError,
  TimeoutExceededError,
  NavigationError,
  TargetClosedError,
  AssertionFailedError,
  BrowserLaunchError,
  StrictModeViolationError,
  ErrorContext,
} from './errors';

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function nameOf(error: unknown): string {
  if (error instanceof Error) return error.name;
  return '';
}

export function mapPlaywrightError(error: unknown, context: ErrorContext = {}): FrameworkError {
  if (error instanceof FrameworkError) {
    return error;
  }

  const message = messageOf(error);
  const name = nameOf(error);
  const ctx: ErrorContext = { ...context, cause: error };
  const labeled = context.action
    ? `[${context.action}] ${message}`
    : message;

  const lower = message.toLowerCase();

  if (lower.includes('strict mode violation') || lower.includes('resolved to')) {
    return new StrictModeViolationError(labeled, ctx);
  }

  if (
    lower.includes('target closed') ||
    lower.includes('has been closed') ||
    lower.includes('browser has been closed') ||
    lower.includes('context or browser has been closed')
  ) {
    return new TargetClosedError(labeled, ctx);
  }

  if (
    lower.includes('net::') ||
    lower.includes('ns_error') ||
    lower.includes('navigation') ||
    lower.includes('err_connection') ||
    lower.includes('err_name_not_resolved') ||
    lower.includes('err_aborted')
  ) {
    return new NavigationError(labeled, ctx);
  }

  if (lower.includes('expect(') || lower.includes('assertion') || name === 'AssertionError') {
    return new AssertionFailedError(labeled, ctx);
  }

  if (
    lower.includes('browser closed') ||
    lower.includes('failed to launch') ||
    lower.includes('executable doesn') ||
    name === 'Error' && lower.includes('launch')
  ) {
    return new BrowserLaunchError(labeled, ctx);
  }

  if (name === 'TimeoutError' || lower.includes('timeout') || lower.includes('timed out')) {
    if (
      lower.includes('waiting for locator') ||
      lower.includes('waiting for selector') ||
      lower.includes('element') ||
      context.locator
    ) {
      return new ElementNotFoundError(labeled, ctx);
    }
    return new TimeoutExceededError(labeled, ctx);
  }

  return new FrameworkError(labeled, 'PW_UNKNOWN', 'UNKNOWN', ctx);
}
