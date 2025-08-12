# Work Stealing System

The WaveOps Work Stealing System automatically optimizes team utilization by intelligently redistributing tasks across teams while maintaining coordination integrity. This GPU-style wave coordination system ensures maximum throughput and prevents team bottlenecks.

## Features

### 🎯 Intelligent Load Balancing
- **Real-time utilization monitoring** - Continuously tracks team capacity and workload
- **Automated bottleneck detection** - Identifies overloaded teams and underutilized resources
- **Skill-based task matching** - Matches tasks to teams based on capabilities and proficiency
- **Dependency-aware transfers** - Preserves task dependencies during work redistribution

### ⚡ Multiple Stealing Strategies
- **Proactive Stealing** - Predicts bottlenecks and redistributes work before issues occur
- **Reactive Stealing** - Responds to detected imbalances with immediate rebalancing
- **Emergency Stealing** - Handles critical situations with relaxed constraints
- **Manual Claiming** - Allows teams to claim specific tasks when needed

### 🛡️ Coordination Safety
- **Atomic transfers** - Ensures all-or-nothing task reassignments
- **Rollback mechanisms** - Automatically reverts failed transfers
- **Dependency validation** - Prevents breaking critical task relationships
- **Coordination locking** - Prevents race conditions during transfers

## Architecture

### Core Components

#### WorkStealingEngine
The main orchestration engine that coordinates all work stealing activities.

```typescript
import { WorkStealingEngine } from '@waveops/core';

const engine = new WorkStealingEngine(dependencies, config);
const metrics = await engine.coordinateWorkStealing(waveNumber);
```

#### TeamMatcher
Intelligent skill-based matching between tasks and teams.

```typescript
import { TeamMatcher } from '@waveops/core';

const matcher = new TeamMatcher(dependencies);
const candidates = await matcher.findBestMatches(task);
```

#### LoadBalancer
Advanced algorithms for utilization calculation and rebalancing.

```typescript
import { LoadBalancer } from '@waveops/core';

const balancer = new LoadBalancer(dependencies, config);
const metrics = await balancer.calculateLoadMetrics(wave);
```

## Configuration

Configure work stealing behavior through the `WorkStealingConfig`:

```typescript
const config: WorkStealingConfig = {
  enabled: true,                    // Enable/disable work stealing
  utilizationThreshold: 0.8,        // Threshold for bottleneck detection (80%)
  imbalanceThreshold: 0.3,          // Maximum allowed utilization variance
  minimumTransferBenefit: 0.15,     // Minimum benefit required for transfers
  maxTransfersPerWave: 3,           // Maximum transfers per wave
  skillMatchThreshold: 0.6,         // Minimum skill match required (60%)
  coordinationOverheadWeight: 0.2,  // Weight for coordination cost calculations
  proactiveStealingEnabled: true,   // Enable predictive rebalancing
  emergencyStealingEnabled: true    // Enable emergency transfers
};
```

## CLI Interface

### Manual Task Claiming
Teams can manually claim tasks using the CLI:

```bash
# Claim a specific task
npm run steal claim --task-id ui-component-1 --team frontend

# Release a task for reassignment  
npm run steal release --task-id api-endpoint-2 --team backend

# Show current system status
npm run steal status --verbose

# Execute automatic rebalancing
npm run steal rebalance
```

### Command Reference

| Command | Description | Options |
|---------|-------------|---------|
| `claim` | Claim a task for your team | `--task-id`, `--team`, `--verbose` |
| `release` | Release a task from your team | `--task-id`, `--team`, `--verbose` |
| `status` | Show work stealing system status | `--verbose` |
| `rebalance` | Execute automatic work rebalancing | `--verbose` |

## Integration

### Wave Coordinator Integration

The work stealing system is fully integrated with the Wave Coordinator:

```typescript
import { WaveCoordinator } from '@waveops/core';

const coordinator = new WaveCoordinator(dependencies, workStealingConfig);

// Automatic coordination with work stealing
const result = await coordinator.coordinateWave();

console.log(`Transfers executed: ${result.transfersExecuted}`);
console.log(`Utilization improvement: ${result.utilizationImprovement}%`);
```

### Custom Dependencies

Provide your own implementations for work stealing dependencies:

```typescript
const dependencies: WorkStealingEngineDependencies = {
  // Team and task management
  getTaskRequirements: async (taskId) => [...],
  getTeamUtilization: async (teamId) => ({...}),
  getAllTeams: async () => [...],
  
  // Coordination and validation
  updateTaskAssignment: async (taskId, newTeam) => {...},
  validateDependencies: async (taskId, newTeam) => true,
  notifyTeamOfTransfer: async (request) => true,
  
  // Locking and audit
  acquireCoordinationLock: async (taskId) => 'lock-id',
  releaseCoordinationLock: async (lockId) => {...},
  logTransferAttempt: async (request, success, error) => {...}
};
```

## Metrics and Monitoring

### Work Stealing Metrics

The system provides comprehensive metrics:

```typescript
interface WorkStealingMetrics {
  totalTransfers: number;           // Total attempted transfers
  successfulTransfers: number;      // Successful transfers
  failedTransfers: number;          // Failed transfers
  averageTransferTime: number;      // Average time per transfer (ms)
  utilizationImprovement: number;   // Improvement in utilization balance
  coordinationOverhead: number;     // Total coordination cost
}
```

### System Health Monitoring

Monitor system health through the status interface:

```typescript
const status = await engine.getWorkStealingStatus();

console.log('System Health:', {
  utilizationBalance: status.systemHealth.utilizationBalance,
  coordinationEfficiency: status.systemHealth.coordinationEfficiency,
  transferSuccessRate: status.systemHealth.transferSuccessRate
});

console.log('Recommendations:', status.recommendations);
```

## Algorithms

### Utilization Calculation
Teams are evaluated based on:
- **Active task count** vs **team capacity**
- **Estimated completion time** for current workload
- **Skill availability** and proficiency levels

### Transfer Scoring
Tasks are evaluated for transfer using:
- **Skill match** between task requirements and team capabilities
- **Transfer cost** including coordination overhead
- **Expected benefit** from load balancing
- **Dependency risk** of breaking coordination

### Matching Algorithm
The system uses a composite scoring function:

```
score = (expectedBenefit / transferCost) + (skillMatch * 0.5) - (dependencyRisk * 0.3)
```

## Best Practices

### Configuration Tuning
- Start with conservative settings and gradually optimize
- Monitor utilization variance to tune `imbalanceThreshold`
- Adjust `utilizationThreshold` based on team capacity patterns
- Use `maxTransfersPerWave` to prevent coordination thrashing

### Team Setup
- Define clear team skills and proficiency levels
- Ensure accurate team capacity configuration
- Train teams on manual claim/release workflows
- Establish clear task labeling conventions

### Monitoring
- Track transfer success rates to identify systemic issues
- Monitor utilization improvements to validate effectiveness
- Review coordination overhead to optimize performance
- Use recommendations to guide system tuning

## Troubleshooting

### Common Issues

**High Transfer Failure Rate**
- Check skill compatibility between teams and tasks
- Verify team capacity configurations are accurate
- Ensure dependency validation logic is correct

**No Transfers Occurring**
- Verify `utilizationThreshold` isn't too restrictive
- Check that `minimumTransferBenefit` allows viable transfers
- Ensure teams have complementary skills

**Coordination Overhead Too High**
- Reduce `maxTransfersPerWave` to minimize thrashing
- Increase `minimumTransferBenefit` to be more selective
- Consider disabling proactive stealing if not needed

### Debug Mode
Enable verbose logging for detailed transfer analysis:

```bash
npm run steal status --verbose
npm run steal rebalance --verbose
```

## Examples

### Basic Setup
```typescript
import { WaveCoordinator, WorkStealingConfig } from '@waveops/core';

const config: WorkStealingConfig = {
  enabled: true,
  utilizationThreshold: 0.75,
  maxTransfersPerWave: 2,
  proactiveStealingEnabled: true
};

const coordinator = new WaveCoordinator(dependencies, config);
```

### Manual Task Management
```bash
# Team realizes they're overloaded
npm run steal release --task-id complex-feature --team backend

# Another team picks up the work
npm run steal claim --task-id complex-feature --team devops

# Check the impact
npm run steal status
```

### Automated Optimization
```typescript
// Run automatic coordination with work stealing
const result = await coordinator.coordinateWave();

if (result.workStealingActive) {
  console.log(`Optimized ${result.transfersExecuted} task assignments`);
  console.log(`Improved utilization by ${result.utilizationImprovement * 100}%`);
}
```

The Work Stealing System makes WaveOps teams legendary efficient by ensuring optimal work distribution while maintaining the coordination integrity that makes waves work.