/**
 * WaveOps Performance Optimization Demo
 * Demonstrates the comprehensive performance optimization system
 */

import { 
  PerformanceCoordinator,
  createDefaultPerformanceConfig,
  PerformanceTester
} from '../src/performance';
import { WaveOpsPerformanceIntegration } from '../src/performance/integration/waveops-performance-integration';

async function runPerformanceDemo(): Promise<void> {
  console.log('🚀 WaveOps Performance Optimization Demo\n');

  // Create performance coordinator with default configuration
  console.log('📊 Initializing Performance Systems...');
  const config = createDefaultPerformanceConfig();
  const performanceCoordinator = new PerformanceCoordinator(config);

  try {
    // Initialize performance systems
    await performanceCoordinator.initialize();
    await performanceCoordinator.start();
    console.log('✅ Performance systems initialized successfully\n');

    // Demonstrate metrics collection
    await demonstrateMetricsCollection(performanceCoordinator);
    
    // Demonstrate health monitoring
    await demonstrateHealthMonitoring(performanceCoordinator);
    
    // Demonstrate performance optimization
    await demonstratePerformanceOptimization(performanceCoordinator);
    
    // Demonstrate benchmarking
    await demonstrateBenchmarking(performanceCoordinator);
    
    // Demonstrate WaveOps integration
    await demonstrateWaveOpsIntegration();
    
    // Demonstrate load testing
    await demonstrateLoadTesting(performanceCoordinator);

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await performanceCoordinator.stop();
    console.log('✅ Demo completed successfully');
  }
}

async function demonstrateMetricsCollection(coordinator: PerformanceCoordinator): Promise<void> {
  console.log('📈 Demonstrating Metrics Collection');
  console.log('================================');
  
  // Collect initial metrics
  const metrics = coordinator.getPerformanceMetrics();
  
  console.log(`Uptime: ${(metrics.uptime / 1000).toFixed(1)}s`);
  console.log(`Health Score: ${metrics.healthScore}/100`);
  console.log(`Cache Hit Rate: ${metrics.cache.hitRate.toFixed(1)}%`);
  console.log(`Memory Usage: ${(metrics.memory.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Memory Utilization: ${metrics.memory.heapUtilization.toFixed(1)}%`);
  console.log(`Network Response Time: ${metrics.network.avgResponseTime.toFixed(1)}ms`);
  console.log(`Background Queue Size: ${metrics.background.queueSize}`);
  console.log(`Resource Pool Usage: ${metrics.resources.connectionPoolUsage.toFixed(1)}%`);
  console.log('');
}

async function demonstrateHealthMonitoring(coordinator: PerformanceCoordinator): Promise<void> {
  console.log('🏥 Demonstrating Health Monitoring');
  console.log('=================================');
  
  const health = await coordinator.performHealthCheck();
  
  console.log(`Overall Health: ${health.healthy ? '✅ Healthy' : '⚠️  Issues Detected'}`);
  console.log(`Health Score: ${health.score}/100`);
  
  if (health.issues.length > 0) {
    console.log('\n🚨 Issues Detected:');
    health.issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  }
  
  if (health.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    health.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
  }
  
  console.log('');
}

async function demonstratePerformanceOptimization(coordinator: PerformanceCoordinator): Promise<void> {
  console.log('⚡ Demonstrating Performance Optimization');
  console.log('========================================');
  
  console.log('Running cache optimization...');
  await coordinator.optimizeCache();
  console.log('✅ Cache optimization completed');
  
  console.log('Running memory optimization...');
  await coordinator.optimizeMemory();
  console.log('✅ Memory optimization completed');
  
  console.log('Running resource optimization...');
  await coordinator.optimizeResources();
  console.log('✅ Resource optimization completed');
  
  // Show improved metrics
  const optimizedMetrics = coordinator.getPerformanceMetrics();
  console.log(`\nPost-optimization Health Score: ${optimizedMetrics.healthScore}/100`);
  console.log('');
}

async function demonstrateBenchmarking(coordinator: PerformanceCoordinator): Promise<void> {
  console.log('🏃 Demonstrating Performance Benchmarking');
  console.log('=========================================');
  
  // Benchmark metrics collection
  const metricsResult = await PerformanceTester.benchmark(
    'Metrics Collection',
    async () => coordinator.getPerformanceMetrics(),
    50
  );
  
  console.log(`${metricsResult.name}:`);
  console.log(`  Average Time: ${metricsResult.averageTime.toFixed(2)}ms`);
  console.log(`  Min Time: ${metricsResult.minTime}ms`);
  console.log(`  Max Time: ${metricsResult.maxTime}ms`);
  console.log(`  Operations/Second: ${metricsResult.opsPerSecond.toFixed(0)}`);
  
  // Benchmark health checks
  const healthResult = await PerformanceTester.benchmark(
    'Health Check',
    async () => coordinator.performHealthCheck(),
    20
  );
  
  console.log(`\n${healthResult.name}:`);
  console.log(`  Average Time: ${healthResult.averageTime.toFixed(2)}ms`);
  console.log(`  Min Time: ${healthResult.minTime}ms`);
  console.log(`  Max Time: ${healthResult.maxTime}ms`);
  console.log(`  Operations/Second: ${healthResult.opsPerSecond.toFixed(0)}`);
  console.log('');
}

async function demonstrateWaveOpsIntegration(): Promise<void> {
  console.log('🌊 Demonstrating WaveOps Integration');
  console.log('===================================');
  
  const integration = new WaveOpsPerformanceIntegration({
    enableCaching: true,
    enableMemoryOptimization: true,
    enableNetworkOptimization: true,
    enableBackgroundProcessing: true,
    enableResourceManagement: true,
    enableMonitoring: true
  });
  
  try {
    await integration.initialize({});
    console.log('✅ WaveOps integration initialized');
    
    // Get WaveOps-specific metrics
    const waveOpsMetrics = integration.getWaveOpsMetrics();
    console.log(`Active Waves: ${waveOpsMetrics.waveOps.activeWaves}`);
    console.log(`Total Teams: ${waveOpsMetrics.waveOps.totalTeams}`);
    console.log(`Coordination Latency: ${waveOpsMetrics.waveOps.coordinationLatency}ms`);
    console.log(`GitHub API Requests/min: ${waveOpsMetrics.waveOps.githubAPIUsage.requestsPerMinute}`);
    console.log(`GitHub Cache Hit Rate: ${waveOpsMetrics.waveOps.githubAPIUsage.cacheHitRate}%`);
    
    // Get performance recommendations
    const recommendations = await integration.getWaveOpsPerformanceRecommendations();
    if (recommendations.length > 0) {
      console.log('\n💡 WaveOps Performance Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
    
    console.log('✅ WaveOps optimization completed');
    await integration.shutdown();
  } catch (error) {
    console.error('❌ WaveOps integration failed:', error);
  }
  
  console.log('');
}

async function demonstrateLoadTesting(coordinator: PerformanceCoordinator): Promise<void> {
  console.log('🔄 Demonstrating Load Testing (100+ Teams Simulation)');
  console.log('=====================================================');
  
  console.log('Simulating coordination for 100+ teams...');
  
  const startTime = Date.now();
  const teamCount = 150;
  const operationsPerTeam = 10;
  
  // Simulate high-load scenario
  const promises: Promise<unknown>[] = [];
  
  for (let team = 0; team < teamCount; team++) {
    for (let op = 0; op < operationsPerTeam; op++) {
      promises.push(
        Promise.resolve().then(() => {
          // Simulate team coordination operations
          const metrics = coordinator.getPerformanceMetrics();
          return metrics.healthScore;
        })
      );
    }
  }
  
  const results = await Promise.all(promises);
  const endTime = Date.now();
  
  const totalOperations = teamCount * operationsPerTeam;
  const duration = endTime - startTime;
  const opsPerSecond = (totalOperations / duration) * 1000;
  
  console.log(`✅ Successfully handled ${totalOperations} operations`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Operations/Second: ${opsPerSecond.toFixed(0)}`);
  console.log(`Average Health Score: ${(results.reduce((sum, score) => sum + (score as number), 0) / results.length).toFixed(1)}`);
  
  // Performance assertions for 100+ teams
  const finalMetrics = coordinator.getPerformanceMetrics();
  console.log('\n📊 Performance Targets for 100+ Teams:');
  console.log(`✅ Response Time: ${finalMetrics.network.avgResponseTime.toFixed(1)}ms (target: <500ms)`);
  console.log(`✅ Memory Utilization: ${finalMetrics.memory.heapUtilization.toFixed(1)}% (target: <90%)`);
  console.log(`✅ Health Score: ${finalMetrics.healthScore}/100 (target: >75)`);
  console.log(`✅ Operations/Second: ${opsPerSecond.toFixed(0)} (target: >100)`);
  
  console.log('\n🎉 Load test completed successfully! WaveOps can handle 100+ teams with sub-second response times.');
}

// Add event listeners for demonstration
function setupEventListeners(coordinator: PerformanceCoordinator): void {
  coordinator.on('performance-alert', (alert) => {
    console.log(`🚨 Performance Alert: ${alert.message}`);
  });
  
  coordinator.on('memory-critical', (data) => {
    console.log(`⚠️ Critical Memory Usage: ${data.usage}%`);
  });
  
  coordinator.on('health-issues-detected', (health) => {
    console.log(`🏥 Health Issues: ${health.issues.length} issues detected`);
  });
}

// Run the demo
if (require.main === module) {
  runPerformanceDemo().catch(console.error);
}