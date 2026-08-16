export type ErrorCategory =
  | 'ELEMENT'
  | 'TIMEOUT'
  | 'NAVIGATION'
  | 'TARGET_CLOSED'
  | 'ASSERTION'
  | 'BROWSER'
  | 'CONFIGURATION'
  | 'DATABASE'
  | 'SHARED_STORE'
  | 'AI'
  | 'UNKNOWN';

export interface ErrorContext {
  action?: string;
  locator?: string;
  url?: string;
  cause?: unknown;
}

export class FrameworkError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly locator?: string;
  readonly url?: string;
  readonly action?: string;
  readonly cause?: unknown;
  readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    category: ErrorCategory,
    context: ErrorContext = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.locator = context.locator;
    this.url = context.url;
    this.action = context.action;
    this.cause = context.cause;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      locator: this.locator,
      url: this.url,
      action: this.action,
      timestamp: this.timestamp,
      stack: this.stack,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message, stack: this.cause.stack }
          : this.cause,
    };
  }
}

export class ElementNotFoundError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_ELEMENT_NOT_FOUND', 'ELEMENT', context);
  }
}

export class TimeoutExceededError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_TIMEOUT', 'TIMEOUT', context);
  }
}

export class NavigationError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_NAVIGATION', 'NAVIGATION', context);
  }
}

export class TargetClosedError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_TARGET_CLOSED', 'TARGET_CLOSED', context);
  }
}

export class AssertionFailedError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_ASSERTION', 'ASSERTION', context);
  }
}

export class BrowserLaunchError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_BROWSER_LAUNCH', 'BROWSER', context);
  }
}

export class ConfigurationError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'FW_CONFIGURATION', 'CONFIGURATION', context);
  }
}

export class DatabaseError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'FW_DATABASE', 'DATABASE', context);
  }
}

export class SharedStoreError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'FW_SHARED_STORE', 'SHARED_STORE', context);
  }
}

export class AiServiceError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'FW_AI_SERVICE', 'AI', context);
  }
}

export class StrictModeViolationError extends FrameworkError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, 'PW_STRICT_MODE', 'ELEMENT', context);
  }
}
