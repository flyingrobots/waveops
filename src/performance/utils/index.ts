/**
 * Performance optimization utilities
 */

/**
 * Utility function to create default performance configuration
 */
export function createDefaultPerformanceConfig(): import('../performance-coordinator').PerformanceConfig {
  return {
    cache: {
      redis: {
        host: 'localhost',
        port: 6379,
        maxRetries: 3,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        keyPrefix: 'waveops:',
        maxMemoryPolicy: 'allkeys-lru'
      },
      inMemory: {
        maxSize: 100 * 1024 * 1024, // 100MB
        maxEntries: 10000,
        cleanupInterval: 60000, // 1 minute
        evictionStrategy: 0, // LRU
        compressionEnabled: true,
        serializationFormat: 'json'
      },
      strategies: {
        waveState: {
          layers: [0, 1], // IN_MEMORY, REDIS
          invalidationStrategy: 0, // TTL_BASED
          warmupEnabled: true,
          prefetchEnabled: true,
          compressionThreshold: 1024
        },
        teamMetrics: {
          layers: [0, 1],
          invalidationStrategy: 1, // VERSION_BASED
          warmupEnabled: false,
          prefetchEnabled: true,
          compressionThreshold: 512
        },
        githubData: {
          layers: [0, 1],
          invalidationStrategy: 0, // TTL_BASED
          warmupEnabled: false,
          prefetchEnabled: false,
          compressionThreshold: 2048
        },
        dependencyGraph: {
          layers: [0, 1],
          invalidationStrategy: 2, // EVENT_BASED
          warmupEnabled: true,
          prefetchEnabled: true,
          compressionThreshold: 1024
        },
        analyticsData: {
          layers: [0, 1],
          invalidationStrategy: 0, // TTL_BASED
          warmupEnabled: false,
          prefetchEnabled: false,
          compressionThreshold: 4096
        }
      },
      ttl: {
        default: 300000, // 5 minutes
        waveState: 60000, // 1 minute
        teamMetrics: 120000, // 2 minutes
        githubData: 300000, // 5 minutes
        dependencyGraph: 180000, // 3 minutes
        analyticsSnapshots: 600000 // 10 minutes
      }
    },
    memory: {
      objectPooling: {
        enabled: true,
        pools: {
          'tasks': {
            initialSize: 100,
            maxSize: 1000,
            growthFactor: 1.5,
            shrinkThreshold: 0.3,
            maxIdleTime: 300000,
            validationEnabled: false,
            metricsEnabled: true
          },
          'connections': {
            initialSize: 10,
            maxSize: 100,
            growthFactor: 2.0,
            shrinkThreshold: 0.2,
            maxIdleTime: 600000,
            validationEnabled: true,
            metricsEnabled: true
          }
        },
        globalMaxSize: 10000,
        cleanupInterval: 300000,
        preallocationEnabled: true
      },
      gcOptimization: {
        enabled: true,
        strategy: 3, // ADAPTIVE
        forceGCThreshold: 80,
        youngGenerationTargetSize: 64 * 1024 * 1024,
        oldGenerationThreshold: 512 * 1024 * 1024,
        incrementalGCEnabled: true
      },
      memoryLimits: {
        heapSizeWarning: 512 * 1024 * 1024,
        heapSizeCritical: 1024 * 1024 * 1024,
        maxObjectSize: 16 * 1024 * 1024,
        maxArrayLength: 1000000,
        stringPoolEnabled: true,
        bufferPoolEnabled: true
      },
      leakDetection: {
        enabled: true,
        samplingRate: 0.1,
        detectionThreshold: 50 * 1024 * 1024,
        reportingInterval: 300000,
        stackTraceEnabled: false,
        automaticCleanupEnabled: false
      }
    },
    network: {
      github: {
        rateLimitStrategy: 2, // ADAPTIVE
        batchingConfig: {
          enabled: true,
          maxBatchSize: 50,
          maxWaitTime: 1000,
          groupingStrategies: [0, 1], // BY_ENDPOINT, BY_REPOSITORY
          priorities: [
            { pattern: '/repos/', priority: 5, maxDelay: 500 },
            { pattern: '/issues/', priority: 3, maxDelay: 2000 }
          ]
        },
        cacheConfig: {
          userDataTTL: 300000,
          repoDataTTL: 600000,
          issueDataTTL: 120000,
          prDataTTL: 120000,
          deploymentDataTTL: 60000,
          checkDataTTL: 30000,
          searchResultsTTL: 180000
        },
        parallelismLimits: {
          maxConcurrentRequests: 100,
          maxConcurrentPerRepo: 10,
          maxConcurrentPerUser: 5,
          queueSizeLimit: 1000,
          timeoutMs: 30000
        }
      },
      compression: {
        enabled: true,
        algorithms: [1, 0], // BROTLI, GZIP
        thresholds: {
          minSize: 1024,
          maxSize: 10 * 1024 * 1024,
          compressionRatio: 0.8
        },
        streamingEnabled: true
      },
      connections: {
        keepAlive: true,
        keepAliveTimeout: 30000,
        maxSockets: 100,
        maxFreeSockets: 10,
        timeout: 30000,
        pooling: {
          enabled: true,
          minConnections: 5,
          maxConnections: 50,
          acquireTimeoutMs: 10000,
          idleTimeoutMs: 300000,
          testOnBorrow: false,
          testOnReturn: false
        }
      },
      retryStrategies: {
        default: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
          jitterEnabled: true,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
          circuitBreaker: {
            enabled: true,
            failureThreshold: 50,
            resetTimeout: 60000,
            monitoringEnabled: true
          }
        },
        github: {
          maxAttempts: 5,
          initialDelayMs: 1000,
          maxDelayMs: 60000,
          backoffMultiplier: 2,
          jitterEnabled: true,
          retryableErrors: ['rate_limit', '5xx', 'timeout'],
          circuitBreaker: {
            enabled: true,
            failureThreshold: 30,
            resetTimeout: 120000,
            monitoringEnabled: true
          }
        },
        database: {
          maxAttempts: 5,
          initialDelayMs: 500,
          maxDelayMs: 10000,
          backoffMultiplier: 1.5,
          jitterEnabled: true,
          retryableErrors: ['connection', 'timeout'],
          circuitBreaker: {
            enabled: false,
            failureThreshold: 0,
            resetTimeout: 0,
            monitoringEnabled: false
          }
        },
        cache: {
          maxAttempts: 2,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterEnabled: false,
          retryableErrors: ['connection'],
          circuitBreaker: {
            enabled: false,
            failureThreshold: 0,
            resetTimeout: 0,
            monitoringEnabled: false
          }
        }
      }
    },
    background: {
      queues: [
        {
          name: 'coordination',
          type: 1, // PRIORITY
          maxSize: 10000,
          maxConcurrency: 5,
          priority: 2, // HIGH
          deadLetterQueue: true,
          retryPolicy: {
            maxRetries: 3,
            backoffType: 1, // EXPONENTIAL
            initialDelay: 1000,
            maxDelay: 30000,
            retryableErrors: ['temporary', 'timeout']
          },
          rateLimiting: {
            enabled: true,
            requestsPerSecond: 100,
            burstCapacity: 200,
            windowSizeMs: 1000
          }
        },
        {
          name: 'analytics',
          type: 0, // FIFO
          maxSize: 50000,
          maxConcurrency: 3,
          priority: 1, // MEDIUM
          deadLetterQueue: true,
          retryPolicy: {
            maxRetries: 2,
            backoffType: 0, // FIXED
            initialDelay: 5000,
            maxDelay: 30000,
            retryableErrors: ['processing']
          },
          rateLimiting: {
            enabled: false,
            requestsPerSecond: 0,
            burstCapacity: 0,
            windowSizeMs: 0
          }
        }
      ],
      workers: {
        concurrency: 10,
        maxConcurrency: 50,
        autoScaling: {
          enabled: true,
          minWorkers: 5,
          maxWorkers: 100,
          scaleUpThreshold: 80,
          scaleDownThreshold: 20,
          scaleUpCooldown: 30000,
          scaleDownCooldown: 300000
        },
        healthChecks: {
          enabled: true,
          checkInterval: 30000,
          unhealthyThreshold: 3,
          recoveryThreshold: 2,
          restartOnFailure: true
        }
      },
      scheduling: {
        cron: [
          {
            name: 'cleanup',
            schedule: '0 2 * * *', // Daily at 2 AM
            timezone: 'UTC',
            handler: 'cleanup-handler',
            enabled: true
          }
        ],
        intervals: [
          {
            name: 'metrics-collection',
            intervalMs: 60000, // Every minute
            handler: 'metrics-handler',
            enabled: true,
            immediate: false
          }
        ],
        cleanup: {
          enabled: true,
          retentionPeriod: 86400000, // 24 hours
          batchSize: 1000,
          schedule: '0 3 * * *' // Daily at 3 AM
        }
      },
      monitoring: {
        enabled: true,
        metricsInterval: 30000,
        alertThresholds: {
          highWaterMark: 8000,
          processingLatency: 5000,
          errorRate: 5.0,
          deadLetterThreshold: 100
        }
      }
    },
    resources: {
      connectionPools: [
        {
          name: 'github-api',
          type: 2, // HTTP
          minConnections: 5,
          maxConnections: 50,
          connectionTimeout: 10000,
          idleTimeout: 300000,
          maxLifetime: 3600000,
          testInterval: 60000,
          leakDetectionThreshold: 600000
        }
      ],
      lifecycleManagement: {
        gracefulShutdownTimeout: 30000,
        forceShutdownTimeout: 10000,
        cleanupOnExit: true,
        resourceTrackingEnabled: true
      },
      monitoring: {
        enabled: true,
        trackingInterval: 30000,
        alertThresholds: {
          connectionPoolUsage: 90,
          memoryUsage: 85,
          fileHandleUsage: 80,
          networkConnectionUsage: 85
        },
        leakDetectionEnabled: true
      },
      cleanup: {
        enabled: true,
        cleanupInterval: 300000,
        aggressiveCleanup: false,
        resourceTypes: [0, 1, 2, 3, 4, 5] // All resource types
      }
    },
    monitoring: {
      metricsCollection: {
        enabled: true,
        interval: 30000,
        retention: {
          rawDataRetention: 3600000, // 1 hour
          aggregatedDataRetention: 86400000, // 24 hours
          compressionEnabled: true
        },
        aggregation: {
          windows: [
            { duration: 60000, offset: 0, precision: 1000 },
            { duration: 300000, offset: 0, precision: 5000 }
          ],
          functions: [1, 2, 3] // AVG, MIN, MAX
        },
        exporters: [0] // PROMETHEUS
      },
      profiling: {
        enabled: true,
        samplingRate: 0.01,
        duration: 30000,
        triggers: [1, 2], // HIGH_CPU, HIGH_MEMORY
        outputFormat: 0 // FLAMEGRAPH
      },
      alerts: {
        enabled: true,
        channels: [
          {
            name: 'default-webhook',
            type: 2, // WEBHOOK
            config: { url: 'http://localhost:3000/alerts' },
            enabled: true
          }
        ],
        rules: [
          {
            name: 'high-response-time',
            condition: {
              metric: 'app.avgResponseTime',
              operator: 0, // GREATER_THAN
              threshold: 1000,
              duration: 60000
            },
            severity: 1, // WARNING
            channels: ['default-webhook'],
            cooldown: 300000,
            enabled: true
          }
        ],
        throttling: {
          enabled: true,
          maxAlertsPerHour: 50,
          suppressDuplicates: true,
          escalationEnabled: false
        }
      },
      reporting: {
        enabled: true,
        schedule: '0 6 * * *', // Daily at 6 AM
        recipients: ['admin@waveops.dev'],
        format: 3, // MARKDOWN
        sections: [0, 1, 2, 4, 5] // All sections except ERROR_ANALYSIS
      }
    }
  };
}

/**
 * Utility function to validate performance configuration
 */
export function validatePerformanceConfig(config: Partial<import('../performance-coordinator').PerformanceConfig>): string[] {
  const errors: string[] = [];

  if (!config.cache) {
    errors.push('Cache configuration is required');
  }

  if (!config.memory) {
    errors.push('Memory configuration is required');
  }

  if (!config.network) {
    errors.push('Network configuration is required');
  }

  if (!config.background) {
    errors.push('Background processing configuration is required');
  }

  if (!config.resources) {
    errors.push('Resource management configuration is required');
  }

  if (!config.monitoring) {
    errors.push('Monitoring configuration is required');
  }

  return errors;
}

/**
 * Utility function to merge performance configurations
 */
export function mergePerformanceConfig(
  base: import('../performance-coordinator').PerformanceConfig,
  override: Partial<import('../performance-coordinator').PerformanceConfig>
): import('../performance-coordinator').PerformanceConfig {
  return {
    cache: { ...base.cache, ...override.cache },
    memory: { ...base.memory, ...override.memory },
    network: { ...base.network, ...override.network },
    background: { ...base.background, ...override.background },
    resources: { ...base.resources, ...override.resources },
    monitoring: { ...base.monitoring, ...override.monitoring }
  };
}

/**
 * Performance testing utilities
 */
export class PerformanceTester {
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  }

  static async measureMemoryUsage<T>(fn: () => Promise<T>): Promise<{ result: T; memoryDelta: number }> {
    const beforeMemory = process.memoryUsage().heapUsed;
    const result = await fn();
    const afterMemory = process.memoryUsage().heapUsed;
    const memoryDelta = afterMemory - beforeMemory;
    return { result, memoryDelta };
  }

  static async benchmark<T>(
    name: string,
    fn: () => Promise<T>,
    iterations: number = 100
  ): Promise<{
    name: string;
    iterations: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    opsPerSecond: number;
  }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measureExecutionTime(fn);
      times.push(duration);
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const opsPerSecond = 1000 / averageTime;

    return {
      name,
      iterations,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      opsPerSecond
    };
  }
}