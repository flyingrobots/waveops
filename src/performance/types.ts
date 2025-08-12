/**
 * Performance optimization type definitions
 */

// Cache System Types
export interface CacheConfig {
  redis: RedisConfig;
  inMemory: InMemoryConfig;
  strategies: CacheStrategies;
  ttl: TTLConfig;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  maxRetries: number;
  retryDelayOnFailover: number;
  enableOfflineQueue: boolean;
  lazyConnect: boolean;
  maxRetriesPerRequest: number;
  keyPrefix: string;
  maxMemoryPolicy: 'noeviction' | 'allkeys-lru' | 'volatile-lru' | 'allkeys-random' | 'volatile-random' | 'volatile-ttl';
}

export interface InMemoryConfig {
  maxSize: number; // bytes
  maxEntries: number;
  cleanupInterval: number; // milliseconds
  evictionStrategy: EvictionStrategy;
  compressionEnabled: boolean;
  serializationFormat: 'json' | 'msgpack' | 'protobuf';
}

export enum EvictionStrategy {
  LRU = 0,
  LFU = 1,
  FIFO = 2,
  RANDOM = 3,
  TTL_BASED = 4
}

export interface CacheStrategies {
  waveState: CacheStrategy;
  teamMetrics: CacheStrategy;
  githubData: CacheStrategy;
  dependencyGraph: CacheStrategy;
  analyticsData: CacheStrategy;
}

export interface CacheStrategy {
  layers: CacheLayer[];
  invalidationStrategy: InvalidationStrategy;
  warmupEnabled: boolean;
  prefetchEnabled: boolean;
  compressionThreshold: number; // bytes
}

export enum CacheLayer {
  IN_MEMORY = 0,
  REDIS = 1,
  DATABASE = 2,
  CDN = 3
}

export enum InvalidationStrategy {
  TTL_BASED = 0,
  VERSION_BASED = 1,
  EVENT_BASED = 2,
  MANUAL = 3,
  WRITE_THROUGH = 4,
  WRITE_BEHIND = 5
}

export interface TTLConfig {
  default: number;
  waveState: number;
  teamMetrics: number;
  githubData: number;
  dependencyGraph: number;
  analyticsSnapshots: number;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  metadata: CacheMetadata;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  lastModified: Date;
  size: number; // bytes
  version: number;
}

export interface CacheMetadata {
  createdAt: Date;
  source: string;
  tags: string[];
  dependencies: string[];
  priority: CachePriority;
  hitCount: number;
  missCount: number;
}

export enum CachePriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
  IMMORTAL = 4
}

// Memory Management Types
export interface MemoryConfig {
  objectPooling: ObjectPoolingConfig;
  gcOptimization: GCOptimizationConfig;
  memoryLimits: MemoryLimitsConfig;
  leakDetection: LeakDetectionConfig;
}

export interface ObjectPoolingConfig {
  enabled: boolean;
  pools: Record<string, PoolConfig>;
  globalMaxSize: number;
  cleanupInterval: number;
  preallocationEnabled: boolean;
}

export interface PoolConfig {
  initialSize: number;
  maxSize: number;
  growthFactor: number;
  shrinkThreshold: number;
  maxIdleTime: number; // milliseconds
  validationEnabled: boolean;
  metricsEnabled: boolean;
}

export interface GCOptimizationConfig {
  enabled: boolean;
  strategy: GCStrategy;
  forceGCThreshold: number; // memory usage percentage
  youngGenerationTargetSize: number; // bytes
  oldGenerationThreshold: number; // bytes
  incrementalGCEnabled: boolean;
}

export enum GCStrategy {
  AGGRESSIVE = 0,
  BALANCED = 1,
  CONSERVATIVE = 2,
  ADAPTIVE = 3
}

export interface MemoryLimitsConfig {
  heapSizeWarning: number; // bytes
  heapSizeCritical: number; // bytes
  maxObjectSize: number; // bytes
  maxArrayLength: number;
  stringPoolEnabled: boolean;
  bufferPoolEnabled: boolean;
}

export interface LeakDetectionConfig {
  enabled: boolean;
  samplingRate: number; // 0-1
  detectionThreshold: number; // bytes
  reportingInterval: number; // milliseconds
  stackTraceEnabled: boolean;
  automaticCleanupEnabled: boolean;
}

export interface ObjectPool<T> {
  name: string;
  factory: () => T;
  reset: (obj: T) => void;
  validate?: (obj: T) => boolean;
  size: number;
  maxSize: number;
  created: number;
  borrowed: number;
  returned: number;
  destroyed: number;
}

export interface MemoryMetrics {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  gcMetrics: GCMetrics;
  poolMetrics: Record<string, PoolMetrics>;
  leakSuspects: LeakSuspect[];
}

export interface GCMetrics {
  majorGCCount: number;
  minorGCCount: number;
  totalGCTime: number;
  avgGCPause: number;
  maxGCPause: number;
  youngGenSize: number;
  oldGenSize: number;
  survivorRatio: number;
}

export interface PoolMetrics {
  name: string;
  size: number;
  active: number;
  idle: number;
  created: number;
  destroyed: number;
  hitRate: number;
  avgBorrowTime: number;
  maxBorrowTime: number;
}

export interface LeakSuspect {
  type: string;
  count: number;
  size: number;
  firstSeen: Date;
  lastSeen: Date;
  stackTrace?: string;
  growthRate: number;
}

// Network Optimization Types
export interface NetworkConfig {
  github: GitHubOptimizationConfig;
  compression: CompressionConfig;
  connections: ConnectionConfig;
  retryStrategies: RetryStrategiesConfig;
}

export interface GitHubOptimizationConfig {
  rateLimitStrategy: RateLimitStrategy;
  batchingConfig: BatchingConfig;
  cacheConfig: GitHubCacheConfig;
  parallelismLimits: ParallelismLimitsConfig;
}

export enum RateLimitStrategy {
  CONSERVATIVE = 0,
  AGGRESSIVE = 1,
  ADAPTIVE = 2,
  BURST_THEN_THROTTLE = 3
}

export interface BatchingConfig {
  enabled: boolean;
  maxBatchSize: number;
  maxWaitTime: number; // milliseconds
  groupingStrategies: BatchGroupingStrategy[];
  priorities: BatchPriority[];
}

export enum BatchGroupingStrategy {
  BY_ENDPOINT = 0,
  BY_REPOSITORY = 1,
  BY_USER = 2,
  BY_PRIORITY = 3,
  BY_SIZE = 4
}

export interface BatchPriority {
  pattern: string;
  priority: number;
  maxDelay: number;
}

export interface GitHubCacheConfig {
  userDataTTL: number;
  repoDataTTL: number;
  issueDataTTL: number;
  prDataTTL: number;
  deploymentDataTTL: number;
  checkDataTTL: number;
  searchResultsTTL: number;
}

export interface ParallelismLimitsConfig {
  maxConcurrentRequests: number;
  maxConcurrentPerRepo: number;
  maxConcurrentPerUser: number;
  queueSizeLimit: number;
  timeoutMs: number;
}

export interface CompressionConfig {
  enabled: boolean;
  algorithms: CompressionAlgorithm[];
  thresholds: CompressionThresholds;
  streamingEnabled: boolean;
}

export enum CompressionAlgorithm {
  GZIP = 0,
  BROTLI = 1,
  DEFLATE = 2,
  LZ4 = 3
}

export interface CompressionThresholds {
  minSize: number; // bytes
  maxSize: number; // bytes
  compressionRatio: number;
}

export interface ConnectionConfig {
  keepAlive: boolean;
  keepAliveTimeout: number; // milliseconds
  maxSockets: number;
  maxFreeSockets: number;
  timeout: number; // milliseconds
  pooling: ConnectionPoolingConfig;
}

export interface ConnectionPoolingConfig {
  enabled: boolean;
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  validationQuery?: string;
  testOnBorrow: boolean;
  testOnReturn: boolean;
}

export interface RetryStrategiesConfig {
  default: RetryStrategy;
  github: RetryStrategy;
  database: RetryStrategy;
  cache: RetryStrategy;
}

export interface RetryStrategy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableErrors: string[];
  circuitBreaker: CircuitBreakerConfig;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  monitoringEnabled: boolean;
}

// Background Processing Types
export interface BackgroundConfig {
  queues: QueueConfig[];
  workers: WorkerConfig;
  scheduling: SchedulingConfig;
  monitoring: QueueMonitoringConfig;
}

export interface QueueConfig {
  name: string;
  type: QueueType;
  maxSize: number;
  maxConcurrency: number;
  priority: QueuePriority;
  deadLetterQueue: boolean;
  retryPolicy: QueueRetryPolicy;
  rateLimiting: QueueRateLimiting;
}

export enum QueueType {
  FIFO = 0,
  PRIORITY = 1,
  DELAYED = 2,
  BATCH = 3
}

export enum QueuePriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3
}

export interface QueueRetryPolicy {
  maxRetries: number;
  backoffType: BackoffType;
  initialDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

export enum BackoffType {
  FIXED = 0,
  EXPONENTIAL = 1,
  LINEAR = 2,
  POLYNOMIAL = 3
}

export interface QueueRateLimiting {
  enabled: boolean;
  requestsPerSecond: number;
  burstCapacity: number;
  windowSizeMs: number;
}

export interface WorkerConfig {
  concurrency: number;
  maxConcurrency: number;
  autoScaling: AutoScalingConfig;
  healthChecks: WorkerHealthConfig;
}

export interface AutoScalingConfig {
  enabled: boolean;
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
}

export interface WorkerHealthConfig {
  enabled: boolean;
  checkInterval: number;
  unhealthyThreshold: number;
  recoveryThreshold: number;
  restartOnFailure: boolean;
}

export interface SchedulingConfig {
  cron: CronConfig[];
  intervals: IntervalConfig[];
  cleanup: CleanupConfig;
}

export interface CronConfig {
  name: string;
  schedule: string;
  timezone: string;
  handler: string;
  enabled: boolean;
}

export interface IntervalConfig {
  name: string;
  intervalMs: number;
  handler: string;
  enabled: boolean;
  immediate: boolean;
}

export interface CleanupConfig {
  enabled: boolean;
  retentionPeriod: number; // milliseconds
  batchSize: number;
  schedule: string;
}

export interface QueueMonitoringConfig {
  enabled: boolean;
  metricsInterval: number;
  alertThresholds: QueueAlertThresholds;
}

export interface QueueAlertThresholds {
  highWaterMark: number;
  processingLatency: number;
  errorRate: number;
  deadLetterThreshold: number;
}

// Resource Management Types
export interface ResourceConfig {
  connectionPools: ConnectionPoolConfig[];
  lifecycleManagement: LifecycleConfig;
  monitoring: ResourceMonitoringConfig;
  cleanup: ResourceCleanupConfig;
}

export interface ConnectionPoolConfig {
  name: string;
  type: ConnectionType;
  minConnections: number;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  maxLifetime: number;
  validationQuery?: string;
  testInterval: number;
  leakDetectionThreshold: number;
}

export enum ConnectionType {
  DATABASE = 0,
  REDIS = 1,
  HTTP = 2,
  WEBSOCKET = 3
}

export interface LifecycleConfig {
  gracefulShutdownTimeout: number;
  forceShutdownTimeout: number;
  cleanupOnExit: boolean;
  resourceTrackingEnabled: boolean;
}

export interface ResourceMonitoringConfig {
  enabled: boolean;
  trackingInterval: number;
  alertThresholds: ResourceAlertThresholds;
  leakDetectionEnabled: boolean;
}

export interface ResourceAlertThresholds {
  connectionPoolUsage: number; // percentage
  memoryUsage: number; // percentage
  fileHandleUsage: number; // percentage
  networkConnectionUsage: number; // percentage
}

export interface ResourceCleanupConfig {
  enabled: boolean;
  cleanupInterval: number;
  aggressiveCleanup: boolean;
  resourceTypes: ResourceType[];
}

export enum ResourceType {
  CONNECTIONS = 0,
  FILE_HANDLES = 1,
  TIMERS = 2,
  EVENT_LISTENERS = 3,
  STREAMS = 4,
  WORKERS = 5
}

// Performance Monitoring Types
export interface PerformanceMonitoringConfig {
  metricsCollection: MetricsCollectionConfig;
  profiling: ProfilingConfig;
  alerts: AlertConfig;
  reporting: ReportingConfig;
}

export interface MetricsCollectionConfig {
  enabled: boolean;
  interval: number;
  retention: RetentionConfig;
  aggregation: AggregationConfig;
  exporters: MetricsExporter[];
}

export interface RetentionConfig {
  rawDataRetention: number; // milliseconds
  aggregatedDataRetention: number; // milliseconds
  compressionEnabled: boolean;
}

export interface AggregationConfig {
  windows: AggregationWindow[];
  functions: AggregationFunction[];
}

export interface AggregationWindow {
  duration: number; // milliseconds
  offset: number; // milliseconds
  precision: number; // milliseconds
}

export enum AggregationFunction {
  SUM = 0,
  AVG = 1,
  MIN = 2,
  MAX = 3,
  COUNT = 4,
  PERCENTILE = 5,
  STDDEV = 6
}

export enum MetricsExporter {
  PROMETHEUS = 0,
  GRAPHITE = 1,
  STATSD = 2,
  INFLUXDB = 3,
  CUSTOM = 4
}

export interface ProfilingConfig {
  enabled: boolean;
  samplingRate: number;
  duration: number; // milliseconds
  triggers: ProfilingTrigger[];
  outputFormat: ProfilingOutputFormat;
}

export enum ProfilingTrigger {
  ON_DEMAND = 0,
  HIGH_CPU = 1,
  HIGH_MEMORY = 2,
  SLOW_RESPONSE = 3,
  ERROR_RATE = 4
}

export enum ProfilingOutputFormat {
  FLAMEGRAPH = 0,
  CALL_TREE = 1,
  HEAP_SNAPSHOT = 2,
  CPU_PROFILE = 3
}

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannel[];
  rules: AlertRule[];
  throttling: AlertThrottlingConfig;
}

export interface AlertChannel {
  name: string;
  type: AlertChannelType;
  config: Record<string, unknown>;
  enabled: boolean;
}

export enum AlertChannelType {
  EMAIL = 0,
  SLACK = 1,
  WEBHOOK = 2,
  SMS = 3,
  PAGERDUTY = 4
}

export interface AlertRule {
  name: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  channels: string[];
  cooldown: number; // milliseconds
  enabled: boolean;
}

export interface AlertCondition {
  metric: string;
  operator: AlertOperator;
  threshold: number;
  duration: number; // milliseconds
}

export enum AlertOperator {
  GREATER_THAN = 0,
  LESS_THAN = 1,
  EQUALS = 2,
  NOT_EQUALS = 3,
  GREATER_THAN_OR_EQUAL = 4,
  LESS_THAN_OR_EQUAL = 5
}

export enum AlertSeverity {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
  CRITICAL = 3
}

export interface AlertThrottlingConfig {
  enabled: boolean;
  maxAlertsPerHour: number;
  suppressDuplicates: boolean;
  escalationEnabled: boolean;
}

export interface ReportingConfig {
  enabled: boolean;
  schedule: string;
  recipients: string[];
  format: ReportFormat;
  sections: ReportSection[];
}

export enum ReportFormat {
  HTML = 0,
  PDF = 1,
  JSON = 2,
  MARKDOWN = 3
}

export enum ReportSection {
  EXECUTIVE_SUMMARY = 0,
  PERFORMANCE_METRICS = 1,
  RESOURCE_USAGE = 2,
  ERROR_ANALYSIS = 3,
  RECOMMENDATIONS = 4,
  TRENDS = 5
}

// Performance Test Types
export interface PerformanceTestConfig {
  loadTesting: LoadTestConfig;
  stressTesting: StressTestConfig;
  enduranceTesting: EnduranceTestConfig;
  spikeTesting: SpikeTestConfig;
}

export interface LoadTestConfig {
  scenarios: LoadTestScenario[];
  rampUp: RampUpConfig;
  duration: number;
  targets: PerformanceTargets;
}

export interface LoadTestScenario {
  name: string;
  weight: number; // percentage
  actions: TestAction[];
  thinkTime: ThinkTimeConfig;
}

export interface TestAction {
  name: string;
  type: ActionType;
  parameters: Record<string, unknown>;
  expectedResponse: ResponseExpectation;
}

export enum ActionType {
  HTTP_REQUEST = 0,
  DATABASE_QUERY = 1,
  CACHE_OPERATION = 2,
  COMPUTATION = 3,
  FILE_OPERATION = 4
}

export interface ResponseExpectation {
  maxResponseTime: number; // milliseconds
  minThroughput: number; // requests per second
  maxErrorRate: number; // percentage
  statusCodes: number[];
}

export interface ThinkTimeConfig {
  min: number; // milliseconds
  max: number; // milliseconds
  distribution: DistributionType;
}

export enum DistributionType {
  UNIFORM = 0,
  NORMAL = 1,
  EXPONENTIAL = 2,
  WEIBULL = 3
}

export interface RampUpConfig {
  type: RampUpType;
  duration: number; // milliseconds
  stages: RampUpStage[];
}

export enum RampUpType {
  LINEAR = 0,
  EXPONENTIAL = 1,
  STAGED = 2,
  CUSTOM = 3
}

export interface RampUpStage {
  duration: number; // milliseconds
  targetUsers: number;
  targetThroughput?: number;
}

export interface StressTestConfig {
  maxUsers: number;
  incrementStep: number;
  duration: number;
  breakingPoint: BreakingPointConfig;
}

export interface BreakingPointConfig {
  errorRateThreshold: number; // percentage
  responseTimeThreshold: number; // milliseconds
  throughputThreshold: number; // requests per second
}

export interface EnduranceTestConfig {
  duration: number; // milliseconds
  constantLoad: number; // users or requests per second
  degradationThresholds: DegradationThresholds;
}

export interface DegradationThresholds {
  memoryLeakThreshold: number; // MB per hour
  performanceDegradation: number; // percentage
  errorRateIncrease: number; // percentage
}

export interface SpikeTestConfig {
  spikes: SpikeConfig[];
  baselineLoad: number;
  recoveryTime: number; // milliseconds
}

export interface SpikeConfig {
  startTime: number; // milliseconds from start
  duration: number; // milliseconds
  targetLoad: number; // multiplier of baseline
  type: SpikeType;
}

export enum SpikeType {
  INSTANT = 0,
  GRADUAL = 1,
  RANDOM = 2
}

export interface PerformanceTargets {
  responseTime: ResponseTimeTargets;
  throughput: ThroughputTargets;
  resourceUsage: ResourceUsageTargets;
  availability: AvailabilityTargets;
}

export interface ResponseTimeTargets {
  p50: number; // milliseconds
  p95: number; // milliseconds
  p99: number; // milliseconds
  max: number; // milliseconds
}

export interface ThroughputTargets {
  minimum: number; // requests per second
  target: number; // requests per second
  maximum: number; // requests per second
}

export interface ResourceUsageTargets {
  cpuUsage: number; // percentage
  memoryUsage: number; // percentage
  diskUsage: number; // percentage
  networkUsage: number; // percentage
}

export interface AvailabilityTargets {
  uptime: number; // percentage
  maxDowntime: number; // milliseconds
  errorRate: number; // percentage
}

// Custom Error Types
export class PerformanceOptimizationError extends Error {
  constructor(
    message: string,
    public readonly code: PerformanceErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PerformanceOptimizationError';
  }
}

export enum PerformanceErrorCode {
  CACHE_INITIALIZATION_FAILED = 0,
  MEMORY_POOL_EXHAUSTED = 1,
  NETWORK_OPTIMIZATION_FAILED = 2,
  QUEUE_OVERFLOW = 3,
  RESOURCE_LEAK_DETECTED = 4,
  MONITORING_SETUP_FAILED = 5,
  PERFORMANCE_DEGRADATION = 6,
  CIRCUIT_BREAKER_OPEN = 7,
  RATE_LIMIT_EXCEEDED = 8,
  CONNECTION_POOL_EXHAUSTED = 9
}

export class CacheError extends Error {
  constructor(
    message: string,
    public readonly operation: CacheOperation,
    public readonly layer: CacheLayer,
    public readonly key?: string
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

export enum CacheOperation {
  GET = 0,
  SET = 1,
  DELETE = 2,
  INVALIDATE = 3,
  WARMUP = 4,
  EVICT = 5
}

export class MemoryManagementError extends Error {
  constructor(
    message: string,
    public readonly type: MemoryErrorType,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MemoryManagementError';
  }
}

export enum MemoryErrorType {
  POOL_CREATION_FAILED = 0,
  OBJECT_CREATION_FAILED = 1,
  MEMORY_LEAK_DETECTED = 2,
  GC_OPTIMIZATION_FAILED = 3,
  MEMORY_LIMIT_EXCEEDED = 4
}

export class NetworkOptimizationError extends Error {
  constructor(
    message: string,
    public readonly operation: NetworkOperation,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'NetworkOptimizationError';
  }
}

export enum NetworkOperation {
  REQUEST_BATCHING = 0,
  RATE_LIMITING = 1,
  CONNECTION_POOLING = 2,
  RESPONSE_COMPRESSION = 3,
  RETRY_STRATEGY = 4
}