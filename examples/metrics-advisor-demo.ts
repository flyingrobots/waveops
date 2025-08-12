/**
 * Metrics Advisor Demo - Example usage of the analytics system
 */

import { 
  MetricsAdvisor, 
  GitHubClient,
  WaveState,
  Task,
  AnalyticsConfig 
} from '../src';

async function demonstrateMetricsAdvisor() {
  console.log('🚀 WaveOps Metrics Advisor Demo\n');

  // Initialize GitHub client
  const githubClient = new GitHubClient(
    { auth: process.env.GITHUB_TOKEN || 'demo-token' },
    'your-org',
    'your-repo'
  );

  // Configure analytics system
  const analyticsConfig: AnalyticsConfig = {
    collectionInterval: 300000, // 5 minutes
    retentionPeriod: 2592000000, // 30 days
    analysisWindowSize: 10,
    alertThresholds: {
      highBarrierStall: 40,
      lowOccupancy: 50,
      highReviewLatency: 86400000, // 24 hours
      criticalBottleneckDelay: 14400000, // 4 hours
      lowFirstPassCI: 70,
      highWarpDivergence: 10000
    },
    enablePredictiveAnalytics: true,
    enableRealTimeAnalysis: true
  };

  // Create metrics advisor
  const metricsAdvisor = new MetricsAdvisor(githubClient, analyticsConfig);

  // Sample wave state
  const waveState: WaveState = {
    plan: 'mobile-app-release',
    wave: 3,
    tz: 'UTC',
    teams: {
      'frontend': {
        status: 'in_progress',
        at: '2023-08-12T10:00:00Z',
        tasks: ['ui-redesign', 'performance-optimization'],
        reason: 'Implementing new dashboard'
      },
      'backend': {
        status: 'ready',
        at: '2023-08-12T09:30:00Z',
        tasks: ['api-endpoints', 'database-migration'],
        reason: 'APIs completed, ready for testing'
      },
      'mobile': {
        status: 'blocked',
        at: '2023-08-12T08:00:00Z',
        tasks: ['native-integration'],
        reason: 'Waiting for API endpoints'
      }
    },
    all_ready: false,
    updated_at: '2023-08-12T10:30:00Z'
  };

  // Sample tasks
  const tasks: Task[] = [
    {
      id: 'ui-redesign',
      title: 'Redesign user dashboard',
      wave: 3,
      team: 'frontend',
      depends_on: [],
      acceptance: ['Design approved', 'Responsive on all devices', 'Accessibility compliant'],
      critical: true
    },
    {
      id: 'performance-optimization',
      title: 'Optimize application performance',
      wave: 3,
      team: 'frontend',
      depends_on: ['ui-redesign'],
      acceptance: ['Load time < 2s', 'Lighthouse score > 90'],
      critical: false
    },
    {
      id: 'api-endpoints',
      title: 'Implement new API endpoints',
      wave: 3,
      team: 'backend',
      depends_on: [],
      acceptance: ['All endpoints tested', 'Documentation updated'],
      critical: true
    },
    {
      id: 'database-migration',
      title: 'Migrate user data to new schema',
      wave: 3,
      team: 'backend',
      depends_on: ['api-endpoints'],
      acceptance: ['Zero downtime migration', 'Data integrity verified'],
      critical: true
    },
    {
      id: 'native-integration',
      title: 'Integrate with native mobile features',
      wave: 3,
      team: 'mobile',
      depends_on: ['api-endpoints'],
      acceptance: ['Push notifications working', 'Offline sync implemented'],
      critical: false
    }
  ];

  try {
    console.log('📊 Analyzing wave performance...\n');

    // Perform comprehensive wave analysis
    const analysis = await metricsAdvisor.analyzeWavePerformance(waveState, tasks);

    // Display results
    console.log(`📈 Wave Health Score: ${analysis.healthScore}/100`);
    console.log(`🎯 Completion Progress: ${Math.round((analysis.metrics.completedTasks / analysis.metrics.totalTasks) * 100)}%`);
    console.log(`🚨 Active Alerts: ${analysis.alerts.length}\n`);

    // Show critical alerts
    if (analysis.alerts.length > 0) {
      console.log('🚨 ALERTS:');
      for (const alert of analysis.alerts.slice(0, 3)) {
        console.log(`  • ${alert.title} (${alert.severity.toUpperCase()})`);
        console.log(`    ${alert.description}`);
        console.log(`    Action: ${alert.recommendedActions[0] || 'Review and address'}\n`);
      }
    }

    // Show top recommendations
    if (analysis.recommendations.length > 0) {
      console.log('💡 TOP RECOMMENDATIONS:');
      for (const rec of analysis.recommendations.slice(0, 3)) {
        console.log(`  • ${rec.title} (${rec.priority.toUpperCase()} priority)`);
        console.log(`    ${rec.description}`);
        console.log(`    Expected Impact: ${rec.expectedImpact}`);
        console.log(`    Confidence: ${Math.round(rec.confidence * 100)}%\n`);
      }
    }

    // Show performance patterns
    if (analysis.patterns.length > 0) {
      console.log('🔍 PERFORMANCE PATTERNS DETECTED:');
      for (const pattern of analysis.patterns.slice(0, 2)) {
        console.log(`  • ${pattern.name} (${pattern.type.replace('_', ' ').toUpperCase()})`);
        console.log(`    ${pattern.description}`);
        console.log(`    Frequency: ${Math.round(pattern.frequency * 100)}%`);
        console.log(`    Impact: ${pattern.impact.toUpperCase()}\n`);
      }
    }

    // Generate prediction
    console.log('🔮 WAVE PREDICTION:');
    console.log(`  • Estimated Completion: ${analysis.prediction.estimatedCompletionTime.toLocaleDateString()}`);
    console.log(`  • Probability of On-Time Completion: ${Math.round(analysis.prediction.probabilityOfOnTimeCompletion * 100)}%`);
    console.log(`  • Critical Path Duration: ${Math.round(analysis.prediction.criticalPathDuration / (24 * 60 * 60 * 1000))} days\n`);

    // Generate and display dashboard
    console.log('📊 Creating Performance Dashboard...\n');
    const dashboard = await metricsAdvisor.createPerformanceDashboard(analysis.metrics.waveId);
    
    console.log('📋 TEAM PERFORMANCE SUMMARY:');
    for (const [teamId, teamPerf] of Object.entries(dashboard.teamPerformance)) {
      console.log(`  ${teamId.toUpperCase()}:`);
      console.log(`    Health Score: ${teamPerf.healthScore}/100`);
      console.log(`    Occupancy: ${teamPerf.occupancy.toFixed(1)}%`);
      console.log(`    Velocity: ${teamPerf.velocity.toFixed(1)}`);
      console.log(`    Quality Score: ${teamPerf.qualityScore.toFixed(1)}%`);
      if (teamPerf.blockers.length > 0) {
        console.log(`    Blockers: ${teamPerf.blockers.join(', ')}`);
      }
      console.log('');
    }

    // Export metrics report
    console.log('📄 Generating Summary Report...\n');
    const summaryReport = await metricsAdvisor.exportMetricsReport(analysis.metrics.waveId, 'summary');
    console.log(summaryReport);

  } catch (error) {
    console.error('❌ Error in metrics analysis:', error instanceof Error ? error.message : error);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateMetricsAdvisor().catch(console.error);
}

export { demonstrateMetricsAdvisor };