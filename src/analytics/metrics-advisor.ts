/**
 * Metrics Advisor - Main coordination analytics and recommendation engine
 */

import {
  WaveState,
  Task,
  WaveMetrics,
  WaveRecommendation,
  PerformancePattern,
  WavePrediction,
  AnalyticsConfig,
  TeamMetrics,
  AlertThresholds
} from '../types';
import { MetricsCollector } from './metrics-collector';
import { PerformanceAnalyzer } from './performance-analyzer';
import { GitHubClient } from '../github/client';
import { AnalyticsError, ConfigurationError, MetricsCollectionError } from './errors';

interface IMetricsAdvisor {
  analyzeWavePerformance(_waveState: WaveState, _tasks: Task[]): Promise<WaveAnalysisResult>;
  generateRecommendations(_waveMetrics: WaveMetrics, _patterns: PerformancePattern[]): Promise<WaveRecommendation[]>;
  predictWaveOutcome(_waveState: WaveState, _tasks: Task[]): Promise<WavePrediction>;
  createPerformanceDashboard(_waveId: string): Promise<PerformanceDashboard>;
  generateAlerts(_currentMetrics: WaveMetrics, _thresholds: AlertThresholds): Promise<Alert[]>;
  exportMetricsReport(_waveId: string, _format: 'json' | 'summary'): Promise<string>;
}

export interface WaveAnalysisResult {
  metrics: WaveMetrics;
  patterns: PerformancePattern[];
  recommendations: WaveRecommendation[];
  prediction: WavePrediction;
  healthScore: number;
  alerts: Alert[];
}

export interface PerformanceDashboard {
  waveId: string;
  summary: WaveSummary;
  teamPerformance: Record<string, TeamPerformanceSummary>;
  trends: Record<string, number>;
  criticalIssues: PerformancePattern[];
  recommendations: WaveRecommendation[];
  lastUpdated: Date;
}

export interface WaveSummary {
  status: string;
  progress: number; // 0-100
  estimatedCompletion: Date;
  healthScore: number;
  activeBottlenecks: number;
  teamCount: number;
  taskCompletion: {
    total: number;
    completed: number;
    blocked: number;
    remaining: number;
  };
}

export interface TeamPerformanceSummary {
  teamId: string;
  healthScore: number;
  occupancy: number;
  velocity: number;
  qualityScore: number;
  blockers: string[];
  recommendations: string[];
}

export interface Alert {
  id: string;
  type: 'performance' | 'quality' | 'blocking' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedTeams: string[];
  actionRequired: boolean;
  recommendedActions: string[];
  createdAt: Date;
  estimatedImpact: string;
}

export class MetricsAdvisor implements IMetricsAdvisor {
  private readonly metricsCollector: MetricsCollector;
  private readonly performanceAnalyzer: PerformanceAnalyzer;
  private readonly githubClient: GitHubClient;
  private readonly config: AnalyticsConfig;
  private readonly historicalData: Map<string, WaveMetrics[]>;
  private readonly alertHistory: Map<string, Alert[]>;

  constructor(
    githubClient: GitHubClient,
    config: AnalyticsConfig
  ) {
    this.validateConfiguration(config);
    
    this.githubClient = githubClient;
    this.config = config;
    this.metricsCollector = new MetricsCollector(githubClient, config);
    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.historicalData = new Map();
    this.alertHistory = new Map();
  }

  /**
   * Perform comprehensive wave performance analysis
   */
  public async analyzeWavePerformance(waveState: WaveState, tasks: Task[]): Promise<WaveAnalysisResult> {
    try {
      // Collect current wave metrics
      const metrics = await this.metricsCollector.collectWaveMetrics(waveState, tasks);
      
      // Get historical data for analysis
      const waveId = metrics.waveId;
      const historical = await this.getHistoricalMetrics(waveId);
      
      // Detect performance patterns
      const allMetrics = [...historical, metrics];
      const patterns = await this.performanceAnalyzer.detectPerformancePatterns(allMetrics, this.config);
      
      // Generate actionable recommendations
      const recommendations = await this.generateRecommendations(metrics, patterns);
      
      // Predict wave outcome
      const prediction = await this.performanceAnalyzer.predictWaveCompletion(metrics, historical, tasks);
      
      // Calculate overall health score
      const healthScore = this.calculateWaveHealthScore(metrics, patterns);
      
      // Generate alerts for immediate attention
      const alerts = await this.generateAlerts(metrics, this.config.alertThresholds);
      
      // Store metrics for historical analysis
      this.storeMetrics(waveId, metrics);
      
      return {
        metrics,
        patterns,
        recommendations,
        prediction,
        healthScore,
        alerts
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AnalyticsError(
        `Failed to analyze wave performance: ${errorMessage}`,
        'WAVE_ANALYSIS_ERROR',
        { waveId: `${waveState.plan}_wave_${waveState.wave}`, error: errorMessage }
      );
    }
  }

  /**
   * Generate actionable recommendations based on metrics and patterns
   */
  public async generateRecommendations(
    waveMetrics: WaveMetrics,
    patterns: PerformancePattern[]
  ): Promise<WaveRecommendation[]> {
    try {
      const recommendations: WaveRecommendation[] = [];

      // Generate pattern-based recommendations
      for (const pattern of patterns) {
        const patternRecommendations = await this.createPatternRecommendations(pattern, waveMetrics);
        recommendations.push(...patternRecommendations);
      }

      // Generate metric-based recommendations
      const metricRecommendations = await this.createMetricBasedRecommendations(waveMetrics);
      recommendations.push(...metricRecommendations);

      // Generate team-specific recommendations
      const teamRecommendations = await this.createTeamRecommendations(waveMetrics);
      recommendations.push(...teamRecommendations);

      // Sort by priority and confidence
      recommendations.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        return priorityDiff !== 0 ? priorityDiff : b.confidence - a.confidence;
      });

      // Limit to top 10 recommendations to avoid overwhelming users
      return recommendations.slice(0, 10);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AnalyticsError(
        `Failed to generate recommendations: ${errorMessage}`,
        'RECOMMENDATION_GENERATION_ERROR',
        { waveId: waveMetrics.waveId, patternsCount: patterns.length }
      );
    }
  }

  /**
   * Predict wave outcome using current state and historical data
   */
  public async predictWaveOutcome(waveState: WaveState, tasks: Task[]): Promise<WavePrediction> {
    try {
      const currentMetrics = await this.metricsCollector.collectWaveMetrics(waveState, tasks);
      const historicalData = await this.getHistoricalMetrics(currentMetrics.waveId);
      
      return await this.performanceAnalyzer.predictWaveCompletion(currentMetrics, historicalData, tasks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AnalyticsError(
        `Failed to predict wave outcome: ${errorMessage}`,
        'PREDICTION_ERROR',
        { waveId: `${waveState.plan}_wave_${waveState.wave}` }
      );
    }
  }

  /**
   * Create a comprehensive performance dashboard
   */
  public async createPerformanceDashboard(waveId: string): Promise<PerformanceDashboard> {
    try {
      const historicalMetrics = await this.getHistoricalMetrics(waveId);
      const currentMetrics = historicalMetrics[historicalMetrics.length - 1];
      
      if (!currentMetrics) {
        throw new MetricsCollectionError(`No metrics found for wave ${waveId}`);
      }

      // Generate dashboard components
      const summary = this.createWaveSummary(currentMetrics);
      const teamPerformance = this.createTeamPerformanceSummaries(currentMetrics);
      const trends = await this.performanceAnalyzer.calculateTrends(historicalMetrics, 5);
      const patterns = await this.performanceAnalyzer.detectPerformancePatterns(historicalMetrics, this.config);
      const criticalIssues = patterns.filter(p => p.severity === 'critical' || p.severity === 'error');
      const recommendations = await this.generateRecommendations(currentMetrics, patterns);

      return {
        waveId,
        summary,
        teamPerformance,
        trends,
        criticalIssues,
        recommendations: recommendations.slice(0, 5), // Top 5 for dashboard
        lastUpdated: new Date()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AnalyticsError(
        `Failed to create performance dashboard: ${errorMessage}`,
        'DASHBOARD_CREATION_ERROR',
        { waveId }
      );
    }
  }

  /**
   * Generate alerts for immediate attention based on thresholds
   */
  public async generateAlerts(currentMetrics: WaveMetrics, thresholds: AlertThresholds): Promise<Alert[]> {
    try {
      const alerts: Alert[] = [];

      // Check for high barrier stall
      for (const [teamId, teamMetrics] of Object.entries(currentMetrics.teamMetrics)) {
        if (teamMetrics.barrierStallPercent > thresholds.highBarrierStall) {
          alerts.push({
            id: `barrier_stall_${teamId}_${Date.now()}`,
            type: 'blocking',
            severity: teamMetrics.barrierStallPercent > 60 ? 'critical' : 'high',
            title: `High Dependency Wait Time - ${teamId}`,
            description: `Team ${teamId} is experiencing ${teamMetrics.barrierStallPercent.toFixed(1)}% barrier stall time`,
            affectedTeams: [teamId],
            actionRequired: true,
            recommendedActions: [
              'Review and parallelize dependencies',
              'Consider task reordering',
              'Implement dependency caching'
            ],
            createdAt: new Date(),
            estimatedImpact: 'High - Could delay wave completion by hours'
          });
        }

        // Check for low occupancy
        if (teamMetrics.occupancy < thresholds.lowOccupancy) {
          alerts.push({
            id: `low_occupancy_${teamId}_${Date.now()}`,
            type: 'resource',
            severity: 'medium',
            title: `Low Team Utilization - ${teamId}`,
            description: `Team ${teamId} is operating at only ${teamMetrics.occupancy.toFixed(1)}% capacity`,
            affectedTeams: [teamId],
            actionRequired: false,
            recommendedActions: [
              'Redistribute workload',
              'Assign additional tasks',
              'Cross-train team members'
            ],
            createdAt: new Date(),
            estimatedImpact: 'Medium - Opportunity for increased throughput'
          });
        }

        // Check for low first-pass CI
        if (teamMetrics.firstPassCI < thresholds.lowFirstPassCI) {
          alerts.push({
            id: `low_ci_success_${teamId}_${Date.now()}`,
            type: 'quality',
            severity: 'high',
            title: `Low CI Success Rate - ${teamId}`,
            description: `Team ${teamId} has only ${teamMetrics.firstPassCI.toFixed(1)}% first-pass CI success`,
            affectedTeams: [teamId],
            actionRequired: true,
            recommendedActions: [
              'Implement additional code review',
              'Enhance automated testing',
              'Provide development training'
            ],
            createdAt: new Date(),
            estimatedImpact: 'High - Quality issues may require significant rework'
          });
        }
      }

      // Check for critical bottlenecks
      const criticalBottlenecks = currentMetrics.bottlenecks.filter(b => 
        b.severity === 'critical' && b.estimatedDelay > thresholds.criticalBottleneckDelay
      );

      for (const bottleneck of criticalBottlenecks) {
        alerts.push({
          id: `critical_bottleneck_${Date.now()}`,
          type: 'blocking',
          severity: 'critical',
          title: `Critical Bottleneck Detected`,
          description: bottleneck.description,
          affectedTeams: bottleneck.affectedTeams,
          actionRequired: true,
          recommendedActions: [
            'Immediately review blocking dependencies',
            'Consider parallel execution paths',
            'Escalate to leadership if external'
          ],
          createdAt: new Date(),
          estimatedImpact: `Critical - Estimated ${Math.round(bottleneck.estimatedDelay / (60 * 60 * 1000))} hour delay`
        });
      }

      // Store alerts for history tracking
      this.alertHistory.set(currentMetrics.waveId, alerts);

      return alerts;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AnalyticsError(
        `Failed to generate alerts: ${errorMessage}`,
        'ALERT_GENERATION_ERROR',
        { waveId: currentMetrics.waveId }
      );
    }
  }

  /**
   * Export metrics report in specified format
   */
  public async exportMetricsReport(waveId: string, format: 'json' | 'summary'): Promise<string> {
    try {
      const dashboard = await this.createPerformanceDashboard(waveId);
      
      if (format === 'json') {
        return JSON.stringify(dashboard, null, 2);
      } else {
        return this.createSummaryReport(dashboard);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AnalyticsError(
        `Failed to export metrics report: ${errorMessage}`,
        'REPORT_EXPORT_ERROR',
        { waveId, format }
      );
    }
  }

  // Private helper methods

  private validateConfiguration(config: AnalyticsConfig): void {
    if (!config) {
      throw new ConfigurationError('Analytics configuration is required');
    }

    const required = ['collectionInterval', 'retentionPeriod', 'alertThresholds'];
    for (const field of required) {
      if (!(field in config)) {
        throw new ConfigurationError(`Missing required configuration field: ${field}`);
      }
    }

    if (config.collectionInterval < 1000) {
      throw new ConfigurationError('Collection interval must be at least 1000ms');
    }
  }

  private async getHistoricalMetrics(waveId: string): Promise<WaveMetrics[]> {
    // In a production system, this would query a time-series database
    return this.historicalData.get(waveId) || [];
  }

  private storeMetrics(waveId: string, metrics: WaveMetrics): void {
    const existing = this.historicalData.get(waveId) || [];
    existing.push(metrics);
    
    // Limit historical data based on retention period
    const retentionCutoff = new Date(Date.now() - this.config.retentionPeriod);
    const filtered = existing.filter(m => m.startTime >= retentionCutoff);
    
    this.historicalData.set(waveId, filtered);
  }

  private calculateWaveHealthScore(metrics: WaveMetrics, patterns: PerformancePattern[]): number {
    let score = 100;

    // Deduct points for completion rate
    const completionRate = metrics.completedTasks / (metrics.totalTasks || 1);
    score -= (1 - completionRate) * 30;

    // Deduct points for bottlenecks
    const criticalBottlenecks = metrics.bottlenecks.filter(b => b.severity === 'critical').length;
    score -= criticalBottlenecks * 15;

    // Deduct points for critical patterns
    const criticalPatterns = patterns.filter(p => p.severity === 'critical' || p.severity === 'error').length;
    score -= criticalPatterns * 10;

    // Factor in team health
    const teamHealthScores = Object.values(metrics.teamMetrics).map(team => {
      let teamScore = 100;
      teamScore -= Math.max(0, 80 - team.occupancy); // Penalize low occupancy
      teamScore -= Math.max(0, team.barrierStallPercent - 20); // Penalize high stall
      teamScore -= Math.max(0, 80 - team.firstPassCI); // Penalize low CI success
      return Math.max(0, teamScore);
    });

    const avgTeamHealth = teamHealthScores.reduce((sum, score) => sum + score, 0) / teamHealthScores.length;
    score = score * 0.7 + avgTeamHealth * 0.3; // Weighted average

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private async createPatternRecommendations(
    pattern: PerformancePattern,
    waveMetrics: WaveMetrics
  ): Promise<WaveRecommendation[]> {
    const recommendations: WaveRecommendation[] = [];

    for (let i = 0; i < pattern.recommendations.length; i++) {
      const recommendation = pattern.recommendations[i];
      
      recommendations.push({
        id: `${pattern.patternId}_rec_${i}_${Date.now()}`,
        type: this.mapPatternToRecommendationType(pattern),
        priority: this.mapSeverityToPriority(pattern.severity),
        title: `Address ${pattern.name}`,
        description: recommendation,
        rationale: pattern.description,
        expectedImpact: `Improvement in ${pattern.affectedMetrics.join(', ')}`,
        effort: this.estimateEffortFromPattern(pattern),
        timeframe: this.determineTimeframe(pattern.severity),
        affectedTeams: this.determineAffectedTeams(pattern, waveMetrics),
        metrics: pattern.affectedMetrics,
        confidence: pattern.detectionConfidence
      });
    }

    return recommendations;
  }

  private async createMetricBasedRecommendations(waveMetrics: WaveMetrics): Promise<WaveRecommendation[]> {
    const recommendations: WaveRecommendation[] = [];

    // Analyze team occupancy imbalance
    const occupancies = Object.values(waveMetrics.teamMetrics).map(team => team.occupancy);
    const maxVariance = Math.max(...occupancies) - Math.min(...occupancies);

    if (maxVariance > 30) {
      recommendations.push({
        id: `occupancy_balance_${Date.now()}`,
        type: 'team_rebalancing',
        priority: 'medium',
        title: 'Balance Team Workloads',
        description: 'Redistribute tasks to balance team utilization levels',
        rationale: `High variance in team occupancy (${maxVariance.toFixed(1)}%) indicates uneven workload distribution`,
        expectedImpact: 'Improved overall throughput and reduced completion time',
        effort: 'medium',
        timeframe: 'next_wave',
        affectedTeams: Object.keys(waveMetrics.teamMetrics),
        metrics: ['occupancy', 'throughput'],
        confidence: 0.8
      });
    }

    return recommendations;
  }

  private async createTeamRecommendations(waveMetrics: WaveMetrics): Promise<WaveRecommendation[]> {
    const recommendations: WaveRecommendation[] = [];

    for (const [teamId, teamMetrics] of Object.entries(waveMetrics.teamMetrics)) {
      // High barrier stall recommendation
      if (teamMetrics.barrierStallPercent > 40) {
        recommendations.push({
          id: `${teamId}_dependency_opt_${Date.now()}`,
          type: 'dependency_optimization',
          priority: 'high',
          title: `Optimize Dependencies for ${teamId}`,
          description: 'Reduce dependency wait times through parallelization and caching',
          rationale: `Team ${teamId} is spending ${teamMetrics.barrierStallPercent.toFixed(1)}% of time waiting on dependencies`,
          expectedImpact: 'Reduced wait times and faster task completion',
          effort: 'medium',
          timeframe: 'immediate',
          affectedTeams: [teamId],
          metrics: ['barrierStallPercent', 'velocity'],
          confidence: 0.85
        });
      }
    }

    return recommendations;
  }

  private createWaveSummary(metrics: WaveMetrics): WaveSummary {
    const progress = (metrics.completedTasks / (metrics.totalTasks || 1)) * 100;
    
    return {
      status: metrics.status,
      progress: Math.round(progress),
      estimatedCompletion: metrics.endTime || new Date(Date.now() + (metrics.duration || 0)),
      healthScore: this.calculateWaveHealthScore(metrics, []),
      activeBottlenecks: metrics.bottlenecks.filter(b => !b.resolvedAt).length,
      teamCount: Object.keys(metrics.teamMetrics).length,
      taskCompletion: {
        total: metrics.totalTasks,
        completed: metrics.completedTasks,
        blocked: metrics.blockedTasks,
        remaining: metrics.totalTasks - metrics.completedTasks
      }
    };
  }

  private createTeamPerformanceSummaries(metrics: WaveMetrics): Record<string, TeamPerformanceSummary> {
    const summaries: Record<string, TeamPerformanceSummary> = {};

    for (const [teamId, teamMetrics] of Object.entries(metrics.teamMetrics)) {
      const healthScore = this.calculateTeamHealthScore(teamMetrics);
      const blockers = metrics.bottlenecks
        .filter(b => b.affectedTeams.includes(teamId) && !b.resolvedAt)
        .map(b => b.description);

      summaries[teamId] = {
        teamId,
        healthScore,
        occupancy: teamMetrics.occupancy,
        velocity: teamMetrics.velocity,
        qualityScore: teamMetrics.firstPassCI,
        blockers,
        recommendations: this.generateQuickTeamRecommendations(teamMetrics)
      };
    }

    return summaries;
  }

  private calculateTeamHealthScore(teamMetrics: TeamMetrics): number {
    let score = 100;
    
    // Factor in occupancy (optimal around 80%)
    const occupancyDiff = Math.abs(teamMetrics.occupancy - 80);
    score -= occupancyDiff * 0.5;
    
    // Factor in barrier stall
    score -= teamMetrics.barrierStallPercent * 0.8;
    
    // Factor in first pass CI
    score -= (100 - teamMetrics.firstPassCI) * 0.6;
    
    // Factor in defect rate
    score -= teamMetrics.defectRate * 0.7;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generateQuickTeamRecommendations(teamMetrics: TeamMetrics): string[] {
    const recommendations: string[] = [];

    if (teamMetrics.occupancy < 60) {
      recommendations.push('Increase task assignment to improve utilization');
    }
    if (teamMetrics.barrierStallPercent > 30) {
      recommendations.push('Review and optimize dependencies');
    }
    if (teamMetrics.firstPassCI < 70) {
      recommendations.push('Enhance code review and testing practices');
    }
    if (teamMetrics.defectRate > 20) {
      recommendations.push('Implement additional quality assurance measures');
    }

    return recommendations;
  }

  private createSummaryReport(dashboard: PerformanceDashboard): string {
    const lines: string[] = [];
    
    lines.push(`# Wave Performance Report: ${dashboard.waveId}`);
    lines.push(`Generated: ${dashboard.lastUpdated.toISOString()}`);
    lines.push('');
    
    lines.push('## Summary');
    lines.push(`Status: ${dashboard.summary.status}`);
    lines.push(`Progress: ${dashboard.summary.progress}%`);
    lines.push(`Health Score: ${dashboard.summary.healthScore}/100`);
    lines.push(`Active Bottlenecks: ${dashboard.summary.activeBottlenecks}`);
    lines.push('');
    
    lines.push('## Team Performance');
    for (const [teamId, team] of Object.entries(dashboard.teamPerformance)) {
      lines.push(`### ${teamId}`);
      lines.push(`- Health Score: ${team.healthScore}/100`);
      lines.push(`- Occupancy: ${team.occupancy.toFixed(1)}%`);
      lines.push(`- Velocity: ${team.velocity.toFixed(1)}`);
      lines.push(`- Quality Score: ${team.qualityScore.toFixed(1)}%`);
      if (team.blockers.length > 0) {
        lines.push(`- Blockers: ${team.blockers.join(', ')}`);
      }
      lines.push('');
    }
    
    if (dashboard.criticalIssues.length > 0) {
      lines.push('## Critical Issues');
      for (const issue of dashboard.criticalIssues) {
        lines.push(`- ${issue.name}: ${issue.description}`);
      }
      lines.push('');
    }
    
    lines.push('## Top Recommendations');
    for (const rec of dashboard.recommendations) {
      lines.push(`- ${rec.title} (${rec.priority} priority)`);
      lines.push(`  ${rec.description}`);
    }
    
    return lines.join('\n');
  }

  // Utility methods for mapping and classification
  private mapPatternToRecommendationType(pattern: PerformancePattern): WaveRecommendation['type'] {
    if (pattern.affectedMetrics.includes('occupancy')) {return 'team_rebalancing';}
    if (pattern.affectedMetrics.includes('barrierStallPercent')) {return 'dependency_optimization';}
    if (pattern.name.toLowerCase().includes('resource')) {return 'resource_allocation';}
    return 'process_improvement';
  }

  private mapSeverityToPriority(severity: PerformancePattern['severity']): WaveRecommendation['priority'] {
    switch (severity) {
      case 'critical': return 'critical';
      case 'error': return 'high';
      case 'warning': return 'medium';
      default: return 'low';
    }
  }

  private estimateEffortFromPattern(pattern: PerformancePattern): WaveRecommendation['effort'] {
    if (pattern.impact === 'critical') {return 'high';}
    if (pattern.impact === 'high') {return 'medium';}
    if (pattern.impact === 'medium') {return 'low';}
    return 'minimal';
  }

  private determineTimeframe(severity: PerformancePattern['severity']): WaveRecommendation['timeframe'] {
    switch (severity) {
      case 'critical': return 'immediate';
      case 'error': return 'next_wave';
      case 'warning': return 'next_sprint';
      default: return 'long_term';
    }
  }

  private determineAffectedTeams(pattern: PerformancePattern, waveMetrics: WaveMetrics): string[] {
    // If pattern mentions specific teams, extract them
    // Otherwise, return all teams that show the problematic metrics
    return Object.keys(waveMetrics.teamMetrics);
  }
}