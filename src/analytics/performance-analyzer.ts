/**
 * Performance analyzer with algorithms for detecting patterns and anomalies
 */

import {
  WaveMetrics,
  TeamMetrics,
  PerformancePattern,
  WavePrediction,
  RiskFactor,
  BottleneckInfo,
  AnalyticsConfig,
  WarpDivergenceStats,
  LatencyStats,
  Task
} from '../types';
import { PerformanceAnalysisError, DataValidationError, PredictionError } from './errors';

interface IPerformanceAnalyzer {
  detectPerformancePatterns(waveMetrics: WaveMetrics[], config: AnalyticsConfig): Promise<PerformancePattern[]>;
  predictWaveCompletion(currentWave: WaveMetrics, historicalData: WaveMetrics[], tasks: Task[]): Promise<WavePrediction>;
  analyzeTeamPerformance(teamMetrics: TeamMetrics[], windowSize: number): Promise<PerformancePattern[]>;
  identifyAnomalies(currentMetrics: WaveMetrics, baselineMetrics: WaveMetrics[]): Promise<PerformancePattern[]>;
  calculateTrends(metrics: WaveMetrics[], timeWindow: number): Promise<Record<string, number>>;
}

export class PerformanceAnalyzer implements IPerformanceAnalyzer {
  private readonly patternCache: Map<string, PerformancePattern[]>;
  private readonly trendCache: Map<string, Record<string, number>>;

  constructor() {
    this.patternCache = new Map();
    this.trendCache = new Map();
  }

  /**
   * Detect performance patterns across multiple waves
   */
  public async detectPerformancePatterns(
    waveMetrics: WaveMetrics[],
    config: AnalyticsConfig
  ): Promise<PerformancePattern[]> {
    try {
      this.validateWaveMetrics(waveMetrics);

      const patterns: PerformancePattern[] = [];

      // Detect anti-patterns
      patterns.push(...await this.detectAntiPatterns(waveMetrics, config));
      
      // Detect best practices
      patterns.push(...await this.detectBestPractices(waveMetrics));
      
      // Detect anomalies
      patterns.push(...await this.detectAnomalousPatterns(waveMetrics));
      
      // Detect resource utilization patterns
      patterns.push(...await this.detectResourcePatterns(waveMetrics, config));

      // Sort by severity and frequency
      patterns.sort((a, b) => {
        const severityOrder = { critical: 4, error: 3, warning: 2, info: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        return severityDiff !== 0 ? severityDiff : b.frequency - a.frequency;
      });

      // Cache results
      const cacheKey = this.generateCacheKey('patterns', waveMetrics);
      this.patternCache.set(cacheKey, patterns);

      return patterns;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new PerformanceAnalysisError(
        `Failed to detect performance patterns: ${errorMessage}`,
        { wavesAnalyzed: waveMetrics.length, error: errorMessage }
      );
    }
  }

  /**
   * Predict wave completion time using historical data and ML-style algorithms
   */
  public async predictWaveCompletion(
    currentWave: WaveMetrics,
    historicalData: WaveMetrics[],
    tasks: Task[]
  ): Promise<WavePrediction> {
    try {
      this.validatePredictionInputs(currentWave, historicalData, tasks);

      // Calculate baseline completion time from historical data
      const baselineTime = this.calculateBaselineCompletion(historicalData);
      
      // Apply adjustment factors based on current wave characteristics
      const adjustmentFactors = await this.calculateAdjustmentFactors(currentWave, historicalData);
      
      // Calculate critical path duration
      const criticalPathDuration = await this.calculateCriticalPathDuration(tasks, currentWave);
      
      // Generate risk factors
      const riskFactors = await this.identifyRiskFactors(currentWave, historicalData);
      
      // Calculate confidence intervals using Monte Carlo simulation
      const { estimatedTime, confidenceInterval } = await this.monteCarloSimulation(
        baselineTime,
        adjustmentFactors,
        riskFactors,
        1000 // number of simulations
      );

      // Calculate probability of on-time completion
      const probabilityOnTime = this.calculateOnTimeProbability(
        estimatedTime,
        confidenceInterval,
        currentWave.startTime
      );

      const prediction: WavePrediction = {
        waveId: currentWave.waveId,
        estimatedCompletionTime: estimatedTime,
        confidenceInterval,
        riskFactors,
        criticalPathDuration,
        probabilityOfOnTimeCompletion: probabilityOnTime,
        recommendedStartTime: this.calculateOptimalStartTime(estimatedTime, riskFactors)
      };

      return prediction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new PredictionError(
        `Failed to predict wave completion: ${errorMessage}`,
        { waveId: currentWave.waveId, error: errorMessage }
      );
    }
  }

  /**
   * Analyze team performance patterns over time
   */
  public async analyzeTeamPerformance(
    teamMetrics: TeamMetrics[],
    windowSize: number
  ): Promise<PerformancePattern[]> {
    try {
      if (teamMetrics.length === 0) {
        return [];
      }

      const patterns: PerformancePattern[] = [];

      // Group metrics by team
      const teamGroups = this.groupByTeam(teamMetrics);

      for (const [teamId, metrics] of teamGroups) {
        const teamPatterns = await this.analyzeIndividualTeamPerformance(teamId, metrics, windowSize);
        patterns.push(...teamPatterns);
      }

      return patterns;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new PerformanceAnalysisError(
        `Failed to analyze team performance: ${errorMessage}`,
        { teamsAnalyzed: new Set(teamMetrics.map(m => m.teamId)).size, error: errorMessage }
      );
    }
  }

  /**
   * Identify anomalies by comparing current metrics to baseline
   */
  public async identifyAnomalies(
    currentMetrics: WaveMetrics,
    baselineMetrics: WaveMetrics[]
  ): Promise<PerformancePattern[]> {
    try {
      const anomalies: PerformancePattern[] = [];

      // Calculate statistical baselines
      const baseline = this.calculateStatisticalBaseline(baselineMetrics);

      // Check for anomalies in each metric category
      anomalies.push(...await this.detectDurationAnomalies(currentMetrics, baseline));
      anomalies.push(...await this.detectThroughputAnomalies(currentMetrics, baseline));
      anomalies.push(...await this.detectQualityAnomalies(currentMetrics, baseline));
      anomalies.push(...await this.detectBottleneckAnomalies(currentMetrics, baseline));

      return anomalies.filter(anomaly => anomaly.detectionConfidence > 0.7);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new PerformanceAnalysisError(
        `Failed to identify anomalies: ${errorMessage}`,
        { waveId: currentMetrics.waveId, error: errorMessage }
      );
    }
  }

  /**
   * Calculate performance trends over time
   */
  public async calculateTrends(
    metrics: WaveMetrics[],
    timeWindow: number
  ): Promise<Record<string, number>> {
    try {
      if (metrics.length < 2) {
        return {};
      }

      const trends: Record<string, number> = {};

      // Calculate trends for key metrics
      trends.completionTimeTrend = this.calculateLinearTrend(
        metrics.map(m => m.duration || 0)
      );
      
      trends.throughputTrend = this.calculateLinearTrend(
        metrics.map(m => m.completedTasks / (m.totalTasks || 1))
      );
      
      trends.qualityTrend = this.calculateLinearTrend(
        metrics.map(m => this.calculateAverageFirstPassCI(m))
      );
      
      trends.bottleneckTrend = this.calculateLinearTrend(
        metrics.map(m => m.bottlenecks.length)
      );

      // Calculate team-specific trends
      const teamIds = new Set(metrics.flatMap(m => Object.keys(m.teamMetrics)));
      for (const teamId of teamIds) {
        trends[`${teamId}_occupancyTrend`] = this.calculateLinearTrend(
          metrics.map(m => m.teamMetrics[teamId]?.occupancy || 0)
        );
      }

      // Cache results
      const cacheKey = this.generateCacheKey('trends', metrics);
      this.trendCache.set(cacheKey, trends);

      return trends;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new PerformanceAnalysisError(
        `Failed to calculate trends: ${errorMessage}`,
        { metricsCount: metrics.length, error: errorMessage }
      );
    }
  }

  // Private helper methods for pattern detection
  private async detectAntiPatterns(
    waveMetrics: WaveMetrics[],
    config: AnalyticsConfig
  ): Promise<PerformancePattern[]> {
    const antiPatterns: PerformancePattern[] = [];

    // Serial bottleneck pattern
    const serialBottlenecks = waveMetrics.filter(wave => 
      wave.bottlenecks.some(b => b.type === 'dependency' && b.severity === 'critical')
    );
    
    if (serialBottlenecks.length / waveMetrics.length > 0.3) {
      antiPatterns.push({
        patternId: 'serial_bottlenecks',
        type: 'anti_pattern',
        name: 'Serial Dependency Bottlenecks',
        description: 'High frequency of critical dependency bottlenecks causing serial execution',
        severity: 'error',
        frequency: serialBottlenecks.length / waveMetrics.length,
        impact: 'high',
        affectedMetrics: ['barrierStallPercent', 'duration'],
        recommendations: [
          'Parallelize independent tasks',
          'Break down large dependencies',
          'Implement dependency caching'
        ],
        detectionConfidence: 0.85
      });
    }

    // Low occupancy pattern
    const lowOccupancyWaves = waveMetrics.filter(wave => 
      Object.values(wave.teamMetrics).some(team => team.occupancy < config.alertThresholds.lowOccupancy)
    );

    if (lowOccupancyWaves.length / waveMetrics.length > 0.4) {
      antiPatterns.push({
        patternId: 'low_utilization',
        type: 'anti_pattern',
        name: 'Chronic Under-utilization',
        description: 'Teams consistently operating below capacity thresholds',
        severity: 'warning',
        frequency: lowOccupancyWaves.length / waveMetrics.length,
        impact: 'medium',
        affectedMetrics: ['occupancy', 'throughput'],
        recommendations: [
          'Rebalance workload distribution',
          'Reduce task granularity',
          'Optimize team allocation'
        ],
        detectionConfidence: 0.75
      });
    }

    return antiPatterns;
  }

  private async detectBestPractices(waveMetrics: WaveMetrics[]): Promise<PerformancePattern[]> {
    const bestPractices: PerformancePattern[] = [];

    // High first-pass CI success rate
    const highQualityWaves = waveMetrics.filter(wave => 
      this.calculateAverageFirstPassCI(wave) > 85
    );

    if (highQualityWaves.length / waveMetrics.length > 0.6) {
      bestPractices.push({
        patternId: 'high_quality_delivery',
        type: 'best_practice',
        name: 'High Quality Delivery Pattern',
        description: 'Consistently high first-pass CI success rates indicating good development practices',
        severity: 'info',
        frequency: highQualityWaves.length / waveMetrics.length,
        impact: 'high',
        affectedMetrics: ['firstPassCI', 'defectRate'],
        recommendations: [
          'Document and share quality practices',
          'Implement automated quality gates',
          'Establish quality metrics dashboards'
        ],
        detectionConfidence: 0.9
      });
    }

    return bestPractices;
  }

  private async detectAnomalousPatterns(waveMetrics: WaveMetrics[]): Promise<PerformancePattern[]> {
    if (waveMetrics.length < 3) return [];

    const anomalies: PerformancePattern[] = [];

    // Detect completion time anomalies using statistical analysis
    const durations = waveMetrics.map(w => w.duration || 0);
    const durationStats = this.calculateStatistics(durations);
    
    const recentWaves = waveMetrics.slice(-3);
    const recentOutliers = recentWaves.filter(wave => 
      Math.abs((wave.duration || 0) - durationStats.mean) > 2 * durationStats.stdDev
    );

    if (recentOutliers.length > 0) {
      anomalies.push({
        patternId: 'duration_anomaly',
        type: 'anomaly',
        name: 'Wave Duration Anomaly',
        description: 'Recent waves showing unusual completion times compared to historical pattern',
        severity: 'warning',
        frequency: recentOutliers.length / recentWaves.length,
        impact: 'medium',
        affectedMetrics: ['duration'],
        recommendations: [
          'Investigate root causes of timing variations',
          'Review resource allocation',
          'Check for external dependencies'
        ],
        detectionConfidence: 0.8
      });
    }

    return anomalies;
  }

  private async detectResourcePatterns(
    waveMetrics: WaveMetrics[],
    config: AnalyticsConfig
  ): Promise<PerformancePattern[]> {
    const resourcePatterns: PerformancePattern[] = [];

    // Detect imbalanced team utilization
    const imbalancedWaves = waveMetrics.filter(wave => {
      const occupancies = Object.values(wave.teamMetrics).map(team => team.occupancy);
      const variance = this.calculateVariance(occupancies);
      return variance > 400; // High variance in team occupancy
    });

    if (imbalancedWaves.length / waveMetrics.length > 0.3) {
      resourcePatterns.push({
        patternId: 'resource_imbalance',
        type: 'anti_pattern',
        name: 'Resource Imbalance Pattern',
        description: 'Significant variance in team utilization indicating poor load distribution',
        severity: 'warning',
        frequency: imbalancedWaves.length / waveMetrics.length,
        impact: 'medium',
        affectedMetrics: ['occupancy'],
        recommendations: [
          'Implement dynamic task reallocation',
          'Cross-train team members',
          'Use workload prediction algorithms'
        ],
        detectionConfidence: 0.75
      });
    }

    return resourcePatterns;
  }

  private async analyzeIndividualTeamPerformance(
    teamId: string,
    metrics: TeamMetrics[],
    windowSize: number
  ): Promise<PerformancePattern[]> {
    const patterns: PerformancePattern[] = [];

    if (metrics.length < windowSize) {
      return patterns;
    }

    // Analyze velocity trends
    const velocityTrend = this.calculateLinearTrend(metrics.map(m => m.velocity));
    
    if (velocityTrend < -0.1) { // Decreasing velocity
      patterns.push({
        patternId: `${teamId}_velocity_decline`,
        type: 'anti_pattern',
        name: `Team ${teamId} Velocity Decline`,
        description: `Team ${teamId} showing consistent decrease in delivery velocity`,
        severity: 'warning',
        frequency: 1.0, // This is a specific team pattern
        impact: 'medium',
        affectedMetrics: ['velocity'],
        recommendations: [
          'Review team capacity and workload',
          'Identify blockers and impediments',
          'Consider team restructuring'
        ],
        detectionConfidence: 0.8
      });
    }

    return patterns;
  }

  private calculateBaselineCompletion(historicalData: WaveMetrics[]): Date {
    if (historicalData.length === 0) {
      // Default to 2 weeks if no historical data
      return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    const durations = historicalData
      .filter(wave => wave.duration)
      .map(wave => wave.duration!);
    
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    return new Date(Date.now() + averageDuration);
  }

  private async calculateAdjustmentFactors(
    currentWave: WaveMetrics,
    historicalData: WaveMetrics[]
  ): Promise<Record<string, number>> {
    const factors: Record<string, number> = {
      complexity: 1.0,
      teamExperience: 1.0,
      dependencies: 1.0,
      quality: 1.0
    };

    // Complexity factor based on task count
    if (historicalData.length > 0) {
      const avgTasks = historicalData.reduce((sum, w) => sum + w.totalTasks, 0) / historicalData.length;
      factors.complexity = currentWave.totalTasks / avgTasks;
    }

    // Dependency factor
    const avgDependencies = currentWave.criticalPath.length;
    factors.dependencies = Math.max(1.0, avgDependencies / 5); // Normalize to reasonable baseline

    // Quality factor based on team CI success rates
    const avgFirstPassCI = this.calculateAverageFirstPassCI(currentWave);
    factors.quality = avgFirstPassCI > 80 ? 0.9 : 1.1; // Good CI reduces time, poor CI increases it

    return factors;
  }

  private async calculateCriticalPathDuration(tasks: Task[], waveMetrics: WaveMetrics): Promise<number> {
    // Simplified critical path calculation
    const criticalTasks = tasks.filter(task => waveMetrics.criticalPath.includes(task.id));
    
    // Estimate 8 hours per critical task with some parallelization
    const baseDuration = criticalTasks.length * 8 * 60 * 60 * 1000; // 8 hours in ms
    const parallelizationFactor = 0.7; // Assume 30% parallelization
    
    return baseDuration * parallelizationFactor;
  }

  private async identifyRiskFactors(
    currentWave: WaveMetrics,
    historicalData: WaveMetrics[]
  ): Promise<RiskFactor[]> {
    const riskFactors: RiskFactor[] = [];

    // Dependency risk
    if (currentWave.criticalPath.length > 5) {
      riskFactors.push({
        type: 'dependency',
        description: 'High number of critical dependencies may cause delays',
        probability: 0.6,
        impact: currentWave.criticalPath.length * 2 * 60 * 60 * 1000, // 2 hours per dependency
        mitigation: 'Parallelize independent tasks and break down large dependencies'
      });
    }

    // Team overload risk
    const overloadedTeams = Object.values(currentWave.teamMetrics).filter(team => team.occupancy > 90);
    if (overloadedTeams.length > 0) {
      riskFactors.push({
        type: 'resource',
        description: `${overloadedTeams.length} teams operating at >90% capacity`,
        probability: 0.7,
        impact: overloadedTeams.length * 4 * 60 * 60 * 1000, // 4 hours per overloaded team
        mitigation: 'Rebalance workload or add additional resources'
      });
    }

    // Quality risk
    const avgFirstPassCI = this.calculateAverageFirstPassCI(currentWave);
    if (avgFirstPassCI < 70) {
      riskFactors.push({
        type: 'technical',
        description: 'Low first-pass CI success rate indicates potential quality issues',
        probability: 0.5,
        impact: 6 * 60 * 60 * 1000, // 6 hours for rework
        mitigation: 'Implement additional code review and testing processes'
      });
    }

    return riskFactors;
  }

  private async monteCarloSimulation(
    baselineTime: Date,
    adjustmentFactors: Record<string, number>,
    riskFactors: RiskFactor[],
    iterations: number
  ): Promise<{ estimatedTime: Date; confidenceInterval: { lower: Date; upper: Date } }> {
    const simulations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      let adjustedDuration = baselineTime.getTime() - Date.now();

      // Apply adjustment factors
      for (const factor of Object.values(adjustmentFactors)) {
        adjustedDuration *= factor;
      }

      // Apply risk factors probabilistically
      for (const risk of riskFactors) {
        if (Math.random() < risk.probability) {
          adjustedDuration += risk.impact;
        }
      }

      simulations.push(adjustedDuration);
    }

    simulations.sort((a, b) => a - b);
    
    const median = this.calculateMedian(simulations);
    const p10 = simulations[Math.floor(iterations * 0.1)];
    const p90 = simulations[Math.floor(iterations * 0.9)];

    return {
      estimatedTime: new Date(Date.now() + median),
      confidenceInterval: {
        lower: new Date(Date.now() + p10),
        upper: new Date(Date.now() + p90)
      }
    };
  }

  private calculateOnTimeProbability(
    estimatedTime: Date,
    confidenceInterval: { lower: Date; upper: Date },
    startTime: Date
  ): number {
    // Simplified probability calculation based on confidence interval
    const targetTime = new Date(startTime.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks
    
    if (estimatedTime <= targetTime) {
      return 0.8; // High probability if estimated time is within target
    } else if (confidenceInterval.lower <= targetTime) {
      return 0.5; // Medium probability if target is within confidence interval
    } else {
      return 0.2; // Low probability if target is outside confidence interval
    }
  }

  private calculateOptimalStartTime(estimatedCompletion: Date, riskFactors: RiskFactor[]): Date | undefined {
    // Calculate buffer time based on risk factors
    const totalRisk = riskFactors.reduce((sum, risk) => sum + (risk.probability * risk.impact), 0);
    const bufferTime = totalRisk * 0.5; // 50% buffer for identified risks
    
    return new Date(estimatedCompletion.getTime() - bufferTime);
  }

  // Utility methods for statistical calculations
  private validateWaveMetrics(waveMetrics: WaveMetrics[]): void {
    if (!waveMetrics || waveMetrics.length === 0) {
      throw new DataValidationError('Wave metrics array cannot be empty');
    }
  }

  private validatePredictionInputs(currentWave: WaveMetrics, historicalData: WaveMetrics[], tasks: Task[]): void {
    if (!currentWave) {
      throw new DataValidationError('Current wave metrics are required');
    }
    if (!tasks || tasks.length === 0) {
      throw new DataValidationError('Tasks array cannot be empty');
    }
  }

  private calculateStatisticalBaseline(metrics: WaveMetrics[]): Record<string, { mean: number; stdDev: number }> {
    const baseline: Record<string, { mean: number; stdDev: number }> = {};

    // Duration baseline
    const durations = metrics.map(m => m.duration || 0);
    baseline.duration = this.calculateStatistics(durations);

    // Throughput baseline
    const throughputs = metrics.map(m => m.completedTasks / (m.totalTasks || 1));
    baseline.throughput = this.calculateStatistics(throughputs);

    return baseline;
  }

  private async detectDurationAnomalies(
    currentMetrics: WaveMetrics,
    baseline: Record<string, { mean: number; stdDev: number }>
  ): Promise<PerformancePattern[]> {
    const anomalies: PerformancePattern[] = [];

    if (baseline.duration && currentMetrics.duration) {
      const zScore = Math.abs((currentMetrics.duration - baseline.duration.mean) / baseline.duration.stdDev);
      
      if (zScore > 2) {
        anomalies.push({
          patternId: 'duration_anomaly',
          type: 'anomaly',
          name: 'Wave Duration Anomaly',
          description: `Wave completion time is ${zScore.toFixed(1)} standard deviations from baseline`,
          severity: zScore > 3 ? 'error' : 'warning',
          frequency: 1.0,
          impact: 'high',
          affectedMetrics: ['duration'],
          recommendations: ['Investigate causes of timing deviation', 'Review resource allocation'],
          detectionConfidence: Math.min(0.95, zScore / 3)
        });
      }
    }

    return anomalies;
  }

  private async detectThroughputAnomalies(
    currentMetrics: WaveMetrics,
    baseline: Record<string, { mean: number; stdDev: number }>
  ): Promise<PerformancePattern[]> {
    const anomalies: PerformancePattern[] = [];

    if (baseline.throughput) {
      const currentThroughput = currentMetrics.completedTasks / (currentMetrics.totalTasks || 1);
      const zScore = Math.abs((currentThroughput - baseline.throughput.mean) / baseline.throughput.stdDev);
      
      if (zScore > 2) {
        anomalies.push({
          patternId: 'throughput_anomaly',
          type: 'anomaly',
          name: 'Throughput Anomaly',
          description: `Task completion rate is ${zScore.toFixed(1)} standard deviations from baseline`,
          severity: 'warning',
          frequency: 1.0,
          impact: 'medium',
          affectedMetrics: ['completedTasks', 'throughput'],
          recommendations: ['Review task complexity', 'Check for resource constraints'],
          detectionConfidence: Math.min(0.9, zScore / 3)
        });
      }
    }

    return anomalies;
  }

  private async detectQualityAnomalies(
    currentMetrics: WaveMetrics,
    baseline: Record<string, { mean: number; stdDev: number }>
  ): Promise<PerformancePattern[]> {
    // Implementation for quality anomaly detection
    return [];
  }

  private async detectBottleneckAnomalies(
    currentMetrics: WaveMetrics,
    baseline: Record<string, { mean: number; stdDev: number }>
  ): Promise<PerformancePattern[]> {
    // Implementation for bottleneck anomaly detection
    return [];
  }

  private calculateLinearTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const xSum = n * (n - 1) / 2;
    const ySum = values.reduce((sum, val) => sum + val, 0);
    const xySum = values.reduce((sum, val, i) => sum + (val * i), 0);
    const x2Sum = n * (n - 1) * (2 * n - 1) / 6;

    const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
    return slope;
  }

  private calculateAverageFirstPassCI(waveMetrics: WaveMetrics): number {
    const teamMetrics = Object.values(waveMetrics.teamMetrics);
    if (teamMetrics.length === 0) return 0;

    const total = teamMetrics.reduce((sum, team) => sum + team.firstPassCI, 0);
    return total / teamMetrics.length;
  }

  private calculateStatistics(values: number[]): { mean: number; stdDev: number } {
    if (values.length === 0) return { mean: 0, stdDev: 0 };

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  }

  private groupByTeam(teamMetrics: TeamMetrics[]): Map<string, TeamMetrics[]> {
    const groups = new Map<string, TeamMetrics[]>();

    for (const metrics of teamMetrics) {
      const existing = groups.get(metrics.teamId) || [];
      existing.push(metrics);
      groups.set(metrics.teamId, existing);
    }

    return groups;
  }

  private generateCacheKey(type: string, data: unknown): string {
    // Simple cache key generation based on data hash
    return `${type}_${JSON.stringify(data).length}_${Date.now()}`;
  }
}