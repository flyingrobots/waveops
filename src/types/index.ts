/**
 * Core type definitions for WaveOps
 */

export interface WaveState {
  plan: string;
  wave: number;
  tz: string;
  teams: Record<string, TeamState>;
  all_ready: boolean;
  updated_at: string;
}

export interface TeamState {
  status: 'ready' | 'in_progress' | 'blocked';
  at?: string;
  reason?: string;
  tasks: string[];
}

export interface Task {
  id: string;
  title: string;
  wave: number;
  team: string;
  depends_on: string[];
  acceptance: string[];
  critical: boolean;
  created_at: string;
  updated_at: string;
}

// GitHub API types
export interface GitHubDeployment {
  id: number;
  environment: string;
  ref: string;
  description: string;
  created_at: string;
  updated_at: string;
  statuses_url: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null;
  output?: {
    title: string;
    summary: string;
  };
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  labels?: ({ name?: string } | string)[];
  assignees?: { login: string }[];
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  merged: boolean;
  merge_commit_sha: string | null;
  state: 'open' | 'closed';
  user: {
    login: string;
  };
}

export interface GitHubCommitStatus {
  state: 'pending' | 'success' | 'failure' | 'error';
  context: string;
  description: string;
  target_url: string | null;
}

export interface GitHubCommitChecks {
  statuses: GitHubCommitStatus[];
  checkRuns: GitHubCheckRun[];
  state: 'pending' | 'success' | 'failure' | 'error';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null;
  total_count: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

// Metrics and Analytics types
export interface WaveMetrics {
  waveId: string;
  planName: string;
  waveNumber: number;
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  teamMetrics: Record<string, TeamMetrics>;
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  criticalPath: string[];
  bottlenecks: BottleneckInfo[];
}

export interface TeamMetrics {
  teamId: string;
  occupancy: number; // percentage of team capacity utilized
  barrierStallPercent: number; // time spent waiting for dependencies
  readySkew: number; // variance in task readiness across team
  warpDivergence: WarpDivergenceStats; // task execution synchronization
  firstPassCI: number; // percentage of tasks passing CI on first try  
  reviewLatency: LatencyStats; // code review response times
  velocity: number; // tasks completed per time unit
  throughput: number; // work items processed
  defectRate: number; // percentage of tasks requiring rework
  communicationOverhead: number; // time spent in coordination
}

export interface WarpDivergenceStats {
  median: number;
  p95: number;
  maxDivergence: number;
  convergenceTime: number;
}

export interface LatencyStats {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
}

export interface BottleneckInfo {
  type: 'dependency' | 'resource' | 'approval' | 'external' | 'technical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedTasks: string[];
  affectedTeams: string[];
  estimatedDelay: number; // milliseconds
  description: string;
  detectedAt: Date;
  resolvedAt?: Date;
}

export interface PerformancePattern {
  patternId: string;
  type: 'anti_pattern' | 'best_practice' | 'anomaly';
  name: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  frequency: number; // how often this pattern occurs
  impact: 'low' | 'medium' | 'high' | 'critical';
  affectedMetrics: string[];
  recommendations: string[];
  detectionConfidence: number; // 0-1 confidence score
}

export interface WaveRecommendation {
  id: string;
  type: 'team_rebalancing' | 'dependency_optimization' | 'process_improvement' | 'resource_allocation' | 'timing_adjustment';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  effort: 'minimal' | 'low' | 'medium' | 'high';
  timeframe: 'immediate' | 'next_wave' | 'next_sprint' | 'long_term';
  affectedTeams: string[];
  metrics: string[]; // which metrics this recommendation aims to improve
  confidence: number; // 0-1 confidence in recommendation
}

export interface WavePrediction {
  waveId: string;
  estimatedCompletionTime: Date;
  confidenceInterval: {
    lower: Date;
    upper: Date;
  };
  riskFactors: RiskFactor[];
  criticalPathDuration: number;
  probabilityOfOnTimeCompletion: number; // 0-1
  recommendedStartTime?: Date;
}

export interface RiskFactor {
  type: 'dependency' | 'resource' | 'technical' | 'external' | 'team';
  description: string;
  probability: number; // 0-1
  impact: number; // estimated delay in milliseconds
  mitigation: string;
}

export interface MetricsSnapshot {
  timestamp: Date;
  waveId: string;
  teams: Record<string, TeamSnapshot>;
  systemMetrics: SystemMetrics;
}

export interface TeamSnapshot {
  teamId: string;
  activeTasks: number;
  blockedTasks: number;
  completedTasks: number;
  currentLoad: number; // percentage
  averageTaskDuration: number;
  lastActivity: Date;
}

export interface SystemMetrics {
  totalActiveWaves: number;
  totalTeams: number;
  systemThroughput: number;
  averageWaveDuration: number;
  systemLoad: number; // percentage
  healthScore: number; // 0-100
}

export interface AnalyticsConfig {
  owner: string; // GitHub repository owner
  repo: string; // GitHub repository name
  collectionInterval: number; // milliseconds
  retentionPeriod: number; // milliseconds
  analysisWindowSize: number; // number of waves to analyze
  alertThresholds: AlertThresholds;
  enablePredictiveAnalytics: boolean;
  enableRealTimeAnalysis: boolean;
}

export interface AlertThresholds {
  highBarrierStall: number; // percentage
  lowOccupancy: number; // percentage
  highReviewLatency: number; // milliseconds
  criticalBottleneckDelay: number; // milliseconds
  lowFirstPassCI: number; // percentage
  highWarpDivergence: number; // milliseconds
}

// Rolling Frontier Types
export interface TeamCapacity {
  team: string;
  maxConcurrentTasks: number;
  currentLoad: number;
  velocity: number; // tasks per time unit
  efficiency: number; // 0-1 quality metric
  availability: number; // 0-1 time availability
  specializations: string[]; // technical capabilities
}

export interface DependencyNode {
  taskId: string;
  dependsOn: string[];
  dependedBy: string[];
  state: DependencyState;
  wave: number;
  team: string;
  estimatedEffort: number;
  criticalPath: boolean;
  blockingFactor: number; // how many tasks this blocks
}

export enum DependencyState {
  WAITING = 0,
  READY = 1,
  IN_PROGRESS = 2,
  COMPLETED = 3,
  BLOCKED = 4,
  FAILED = 5
}

export interface WaveBoundary {
  waveNumber: number;
  startTime: Date;
  estimatedEndTime: Date;
  actualEndTime?: Date;
  tasks: string[];
  teams: string[];
  readinessScore: number; // 0-1
  criticalPathLength: number;
  parallelism: number; // max concurrent tasks
}

export interface FrontierMetrics {
  currentWave: number;
  activeTasks: number;
  completedTasks: number;
  blockedTasks: number;
  averageVelocity: number;
  throughput: number; // tasks per time unit
  coordinationOverhead: number; // 0-1
  bottleneckTeams: string[];
  criticalPathDelay: number;
  predictedCompletionTime: Date;
}

export interface FrontierOptimization {
  action: FrontierAction;
  target: string; // task or team ID
  reason: string;
  impact: OptimizationImpact;
  confidence: number; // 0-1
  urgency: OptimizationUrgency;
}

export enum FrontierAction {
  PROMOTE_TASK = 0,
  DELAY_TASK = 1,
  REASSIGN_TASK = 2,
  SPLIT_WAVE = 3,
  MERGE_WAVES = 4,
  ADJUST_CAPACITY = 5,
  RESOLVE_DEPENDENCY = 6
}

export enum OptimizationUrgency {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3
}

export interface OptimizationImpact {
  throughputChange: number; // delta in tasks per time
  delayReduction: number; // time saved
  resourceEfficiency: number; // 0-1
  riskLevel: number; // 0-1
}

export interface FrontierState {
  currentBoundaries: WaveBoundary[];
  metrics: FrontierMetrics;
  optimizations: FrontierOptimization[];
  dependencyGraph: Map<string, DependencyNode>;
  teamCapacities: Map<string, TeamCapacity>;
  lastUpdate: Date;
  coordinationVersion: number;
}

// Custom Error Types for Frontier System
export class FrontierCalculationError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown>,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'FrontierCalculationError';
  }
}

export class DependencyViolationError extends Error {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly violatedDependency: string,
    public readonly wave: number
  ) {
    super(message);
    this.name = 'DependencyViolationError';
  }
}

export class CapacityOverflowError extends Error {
  constructor(
    message: string,
    public readonly team: string,
    public readonly requestedLoad: number,
    public readonly maxCapacity: number
  ) {
    super(message);
    this.name = 'CapacityOverflowError';
  }
}

export class OptimizationConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictingOptimizations: FrontierOptimization[],
    public readonly resolution: string
  ) {
    super(message);
    this.name = 'OptimizationConflictError';
  }
}

// Work Stealing System Types
export interface TeamUtilization {
  teamId: string;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  capacity: number;
  utilizationRate: number;
  estimatedCompletionTime: number;
  skills: TeamSkill[];
}

export interface TeamSkill {
  skill: string;
  proficiency: number; // 0-1 scale
  availability: number; // 0-1 scale
}

export interface TaskRequirement {
  skill: string;
  minimumProficiency: number;
  importance: number; // 0-1 scale for task priority
}

export interface WorkStealingCandidate {
  taskId: string;
  originalTeam: string;
  candidateTeams: string[];
  transferCost: number;
  expectedBenefit: number;
  dependencyRisk: number;
  skillMatch: number;
}

export interface WorkTransferRequest {
  taskId: string;
  fromTeam: string;
  toTeam: string;
  reason: WorkStealingReason;
  estimatedImpact: TransferImpact;
  approvalRequired: boolean;
}

export interface TransferImpact {
  originalTeamDelayReduction: number;
  targetTeamDelayIncrease: number;
  overallThroughputGain: number;
  coordinationOverhead: number;
  riskFactor: number;
}

export enum WorkStealingReason {
  CAPACITY_IMBALANCE = 0,
  SKILL_MISMATCH = 1,
  CRITICAL_PATH = 2,
  EMERGENCY_REBALANCING = 3,
  PROACTIVE_OPTIMIZATION = 4
}

export interface LoadBalanceMetrics {
  totalUtilization: number;
  utilizationVariance: number;
  bottleneckTeams: string[];
  underutilizedTeams: string[];
  recommendedTransfers: WorkStealingCandidate[];
}

export interface WorkStealingConfig {
  enabled: boolean;
  utilizationThreshold: number;
  imbalanceThreshold: number;
  minimumTransferBenefit: number;
  maxTransfersPerWave: number;
  skillMatchThreshold: number;
  coordinationOverheadWeight: number;
  proactiveStealingEnabled: boolean;
  emergencyStealingEnabled: boolean;
}

// Custom Error Types for Work Stealing
export class WorkStealingError extends Error {
  constructor(
    message: string,
    public readonly code: WorkStealingErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WorkStealingError';
  }
}

export enum WorkStealingErrorCode {
  INSUFFICIENT_CAPACITY = 0,
  SKILL_MISMATCH = 1,
  DEPENDENCY_VIOLATION = 2,
  TRANSFER_REJECTED = 3,
  COORDINATION_FAILURE = 4,
  INVALID_CONFIGURATION = 5
}