/**
 * Performance profiling system for detailed analysis
 */

import { EventEmitter } from 'events';
import {
  ProfilingConfig,
  ProfilingTrigger,
  ProfilingOutputFormat
} from '../types';

export interface ProfilingSession {
  id: string;
  trigger?: ProfilingTrigger;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  outputFormat: ProfilingOutputFormat;
  profileData?: ProfileData;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
}

export interface ProfileData {
  format: ProfilingOutputFormat;
  data: string | Buffer | object;
  summary: ProfileSummary;
  size: number;
}

export interface ProfileSummary {
  totalSamples: number;
  samplingDuration: number;
  topFunctions: ProfileFunction[];
  memoryUsage: MemoryProfile;
  cpuProfile?: CPUProfile;
}

export interface ProfileFunction {
  name: string;
  file?: string;
  line?: number;
  selfTime: number;
  totalTime: number;
  callCount: number;
  percentage: number;
}

export interface MemoryProfile {
  totalAllocated: number;
  totalFreed: number;
  peakUsage: number;
  leakSuspects: MemoryLeak[];
}

export interface MemoryLeak {
  type: string;
  count: number;
  size: number;
  stackTrace: string;
}

export interface CPUProfile {
  totalTime: number;
  idleTime: number;
  userTime: number;
  systemTime: number;
  samples: CPUSample[];
}

export interface CPUSample {
  timestamp: number;
  stackTrace: string[];
  weight: number;
}

export class PerformanceProfiler extends EventEmitter {
  private readonly config: ProfilingConfig;
  private readonly activeSessions: Map<string, ProfilingSession>;
  private readonly completedSessions: Map<string, ProfilingSession>;
  private sessionCounter: number;
  private isRunning: boolean;
  private profilingTimer?: NodeJS.Timeout;

  constructor(config: ProfilingConfig) {
    super();
    this.config = config;
    this.activeSessions = new Map();
    this.completedSessions = new Map();
    this.sessionCounter = 0;
    this.isRunning = false;
  }

  /**
   * Start the profiler system
   */
  async start(): Promise<void> {
    if (!this.config.enabled || this.isRunning) return;

    this.isRunning = true;
    this.emit('profiler-started');
  }

  /**
   * Stop the profiler system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop profiling timer
    if (this.profilingTimer) {
      clearTimeout(this.profilingTimer);
    }

    // Stop all active sessions
    const stopPromises = Array.from(this.activeSessions.keys()).map(id => 
      this.stopSession(id)
    );
    
    await Promise.allSettled(stopPromises);

    this.emit('profiler-stopped');
  }

  /**
   * Start a profiling session
   */
  async startSession(
    duration: number = this.config.duration,
    trigger?: ProfilingTrigger
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Profiling is not enabled');
    }

    const sessionId = `profile-${++this.sessionCounter}-${Date.now()}`;
    
    const session: ProfilingSession = {
      id: sessionId,
      trigger,
      startTime: new Date(),
      outputFormat: this.config.outputFormat,
      status: 'active'
    };

    this.activeSessions.set(sessionId, session);

    // Start actual profiling based on output format
    try {
      await this.startProfiling(session);
      
      // Set timeout to stop session
      setTimeout(() => {
        this.stopSession(sessionId).catch(error => {
          this.emit('profiling-error', { sessionId, error });
        });
      }, duration);

      this.emit('profiling-started', { sessionId, trigger, duration });
      return sessionId;
    } catch (error) {
      session.status = 'failed';
      this.activeSessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Stop a profiling session
   */
  async stopSession(sessionId: string): Promise<string> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error(`No active profiling session: ${sessionId}`);
    }

    try {
      // Stop profiling and collect data
      const profileData = await this.stopProfiling(session);
      
      session.endTime = new Date();
      session.duration = session.endTime.getTime() - session.startTime.getTime();
      session.profileData = profileData;
      session.status = 'completed';

      // Move to completed sessions
      this.activeSessions.delete(sessionId);
      this.completedSessions.set(sessionId, session);

      // Generate output file
      const outputPath = await this.generateProfileOutput(session);

      this.emit('profiling-completed', { 
        sessionId, 
        duration: session.duration,
        outputPath,
        summary: profileData.summary
      });

      return outputPath;
    } catch (error) {
      session.status = 'failed';
      this.activeSessions.delete(sessionId);
      this.emit('profiling-error', { sessionId, error });
      throw error;
    }
  }

  /**
   * Cancel an active profiling session
   */
  async cancelSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.status = 'cancelled';
    this.activeSessions.delete(sessionId);

    this.emit('profiling-cancelled', { sessionId });
  }

  /**
   * Get profiling session details
   */
  getSession(sessionId: string): ProfilingSession | null {
    return this.activeSessions.get(sessionId) || 
           this.completedSessions.get(sessionId) || 
           null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ProfilingSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get completed sessions
   */
  getCompletedSessions(): ProfilingSession[] {
    return Array.from(this.completedSessions.values());
  }

  /**
   * Check if profiling is currently active
   */
  isActiveProfiling(): boolean {
    return this.activeSessions.size > 0;
  }

  /**
   * Clean up old completed sessions
   */
  async cleanupSessions(): Promise<void> {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const sessionsToRemove: string[] = [];

    for (const [sessionId, session] of this.completedSessions.entries()) {
      if (session.endTime && session.endTime < cutoffTime) {
        sessionsToRemove.push(sessionId);
      }
    }

    for (const sessionId of sessionsToRemove) {
      this.completedSessions.delete(sessionId);
    }

    this.emit('sessions-cleaned', { cleanedCount: sessionsToRemove.length });
  }

  private async startProfiling(session: ProfilingSession): Promise<void> {
    switch (session.outputFormat) {
      case ProfilingOutputFormat.CPU_PROFILE:
        await this.startCPUProfiling(session);
        break;
      case ProfilingOutputFormat.HEAP_SNAPSHOT:
        await this.startHeapProfiling(session);
        break;
      case ProfilingOutputFormat.FLAMEGRAPH:
        await this.startFlamegraphProfiling(session);
        break;
      case ProfilingOutputFormat.CALL_TREE:
        await this.startCallTreeProfiling(session);
        break;
    }
  }

  private async stopProfiling(session: ProfilingSession): Promise<ProfileData> {
    switch (session.outputFormat) {
      case ProfilingOutputFormat.CPU_PROFILE:
        return this.stopCPUProfiling(session);
      case ProfilingOutputFormat.HEAP_SNAPSHOT:
        return this.stopHeapProfiling(session);
      case ProfilingOutputFormat.FLAMEGRAPH:
        return this.stopFlamegraphProfiling(session);
      case ProfilingOutputFormat.CALL_TREE:
        return this.stopCallTreeProfiling(session);
      default:
        throw new Error(`Unsupported profiling format: ${session.outputFormat}`);
    }
  }

  private async startCPUProfiling(session: ProfilingSession): Promise<void> {
    // Mock CPU profiling start
    // In production, this would use Node.js inspector or v8-profiler
    this.emit('cpu-profiling-started', { sessionId: session.id });
  }

  private async stopCPUProfiling(session: ProfilingSession): Promise<ProfileData> {
    // Mock CPU profiling data
    const mockProfile: CPUProfile = {
      totalTime: session.duration || 0,
      idleTime: (session.duration || 0) * 0.3,
      userTime: (session.duration || 0) * 0.6,
      systemTime: (session.duration || 0) * 0.1,
      samples: this.generateMockCPUSamples(100)
    };

    const topFunctions = this.generateMockProfileFunctions(10);
    
    return {
      format: ProfilingOutputFormat.CPU_PROFILE,
      data: JSON.stringify(mockProfile),
      summary: {
        totalSamples: mockProfile.samples.length,
        samplingDuration: session.duration || 0,
        topFunctions,
        memoryUsage: this.generateMockMemoryProfile()
      },
      size: JSON.stringify(mockProfile).length
    };
  }

  private async startHeapProfiling(session: ProfilingSession): Promise<void> {
    // Mock heap profiling start
    this.emit('heap-profiling-started', { sessionId: session.id });
  }

  private async stopHeapProfiling(session: ProfilingSession): Promise<ProfileData> {
    // Mock heap snapshot
    const heapSnapshot = {
      nodes: [],
      edges: [],
      strings: [],
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id'],
        node_types: [['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'native', 'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint']],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak']]
      }
    };

    return {
      format: ProfilingOutputFormat.HEAP_SNAPSHOT,
      data: JSON.stringify(heapSnapshot),
      summary: {
        totalSamples: 0,
        samplingDuration: session.duration || 0,
        topFunctions: [],
        memoryUsage: this.generateMockMemoryProfile()
      },
      size: JSON.stringify(heapSnapshot).length
    };
  }

  private async startFlamegraphProfiling(session: ProfilingSession): Promise<void> {
    // Mock flamegraph profiling start
    this.emit('flamegraph-profiling-started', { sessionId: session.id });
  }

  private async stopFlamegraphProfiling(session: ProfilingSession): Promise<ProfileData> {
    // Mock flamegraph data
    const flamegraphData = this.generateMockFlamegraphData();

    return {
      format: ProfilingOutputFormat.FLAMEGRAPH,
      data: flamegraphData,
      summary: {
        totalSamples: 1000,
        samplingDuration: session.duration || 0,
        topFunctions: this.generateMockProfileFunctions(20),
        memoryUsage: this.generateMockMemoryProfile()
      },
      size: flamegraphData.length
    };
  }

  private async startCallTreeProfiling(session: ProfilingSession): Promise<void> {
    // Mock call tree profiling start
    this.emit('call-tree-profiling-started', { sessionId: session.id });
  }

  private async stopCallTreeProfiling(session: ProfilingSession): Promise<ProfileData> {
    // Mock call tree data
    const callTreeData = {
      root: {
        name: 'root',
        selfTime: 0,
        totalTime: session.duration || 0,
        children: this.generateMockCallTreeNodes(5, 3)
      }
    };

    return {
      format: ProfilingOutputFormat.CALL_TREE,
      data: JSON.stringify(callTreeData),
      summary: {
        totalSamples: 500,
        samplingDuration: session.duration || 0,
        topFunctions: this.generateMockProfileFunctions(15),
        memoryUsage: this.generateMockMemoryProfile()
      },
      size: JSON.stringify(callTreeData).length
    };
  }

  private async generateProfileOutput(session: ProfilingSession): Promise<string> {
    const timestamp = session.startTime.toISOString().replace(/[:.]/g, '-');
    const outputPath = `/tmp/profile-${session.id}-${timestamp}`;

    // Mock file writing
    // In production, this would write actual profile data to disk
    
    return outputPath;
  }

  private generateMockCPUSamples(count: number): CPUSample[] {
    const samples: CPUSample[] = [];
    const functions = ['main', 'processRequest', 'validateInput', 'queryDatabase', 'renderResponse'];
    
    for (let i = 0; i < count; i++) {
      samples.push({
        timestamp: Date.now() + i * 10,
        stackTrace: this.generateMockStackTrace(functions),
        weight: Math.random() * 100
      });
    }
    
    return samples;
  }

  private generateMockStackTrace(functions: string[]): string[] {
    const depth = Math.floor(Math.random() * 5) + 1;
    const stack: string[] = [];
    
    for (let i = 0; i < depth; i++) {
      const func = functions[Math.floor(Math.random() * functions.length)];
      stack.push(`${func}:${Math.floor(Math.random() * 100) + 1}`);
    }
    
    return stack;
  }

  private generateMockProfileFunctions(count: number): ProfileFunction[] {
    const functions: ProfileFunction[] = [];
    const names = [
      'main', 'processRequest', 'validateInput', 'queryDatabase', 'renderResponse',
      'parseJSON', 'authenticate', 'authorize', 'cacheGet', 'cacheSet',
      'logRequest', 'handleError', 'sendResponse', 'closeConnection'
    ];
    
    let totalTime = 1000;
    
    for (let i = 0; i < Math.min(count, names.length); i++) {
      const selfTime = Math.random() * (totalTime / count);
      const callCount = Math.floor(Math.random() * 100) + 1;
      
      functions.push({
        name: names[i],
        file: `src/${names[i].toLowerCase()}.ts`,
        line: Math.floor(Math.random() * 200) + 1,
        selfTime,
        totalTime: selfTime * 1.5,
        callCount,
        percentage: (selfTime / totalTime) * 100
      });
    }
    
    return functions.sort((a, b) => b.selfTime - a.selfTime);
  }

  private generateMockMemoryProfile(): MemoryProfile {
    return {
      totalAllocated: Math.random() * 100 * 1024 * 1024, // Up to 100MB
      totalFreed: Math.random() * 80 * 1024 * 1024, // Up to 80MB
      peakUsage: Math.random() * 50 * 1024 * 1024, // Up to 50MB
      leakSuspects: [
        {
          type: 'Buffer',
          count: Math.floor(Math.random() * 100),
          size: Math.random() * 1024 * 1024,
          stackTrace: 'at createBuffer\n  at processData\n  at main'
        },
        {
          type: 'EventEmitter',
          count: Math.floor(Math.random() * 50),
          size: Math.random() * 512 * 1024,
          stackTrace: 'at new EventEmitter\n  at createStream\n  at handleRequest'
        }
      ]
    };
  }

  private generateMockFlamegraphData(): string {
    // Mock flamegraph format (collapsed stack format)
    const lines = [
      'main;processRequest;validateInput 100',
      'main;processRequest;queryDatabase 250',
      'main;processRequest;renderResponse 150',
      'main;processRequest;queryDatabase;executeSQL 200',
      'main;processRequest;renderResponse;buildHTML 100',
      'main;processRequest;renderResponse;sendResponse 50',
      'main;logRequest 50',
      'main;handleError 25'
    ];
    
    return lines.join('\n');
  }

  private generateMockCallTreeNodes(depth: number, maxChildren: number): unknown[] {
    if (depth === 0) return [];
    
    const nodes = [];
    const childCount = Math.floor(Math.random() * maxChildren) + 1;
    
    for (let i = 0; i < childCount; i++) {
      const selfTime = Math.random() * 100;
      nodes.push({
        name: `function_${depth}_${i}`,
        selfTime,
        totalTime: selfTime * 2,
        children: this.generateMockCallTreeNodes(depth - 1, maxChildren)
      });
    }
    
    return nodes;
  }
}