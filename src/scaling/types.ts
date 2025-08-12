/**
 * Enterprise Scaling Types for WaveOps
 * Defines interfaces for multi-repository coordination, HA, and auto-scaling
 */

// Multi-Repository Coordination Types
export interface RepositoryConfiguration {
  repositoryId: string;
  name: string;
  url: string;
  owner: string;
  defaultBranch: string;
  coordinationRole: RepositoryRole;
  teamMappings: TeamMapping[];
  dependencies: RepositoryDependency[];
  scalingConfig: RepositoryScalingConfig;
  securityConfig: RepositorySecurityConfig;
}

export enum RepositoryRole {
  PRIMARY = 0,      // Primary coordination repository
  SECONDARY = 1,    // Secondary participating repository
  OBSERVER = 2      // Read-only observer repository
}

export interface TeamMapping {
  teamId: string;
  repositoryTeams: string[];
  permissions: TeamPermission[];
  coordinationLevel: CoordinationLevel;
}

export enum CoordinationLevel {
  FULL = 0,         // Full coordination participation
  PARTIAL = 1,      // Limited coordination (specific waves only)
  OBSERVER = 2      // Observer only
}

export enum TeamPermission {
  READ = 0,
  WRITE = 1,
  ADMIN = 2,
  COORDINATE = 3,
  DEPLOY = 4
}

export interface RepositoryDependency {
  dependentRepository: string;
  dependencyType: DependencyType;
  blockingLevel: BlockingLevel;
  synchronizationRequired: boolean;
  timeoutMs: number;
}

export enum DependencyType {
  HARD_DEPENDENCY = 0,    // Must complete before dependent can proceed
  SOFT_DEPENDENCY = 1,    // Preferred order but not blocking
  NOTIFICATION = 2,       // Notification only, no blocking
  SYNC_POINT = 3         // Synchronization checkpoint
}

export enum BlockingLevel {
  NONE = 0,
  WAVE_LEVEL = 1,
  TASK_LEVEL = 2,
  CRITICAL_PATH = 3
}

export interface RepositoryScalingConfig {
  minInstances: number;
  maxInstances: number;
  targetConcurrentWaves: number;
  autoScalingEnabled: boolean;
  scalingMetrics: ScalingMetric[];
  resourceLimits: ResourceLimits;
}

export interface ScalingMetric {
  name: string;
  type: MetricType;
  threshold: number;
  direction: ScalingDirection;
  weight: number;
}

export enum MetricType {
  CPU_UTILIZATION = 0,
  MEMORY_UTILIZATION = 1,
  COORDINATION_LATENCY = 2,
  WAVE_QUEUE_LENGTH = 3,
  ERROR_RATE = 4,
  THROUGHPUT = 5
}

export enum ScalingDirection {
  SCALE_UP = 0,
  SCALE_DOWN = 1,
  BOTH = 2
}

export interface ResourceLimits {
  cpuLimit: string;
  memoryLimit: string;
  diskLimit?: string;
  networkBandwidth?: string;
  maxConnections: number;
}

// High Availability Types
export interface HAConfiguration {
  enabled: boolean;
  leaderElection: LeaderElectionConfig;
  replication: ReplicationConfig;
  failover: FailoverConfig;
  healthChecks: HealthCheckConfig[];
  circuitBreaker: CircuitBreakerConfig;
  gracefulShutdown: GracefulShutdownConfig;
}

export interface LeaderElectionConfig {
  enabled: boolean;
  lockName: string;
  leaseDurationSeconds: number;
  renewDeadlineSeconds: number;
  retryPeriodSeconds: number;
  namespace: string;
  identity: string;
}

export interface ReplicationConfig {
  enabled: boolean;
  replicationFactor: number;
  consistency: ConsistencyLevel;
  syncTimeout: number;
  asyncReplication: boolean;
}

export enum ConsistencyLevel {
  EVENTUAL = 0,
  STRONG = 1,
  BOUNDED_STALENESS = 2
}

export interface FailoverConfig {
  automaticFailover: boolean;
  failoverTimeout: number;
  healthCheckInterval: number;
  maxFailoverAttempts: number;
  backoffMultiplier: number;
}

export interface HealthCheckConfig {
  name: string;
  endpoint: string;
  method: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  successThreshold: number;
  failureThreshold: number;
  initialDelaySeconds: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
  halfOpenSuccessThreshold: number;
}

export interface GracefulShutdownConfig {
  timeoutSeconds: number;
  drainTimeout: number;
  terminationGracePeriod: number;
  preStopHook?: string;
}

// Auto-Scaling Types
export interface AutoScalingConfig {
  enabled: boolean;
  horizontalScaling: HorizontalScalingConfig;
  verticalScaling: VerticalScalingConfig;
  predictiveScaling: PredictiveScalingConfig;
  costOptimization: CostOptimizationConfig;
}

export interface HorizontalScalingConfig {
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
  targetMemoryUtilization: number;
  scaleUpBehavior: ScalingBehavior;
  scaleDownBehavior: ScalingBehavior;
  customMetrics: CustomMetric[];
}

export interface ScalingBehavior {
  stabilizationWindowSeconds: number;
  selectPolicy: ScalingPolicy;
  policies: ScalingPolicyRule[];
}

export enum ScalingPolicy {
  MAX = 0,
  MIN = 1,
  DISABLED = 2
}

export interface ScalingPolicyRule {
  type: ScalingPolicyType;
  value: number;
  periodSeconds: number;
}

export enum ScalingPolicyType {
  PODS = 0,
  PERCENT = 1
}

export interface VerticalScalingConfig {
  enabled: boolean;
  updateMode: VPAUpdateMode;
  resourcePolicy: VPAResourcePolicy;
}

export enum VPAUpdateMode {
  OFF = 0,
  INITIAL = 1,
  RECREATE = 2,
  AUTO = 3
}

export interface VPAResourcePolicy {
  containerPolicies: ContainerResourcePolicy[];
}

export interface ContainerResourcePolicy {
  containerName: string;
  minAllowed: ResourceRequirement;
  maxAllowed: ResourceRequirement;
  controlledResources: ControlledResource[];
}

export enum ControlledResource {
  REQUEST_CPU = 0,
  REQUEST_MEMORY = 1,
  LIMIT_CPU = 2,
  LIMIT_MEMORY = 3
}

export interface ResourceRequirement {
  cpu?: string;
  memory?: string;
}

export interface PredictiveScalingConfig {
  enabled: boolean;
  modelType: PredictiveModelType;
  lookAheadMinutes: number;
  confidenceThreshold: number;
  historicalDataWindow: number;
}

export enum PredictiveModelType {
  LINEAR_REGRESSION = 0,
  TIME_SERIES = 1,
  NEURAL_NETWORK = 2,
  ENSEMBLE = 3
}

export interface CustomMetric {
  name: string;
  selector: MetricSelector;
  target: MetricTarget;
}

export interface MetricSelector {
  matchLabels: Record<string, string>;
  matchExpressions?: MetricExpression[];
}

export interface MetricExpression {
  key: string;
  operator: MetricOperator;
  values: string[];
}

export enum MetricOperator {
  IN = 0,
  NOT_IN = 1,
  EXISTS = 2,
  DOES_NOT_EXIST = 3
}

export interface MetricTarget {
  type: MetricTargetType;
  value?: number;
  averageValue?: string;
  averageUtilization?: number;
}

export enum MetricTargetType {
  VALUE = 0,
  AVERAGE_VALUE = 1,
  UTILIZATION = 2
}

// Cost Optimization Types
export interface CostOptimizationConfig {
  enabled: boolean;
  strategies: CostOptimizationStrategy[];
  budgetLimits: BudgetLimit[];
  rightsizingEnabled: boolean;
  spotInstancesEnabled: boolean;
  scheduledScaling: ScheduledScaling[];
}

export interface CostOptimizationStrategy {
  name: string;
  type: CostStrategyType;
  priority: number;
  enabled: boolean;
  parameters: Record<string, unknown>;
}

export enum CostStrategyType {
  RIGHTSIZING = 0,
  SPOT_INSTANCES = 1,
  RESERVED_INSTANCES = 2,
  SCHEDULED_SCALING = 3,
  RESOURCE_POOLING = 4,
  PREEMPTIBLE_INSTANCES = 5
}

export interface BudgetLimit {
  name: string;
  amount: number;
  period: BudgetPeriod;
  currency: string;
  alertThresholds: number[];
  enforcementActions: EnforcementAction[];
}

export enum BudgetPeriod {
  DAILY = 0,
  WEEKLY = 1,
  MONTHLY = 2,
  QUARTERLY = 3,
  YEARLY = 4
}

export interface EnforcementAction {
  threshold: number;
  action: CostAction;
  parameters: Record<string, unknown>;
}

export enum CostAction {
  ALERT = 0,
  SCALE_DOWN = 1,
  TERMINATE = 2,
  BLOCK_DEPLOYMENT = 3
}

export interface ScheduledScaling {
  name: string;
  schedule: string; // Cron expression
  targetReplicas: number;
  timezone: string;
  enabled: boolean;
}

// Security and Compliance Types
export interface RepositorySecurityConfig {
  authentication: AuthenticationConfig;
  authorization: AuthorizationConfig;
  encryption: EncryptionConfig;
  auditLogging: AuditLoggingConfig;
  networkSecurity: NetworkSecurityConfig;
  secretManagement: SecretManagementConfig;
}

export interface AuthenticationConfig {
  providers: AuthProvider[];
  mfa: MFAConfig;
  sessionManagement: SessionConfig;
}

export interface AuthProvider {
  type: AuthProviderType;
  name: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
}

export enum AuthProviderType {
  OAUTH2 = 0,
  SAML = 1,
  LDAP = 2,
  JWT = 3,
  API_KEY = 4
}

export interface MFAConfig {
  required: boolean;
  providers: MFAProviderType[];
  gracePeriod: number;
}

export enum MFAProviderType {
  TOTP = 0,
  SMS = 1,
  EMAIL = 2,
  HARDWARE_TOKEN = 3
}

export interface SessionConfig {
  timeoutMinutes: number;
  refreshEnabled: boolean;
  concurrentSessionsAllowed: number;
}

export interface AuthorizationConfig {
  rbac: RBACConfig;
  policies: PolicyConfig[];
  defaultPermissions: Permission[];
}

export interface RBACConfig {
  enabled: boolean;
  roles: Role[];
  bindings: RoleBinding[];
}

export interface Role {
  name: string;
  permissions: Permission[];
  constraints: RoleConstraint[];
}

export interface Permission {
  resource: string;
  actions: string[];
  conditions?: Record<string, unknown>;
}

export interface RoleConstraint {
  type: ConstraintType;
  value: string;
}

export enum ConstraintType {
  TIME_BASED = 0,
  IP_BASED = 1,
  LOCATION_BASED = 2,
  DEVICE_BASED = 3
}

export interface RoleBinding {
  role: string;
  subjects: Subject[];
  scope: BindingScope;
}

export interface Subject {
  type: SubjectType;
  name: string;
  namespace?: string;
}

export enum SubjectType {
  USER = 0,
  GROUP = 1,
  SERVICE_ACCOUNT = 2
}

export interface BindingScope {
  type: ScopeType;
  resources: string[];
}

export enum ScopeType {
  GLOBAL = 0,
  NAMESPACE = 1,
  REPOSITORY = 2,
  TEAM = 3
}

export interface PolicyConfig {
  name: string;
  type: PolicyType;
  rules: PolicyRule[];
  enforcement: EnforcementMode;
}

export enum PolicyType {
  ACCESS_CONTROL = 0,
  DATA_PROTECTION = 1,
  NETWORK_SECURITY = 2,
  COMPLIANCE = 3
}

export enum EnforcementMode {
  PERMISSIVE = 0,
  ENFORCING = 1,
  DISABLED = 2
}

export interface PolicyRule {
  condition: string;
  action: PolicyAction;
  parameters: Record<string, unknown>;
}

export enum PolicyAction {
  ALLOW = 0,
  DENY = 1,
  AUDIT = 2,
  TRANSFORM = 3
}

export interface EncryptionConfig {
  transitEncryption: TransitEncryptionConfig;
  restEncryption: RestEncryptionConfig;
  keyManagement: KeyManagementConfig;
}

export interface TransitEncryptionConfig {
  enabled: boolean;
  protocols: EncryptionProtocol[];
  cipherSuites: string[];
  certificateConfig: CertificateConfig;
}

export enum EncryptionProtocol {
  TLS_1_2 = 0,
  TLS_1_3 = 1
}

export interface CertificateConfig {
  source: CertificateSource;
  autoRotation: boolean;
  validityDays: number;
}

export enum CertificateSource {
  SELF_SIGNED = 0,
  CA_SIGNED = 1,
  CERT_MANAGER = 2,
  EXTERNAL = 3
}

export interface RestEncryptionConfig {
  enabled: boolean;
  algorithm: EncryptionAlgorithm;
  keyRotation: KeyRotationConfig;
}

export enum EncryptionAlgorithm {
  AES_256 = 0,
  AES_128 = 1,
  CHACHA20 = 2
}

export interface KeyRotationConfig {
  enabled: boolean;
  intervalDays: number;
  retentionDays: number;
}

export interface KeyManagementConfig {
  provider: KeyManagementProvider;
  keyIds: Record<string, string>;
  autoRotation: boolean;
}

export enum KeyManagementProvider {
  AWS_KMS = 0,
  AZURE_KEY_VAULT = 1,
  GCP_KMS = 2,
  HASHICORP_VAULT = 3,
  KUBERNETES_SECRETS = 4
}

export interface AuditLoggingConfig {
  enabled: boolean;
  level: AuditLevel;
  destinations: AuditDestination[];
  retention: RetentionConfig;
}

export enum AuditLevel {
  NONE = 0,
  METADATA = 1,
  REQUEST = 2,
  REQUEST_RESPONSE = 3
}

export interface AuditDestination {
  type: AuditDestinationType;
  configuration: Record<string, unknown>;
}

export enum AuditDestinationType {
  FILE = 0,
  SYSLOG = 1,
  WEBHOOK = 2,
  KAFKA = 3,
  ELASTICSEARCH = 4
}

export interface RetentionConfig {
  days: number;
  compressionEnabled: boolean;
  archivalEnabled: boolean;
}

export interface NetworkSecurityConfig {
  networkPolicies: NetworkPolicy[];
  firewallRules: FirewallRule[];
  vpnConfig?: VPNConfig;
}

export interface NetworkPolicy {
  name: string;
  enabled: boolean;
  ingress: IngressRule[];
  egress: EgressRule[];
  selector: Record<string, string>;
}

export interface IngressRule {
  ports: PortRule[];
  from: NetworkPolicyPeer[];
}

export interface EgressRule {
  ports: PortRule[];
  to: NetworkPolicyPeer[];
}

export interface PortRule {
  protocol: NetworkProtocol;
  port?: number;
  endPort?: number;
}

export enum NetworkProtocol {
  TCP = 0,
  UDP = 1,
  SCTP = 2
}

export interface NetworkPolicyPeer {
  podSelector?: Record<string, string>;
  namespaceSelector?: Record<string, string>;
  ipBlock?: IPBlock;
}

export interface IPBlock {
  cidr: string;
  except?: string[];
}

export interface FirewallRule {
  name: string;
  enabled: boolean;
  direction: TrafficDirection;
  action: FirewallAction;
  sources: string[];
  destinations: string[];
  ports: number[];
  protocols: NetworkProtocol[];
}

export enum TrafficDirection {
  INGRESS = 0,
  EGRESS = 1,
  BOTH = 2
}

export enum FirewallAction {
  ALLOW = 0,
  DENY = 1,
  LOG = 2
}

export interface VPNConfig {
  enabled: boolean;
  provider: VPNProvider;
  configuration: Record<string, unknown>;
}

export enum VPNProvider {
  OPENVPN = 0,
  WIREGUARD = 1,
  IPSEC = 2
}

export interface SecretManagementConfig {
  provider: SecretProvider;
  rotationSchedule: SecretRotationSchedule;
  accessControls: SecretAccessControl[];
}

export enum SecretProvider {
  KUBERNETES_SECRETS = 0,
  HASHICORP_VAULT = 1,
  AWS_SECRETS_MANAGER = 2,
  AZURE_KEY_VAULT = 3,
  GCP_SECRET_MANAGER = 4
}

export interface SecretRotationSchedule {
  enabled: boolean;
  intervalDays: number;
  notificationThresholdDays: number;
}

export interface SecretAccessControl {
  secretName: string;
  allowedSubjects: Subject[];
  accessLevel: SecretAccessLevel;
}

export enum SecretAccessLevel {
  READ = 0,
  WRITE = 1,
  ADMIN = 2
}

// Monitoring and Observability Types
export interface ObservabilityConfig {
  tracing: TracingConfig;
  metrics: MetricsConfig;
  logging: LoggingConfig;
  alerting: AlertingConfig;
  dashboards: DashboardConfig[];
}

export interface TracingConfig {
  enabled: boolean;
  provider: TracingProvider;
  samplingRate: number;
  exporters: TracingExporter[];
  resourceAttributes: Record<string, string>;
}

export enum TracingProvider {
  OPENTELEMETRY = 0,
  JAEGER = 1,
  ZIPKIN = 2,
  DATADOG = 3
}

export interface TracingExporter {
  type: ExporterType;
  endpoint: string;
  headers: Record<string, string>;
  compression: CompressionType;
}

export enum ExporterType {
  OTLP_HTTP = 0,
  OTLP_GRPC = 1,
  JAEGER = 2,
  ZIPKIN = 3
}

export enum CompressionType {
  NONE = 0,
  GZIP = 1,
  DEFLATE = 2
}

export interface MetricsConfig {
  enabled: boolean;
  provider: MetricsProvider;
  scrapeInterval: number;
  exporters: MetricsExporter[];
  customMetrics: MetricDefinition[];
}

export enum MetricsProvider {
  PROMETHEUS = 0,
  DATADOG = 1,
  NEW_RELIC = 2,
  CLOUDWATCH = 3
}

export interface MetricsExporter {
  type: MetricsExporterType;
  endpoint: string;
  pushInterval: number;
  headers: Record<string, string>;
}

export enum MetricsExporterType {
  PROMETHEUS = 0,
  OTLP = 1,
  DATADOG = 2
}

export interface MetricDefinition {
  name: string;
  type: MetricTypeDefinition;
  description: string;
  labels: string[];
  unit?: string;
}

export enum MetricTypeDefinition {
  COUNTER = 0,
  GAUGE = 1,
  HISTOGRAM = 2,
  SUMMARY = 3
}

export interface LoggingConfig {
  enabled: boolean;
  level: LogLevel;
  format: LogFormat;
  destinations: LogDestination[];
  correlationId: CorrelationIdConfig;
  sampling: LogSamplingConfig;
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export enum LogFormat {
  JSON = 0,
  TEXT = 1,
  STRUCTURED = 2
}

export interface LogDestination {
  type: LogDestinationType;
  configuration: Record<string, unknown>;
  filters: LogFilter[];
}

export enum LogDestinationType {
  CONSOLE = 0,
  FILE = 1,
  SYSLOG = 2,
  KAFKA = 3,
  ELASTICSEARCH = 4,
  FLUENTD = 5
}

export interface LogFilter {
  field: string;
  operator: FilterOperator;
  value: string;
}

export enum FilterOperator {
  EQUALS = 0,
  NOT_EQUALS = 1,
  CONTAINS = 2,
  NOT_CONTAINS = 3,
  REGEX = 4
}

export interface CorrelationIdConfig {
  enabled: boolean;
  headerName: string;
  generateIfMissing: boolean;
  propagate: boolean;
}

export interface LogSamplingConfig {
  enabled: boolean;
  rate: number;
  burstSize: number;
}

export interface AlertingConfig {
  enabled: boolean;
  provider: AlertProvider;
  rules: AlertRule[];
  channels: NotificationChannel[];
  escalation: EscalationPolicy[];
}

export enum AlertProvider {
  PROMETHEUS_ALERTMANAGER = 0,
  DATADOG = 1,
  PAGERDUTY = 2,
  OPSGENIE = 3
}

export interface AlertRule {
  name: string;
  enabled: boolean;
  query: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  duration: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface AlertCondition {
  operator: ComparisonOperator;
  threshold: number;
}

export enum ComparisonOperator {
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
  CRITICAL = 2,
  FATAL = 3
}

export interface NotificationChannel {
  name: string;
  type: ChannelType;
  enabled: boolean;
  configuration: Record<string, unknown>;
  filters: AlertFilter[];
}

export enum ChannelType {
  EMAIL = 0,
  SLACK = 1,
  WEBHOOK = 2,
  SMS = 3,
  PAGERDUTY = 4
}

export interface AlertFilter {
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface EscalationPolicy {
  name: string;
  enabled: boolean;
  steps: EscalationStep[];
  repeatInterval: string;
}

export interface EscalationStep {
  delay: string;
  channels: string[];
  action: EscalationAction;
}

export enum EscalationAction {
  NOTIFY = 0,
  PAGE = 1,
  AUTO_RESOLVE = 2,
  SUPPRESS = 3
}

export interface DashboardConfig {
  name: string;
  enabled: boolean;
  provider: DashboardProvider;
  panels: DashboardPanel[];
  refreshInterval: string;
  timeRange: TimeRange;
}

export enum DashboardProvider {
  GRAFANA = 0,
  DATADOG = 1,
  NEW_RELIC = 2,
  CUSTOM = 3
}

export interface DashboardPanel {
  name: string;
  type: PanelType;
  query: string;
  visualization: VisualizationConfig;
  position: PanelPosition;
}

export enum PanelType {
  GRAPH = 0,
  STAT = 1,
  TABLE = 2,
  HEATMAP = 3,
  GAUGE = 4
}

export interface VisualizationConfig {
  displayMode: DisplayMode;
  colorScheme: string;
  thresholds: Threshold[];
}

export enum DisplayMode {
  LIST = 0,
  BASIC = 1,
  GRADIENT = 2,
  LCD = 3
}

export interface Threshold {
  value: number;
  color: string;
}

export interface PanelPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimeRange {
  from: string;
  to: string;
}

// Enterprise Scaling Runtime Types
export interface ScalingInstance {
  instanceId: string;
  role: InstanceRole;
  status: InstanceStatus;
  configuration: InstanceConfiguration;
  metrics: InstanceMetrics;
  lastHeartbeat: Date;
  startTime: Date;
}

export enum InstanceRole {
  LEADER = 0,
  FOLLOWER = 1,
  CANDIDATE = 2,
  OBSERVER = 3
}

export enum InstanceStatus {
  STARTING = 0,
  HEALTHY = 1,
  UNHEALTHY = 2,
  SHUTTING_DOWN = 3,
  FAILED = 4
}

export interface InstanceConfiguration {
  repositoryConfigurations: RepositoryConfiguration[];
  haConfiguration: HAConfiguration;
  autoScalingConfig: AutoScalingConfig;
  securityConfig: RepositorySecurityConfig;
  observabilityConfig: ObservabilityConfig;
}

export interface InstanceMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  diskUtilization: number;
  networkIn: number;
  networkOut: number;
  coordinationLatency: number;
  activeConnections: number;
  requestRate: number;
  errorRate: number;
  customMetrics: Record<string, number>;
}

// Cross-Repository Coordination Types
export interface CrossRepositoryWave {
  waveId: string;
  participatingRepositories: string[];
  synchronizationPoints: SynchronizationPoint[];
  dependencies: CrossRepoDependency[];
  status: CrossRepoWaveStatus;
  startTime: Date;
  estimatedEndTime: Date;
  actualEndTime?: Date;
}

export interface SynchronizationPoint {
  pointId: string;
  name: string;
  repositories: string[];
  condition: SyncCondition;
  timeout: number;
  status: SyncPointStatus;
}

export interface SyncCondition {
  type: SyncConditionType;
  criteria: Record<string, unknown>;
}

export enum SyncConditionType {
  ALL_READY = 0,
  MAJORITY_READY = 1,
  SPECIFIC_COUNT = 2,
  TIME_BASED = 3,
  CUSTOM = 4
}

export enum SyncPointStatus {
  WAITING = 0,
  READY = 1,
  SYNCHRONIZED = 2,
  TIMEOUT = 3,
  FAILED = 4
}

export interface CrossRepoDependency {
  sourceRepository: string;
  targetRepository: string;
  sourceTask: string;
  targetTask: string;
  dependencyType: DependencyType;
  status: CrossDepStatus;
}

export enum CrossDepStatus {
  PENDING = 0,
  SATISFIED = 1,
  VIOLATED = 2,
  TIMEOUT = 3
}

export enum CrossRepoWaveStatus {
  INITIALIZING = 0,
  SYNCHRONIZING = 1,
  EXECUTING = 2,
  COMPLETING = 3,
  COMPLETED = 4,
  FAILED = 5,
  CANCELLED = 6
}

// Error Types for Scaling Infrastructure
export class ScalingConfigurationError extends Error {
  constructor(
    message: string,
    public readonly component: string,
    public readonly configurationKey: string,
    public readonly invalidValue?: unknown
  ) {
    super(message);
    this.name = 'ScalingConfigurationError';
  }
}

export class MultiRepositoryCoordinationError extends Error {
  constructor(
    message: string,
    public readonly repositoryId: string,
    public readonly operationType: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MultiRepositoryCoordinationError';
  }
}

export class HighAvailabilityError extends Error {
  constructor(
    message: string,
    public readonly instanceId: string,
    public readonly role: InstanceRole,
    public readonly recoveryAction?: string
  ) {
    super(message);
    this.name = 'HighAvailabilityError';
  }
}

export class AutoScalingError extends Error {
  constructor(
    message: string,
    public readonly scalingType: string,
    public readonly currentReplicas: number,
    public readonly targetReplicas: number,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'AutoScalingError';
  }
}

export class SecurityViolationError extends Error {
  constructor(
    message: string,
    public readonly violationType: string,
    public readonly resource: string,
    public readonly subject: string,
    public readonly action: string
  ) {
    super(message);
    this.name = 'SecurityViolationError';
  }
}

export class ObservabilityError extends Error {
  constructor(
    message: string,
    public readonly component: ObservabilityComponent,
    public readonly operation: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ObservabilityError';
  }
}

export enum ObservabilityComponent {
  TRACING = 0,
  METRICS = 1,
  LOGGING = 2,
  ALERTING = 3,
  DASHBOARD = 4
}