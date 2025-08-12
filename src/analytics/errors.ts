/**
 * Custom error types for analytics operations
 */

export class AnalyticsError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AnalyticsError';
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, AnalyticsError);
  }
}

export class MetricsCollectionError extends AnalyticsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'METRICS_COLLECTION_ERROR', context);
    this.name = 'MetricsCollectionError';
  }
}

export class PerformanceAnalysisError extends AnalyticsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'PERFORMANCE_ANALYSIS_ERROR', context);
    this.name = 'PerformanceAnalysisError';
  }
}

export class DataValidationError extends AnalyticsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'DATA_VALIDATION_ERROR', context);
    this.name = 'DataValidationError';
  }
}

export class PredictionError extends AnalyticsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'PREDICTION_ERROR', context);
    this.name = 'PredictionError';
  }
}

export class ConfigurationError extends AnalyticsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.name = 'ConfigurationError';
  }
}

export class GitHubIntegrationError extends AnalyticsError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'GITHUB_INTEGRATION_ERROR', context);
    this.name = 'GitHubIntegrationError';
  }
}