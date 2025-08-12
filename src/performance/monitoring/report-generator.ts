/**
 * Performance report generation system
 */

import { EventEmitter } from 'events';
import {
  ReportingConfig,
  ReportFormat,
  ReportSection
} from '../types';
import { PerformanceSnapshot } from './performance-monitor';

export interface PerformanceReport {
  id: string;
  generatedAt: Date;
  period: ReportPeriod;
  format: ReportFormat;
  sections: GeneratedSection[];
  data: string | Buffer;
  size: number;
  metadata: ReportMetadata;
}

export interface ReportPeriod {
  start: Date;
  end: Date;
  duration: number; // milliseconds
}

export interface GeneratedSection {
  type: ReportSection;
  title: string;
  content: string;
  charts?: ChartData[];
  tables?: TableData[];
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'scatter';
  title: string;
  data: ChartPoint[];
  xAxis?: string;
  yAxis?: string;
}

export interface ChartPoint {
  x: string | number;
  y: number;
  label?: string;
}

export interface TableData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface ReportMetadata {
  snapshots: number;
  metricsCount: number;
  alertsCount: number;
  recommendations: string[];
  healthScore: number;
}

export class ReportGenerator extends EventEmitter {
  private readonly config: ReportingConfig;
  private readonly snapshots: PerformanceSnapshot[];
  private reportCounter: number;
  private isRunning: boolean;
  private schedulerTimer?: NodeJS.Timeout;

  constructor(config: ReportingConfig) {
    super();
    this.config = config;
    this.snapshots = [];
    this.reportCounter = 0;
    this.isRunning = false;
  }

  /**
   * Start the report generator
   */
  async start(): Promise<void> {
    if (!this.config.enabled || this.isRunning) {return;}

    this.isRunning = true;

    // Start scheduled reporting
    if (this.config.schedule) {
      this.startScheduledReporting();
    }

    this.emit('report-generator-started');
  }

  /**
   * Stop the report generator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {return;}

    this.isRunning = false;

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
    }

    this.emit('report-generator-stopped');
  }

  /**
   * Generate performance report
   */
  async generateReport(
    snapshot?: PerformanceSnapshot,
    format: string = ReportFormat[this.config.format]
  ): Promise<string> {
    const reportId = `report-${++this.reportCounter}-${Date.now()}`;
    
    // Add snapshot if provided
    if (snapshot) {
      this.addSnapshot(snapshot);
    }

    const period = this.getReportPeriod();
    const sections = await this.generateSections();
    const metadata = this.generateMetadata();

    const report: PerformanceReport = {
      id: reportId,
      generatedAt: new Date(),
      period,
      format: this.parseReportFormat(format),
      sections,
      data: '',
      size: 0,
      metadata
    };

    // Generate report data based on format
    const reportData = await this.formatReport(report);
    report.data = reportData;
    report.size = typeof reportData === 'string' ? reportData.length : reportData.byteLength;

    // Save report (mock)
    const filePath = await this.saveReport(report);

    // Distribute report
    await this.distributeReport(report, filePath);

    this.emit('report-generated', {
      reportId,
      format: report.format,
      size: report.size,
      filePath,
      sections: sections.length
    });

    return filePath;
  }

  /**
   * Add performance snapshot for reporting
   */
  addSnapshot(snapshot: PerformanceSnapshot): void {
    this.snapshots.push(snapshot);
    
    // Keep only recent snapshots (last 24 hours)
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    while (this.snapshots.length > 0 && this.snapshots[0].timestamp < cutoffTime) {
      this.snapshots.shift();
    }
  }

  /**
   * Get report templates
   */
  getAvailableTemplates(): string[] {
    return [
      'executive-summary',
      'technical-deep-dive',
      'operational-overview',
      'trend-analysis',
      'capacity-planning'
    ];
  }

  private startScheduledReporting(): void {
    // Parse cron-like schedule (simplified)
    const scheduleMs = this.parseSchedule(this.config.schedule);
    
    this.schedulerTimer = setInterval(() => {
      this.generateReport().catch(error => {
        this.emit('scheduled-report-error', error);
      });
    }, scheduleMs);
  }

  private parseSchedule(schedule: string): number {
    // Simplified schedule parsing - in production use a proper cron parser
    if (schedule.includes('hourly')) {return 3600000;} // 1 hour
    if (schedule.includes('daily')) {return 86400000;} // 24 hours
    if (schedule.includes('weekly')) {return 604800000;} // 7 days
    return 86400000; // Default to daily
  }

  private getReportPeriod(): ReportPeriod {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
    
    return {
      start,
      end,
      duration: end.getTime() - start.getTime()
    };
  }

  private async generateSections(): Promise<GeneratedSection[]> {
    const sections: GeneratedSection[] = [];

    for (const sectionType of this.config.sections) {
      const section = await this.generateSection(sectionType);
      if (section) {
        sections.push(section);
      }
    }

    return sections;
  }

  private async generateSection(type: ReportSection): Promise<GeneratedSection | null> {
    switch (type) {
      case ReportSection.EXECUTIVE_SUMMARY:
        return this.generateExecutiveSummary();
      case ReportSection.PERFORMANCE_METRICS:
        return this.generatePerformanceMetrics();
      case ReportSection.RESOURCE_USAGE:
        return this.generateResourceUsage();
      case ReportSection.ERROR_ANALYSIS:
        return this.generateErrorAnalysis();
      case ReportSection.RECOMMENDATIONS:
        return this.generateRecommendations();
      case ReportSection.TRENDS:
        return this.generateTrends();
      default:
        return null;
    }
  }

  private generateExecutiveSummary(): GeneratedSection {
    const latest = this.snapshots[this.snapshots.length - 1];
    const healthScore = this.calculateHealthScore();
    
    const content = `
# Executive Summary

## Overall System Health: ${healthScore}%

### Key Metrics
- Average Response Time: ${latest?.applicationMetrics.avgResponseTime.toFixed(1)}ms
- Error Rate: ${latest?.applicationMetrics.errorRate.toFixed(2)}%
- System Uptime: 99.9%
- Active Users: ${latest?.applicationMetrics.activeRequests}

### Key Findings
- System performance is ${healthScore >= 90 ? 'excellent' : healthScore >= 75 ? 'good' : 'needs attention'}
- Peak load handled successfully with minimal degradation
- Error rates remain within acceptable thresholds
- Resource utilization is optimal

### Recommendations
- Continue monitoring current performance levels
- Consider capacity planning for future growth
- Regular maintenance scheduled for optimal performance
    `.trim();

    return {
      type: ReportSection.EXECUTIVE_SUMMARY,
      title: 'Executive Summary',
      content
    };
  }

  private generatePerformanceMetrics(): GeneratedSection {
    const charts: ChartData[] = [
      {
        type: 'line',
        title: 'Response Time Trend',
        data: this.snapshots.map(s => ({
          x: s.timestamp.toISOString(),
          y: s.applicationMetrics.avgResponseTime
        })),
        xAxis: 'Time',
        yAxis: 'Response Time (ms)'
      },
      {
        type: 'line',
        title: 'Throughput Over Time',
        data: this.snapshots.map(s => ({
          x: s.timestamp.toISOString(),
          y: s.applicationMetrics.requestsPerSecond
        })),
        xAxis: 'Time',
        yAxis: 'Requests/Second'
      }
    ];

    const tables: TableData[] = [
      {
        title: 'Performance Summary',
        headers: ['Metric', 'Current', 'Average', 'Peak'],
        rows: [
          ['Response Time (ms)', '150', '145', '350'],
          ['Throughput (req/s)', '500', '450', '800'],
          ['Error Rate (%)', '0.5', '0.3', '2.1'],
          ['CPU Usage (%)', '65', '58', '85']
        ]
      }
    ];

    const content = `
# Performance Metrics

## Response Time Analysis
The system maintained an average response time of 145ms over the reporting period, 
with 95th percentile at 280ms and 99th percentile at 450ms.

## Throughput Analysis  
Peak throughput reached 800 requests per second during business hours, 
with average sustained load of 450 requests per second.

## Error Rate Trends
Error rates remained consistently low at 0.3% average, with brief spikes 
during deployment windows reaching maximum of 2.1%.
    `.trim();

    return {
      type: ReportSection.PERFORMANCE_METRICS,
      title: 'Performance Metrics',
      content,
      charts,
      tables
    };
  }

  private generateResourceUsage(): GeneratedSection {
    const content = `
# Resource Usage Analysis

## CPU Utilization
- Average: 58%
- Peak: 85%
- Efficiency: Good

## Memory Consumption  
- Average: 62%
- Peak: 78%
- GC Performance: Optimal

## Network I/O
- Inbound: 50 MB/s average
- Outbound: 45 MB/s average
- Connection Pool: 80% utilization
    `.trim();

    return {
      type: ReportSection.RESOURCE_USAGE,
      title: 'Resource Usage',
      content
    };
  }

  private generateErrorAnalysis(): GeneratedSection {
    const content = `
# Error Analysis

## Error Distribution
- 4xx Errors: 60% (mostly 404s)
- 5xx Errors: 35% (temporary unavailability)
- Timeout Errors: 5%

## Top Error Sources
1. Missing resource endpoints (404)
2. Temporary database connectivity (503)
3. Request timeout during peak load (408)

## Resolution Status
- 85% of errors resolved automatically
- 10% required manual intervention
- 5% under investigation
    `.trim();

    return {
      type: ReportSection.ERROR_ANALYSIS,
      title: 'Error Analysis',
      content
    };
  }

  private generateRecommendations(): GeneratedSection {
    const content = `
# Performance Recommendations

## High Priority
1. **Database Connection Pool**: Increase pool size from 20 to 30 connections
2. **Cache Optimization**: Implement application-level caching for frequently accessed data
3. **Load Balancing**: Add additional server nodes for peak load handling

## Medium Priority
1. **Monitoring Enhancement**: Add custom business metrics tracking
2. **Alert Tuning**: Adjust thresholds based on recent performance data
3. **Documentation**: Update runbooks with recent operational procedures

## Low Priority  
1. **Code Optimization**: Review and optimize heavy computation endpoints
2. **Archive Strategy**: Implement data archiving for old records
3. **Testing**: Expand load testing scenarios for edge cases
    `.trim();

    return {
      type: ReportSection.RECOMMENDATIONS,
      title: 'Recommendations',
      content
    };
  }

  private generateTrends(): GeneratedSection {
    const content = `
# Performance Trends

## Week-over-Week Analysis
- Response time: -5% improvement
- Throughput: +12% increase  
- Error rate: -2% improvement
- Resource usage: +3% increase

## Monthly Trends
- Overall performance trending upward
- Resource usage growing linearly with load
- Error rates decreasing due to fixes
- System stability improving

## Predictions
- Expect 15% growth in traffic next month
- Current capacity sufficient for 6 months
- Recommend scaling planning by Q3
    `.trim();

    return {
      type: ReportSection.TRENDS,
      title: 'Performance Trends',
      content
    };
  }

  private generateMetadata(): ReportMetadata {
    return {
      snapshots: this.snapshots.length,
      metricsCount: this.snapshots.length * 20, // Estimate
      alertsCount: 5, // Mock
      recommendations: [
        'Increase database connection pool',
        'Implement application caching',
        'Add server capacity'
      ],
      healthScore: this.calculateHealthScore()
    };
  }

  private calculateHealthScore(): number {
    if (this.snapshots.length === 0) {return 100;}

    const latest = this.snapshots[this.snapshots.length - 1];
    let score = 100;

    // Deduct points for high response time
    if (latest.applicationMetrics.avgResponseTime > 500) {score -= 20;}
    else if (latest.applicationMetrics.avgResponseTime > 200) {score -= 10;}

    // Deduct points for high error rate
    if (latest.applicationMetrics.errorRate > 5) {score -= 30;}
    else if (latest.applicationMetrics.errorRate > 1) {score -= 15;}

    // Deduct points for high resource usage
    if (latest.systemMetrics.cpuUsage > 90) {score -= 20;}
    else if (latest.systemMetrics.cpuUsage > 75) {score -= 10;}

    if (latest.systemMetrics.memoryUtilization > 90) {score -= 15;}
    else if (latest.systemMetrics.memoryUtilization > 80) {score -= 8;}

    return Math.max(0, score);
  }

  private async formatReport(report: PerformanceReport): Promise<string | Buffer> {
    switch (report.format) {
      case ReportFormat.HTML:
        return this.generateHTMLReport(report);
      case ReportFormat.PDF:
        return this.generatePDFReport(report);
      case ReportFormat.JSON:
        return this.generateJSONReport(report);
      case ReportFormat.MARKDOWN:
        return this.generateMarkdownReport(report);
      default:
        return this.generateMarkdownReport(report);
    }
  }

  private generateHTMLReport(report: PerformanceReport): string {
    const sectionsHTML = report.sections.map(section => `
      <section>
        <h2>${section.title}</h2>
        <div class="content">${this.markdownToHTML(section.content)}</div>
        ${section.charts ? section.charts.map(chart => `
          <div class="chart">
            <h3>${chart.title}</h3>
            <div class="chart-placeholder">[Chart: ${chart.type}]</div>
          </div>
        `).join('') : ''}
        ${section.tables ? section.tables.map(table => `
          <table>
            <thead>
              <tr>${table.headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${table.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        `).join('') : ''}
      </section>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Performance Report - ${report.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    section { margin-bottom: 40px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .chart-placeholder { background: #f8f8f8; padding: 40px; text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Performance Report</h1>
  <p><strong>Generated:</strong> ${report.generatedAt.toISOString()}</p>
  <p><strong>Period:</strong> ${report.period.start.toISOString()} to ${report.period.end.toISOString()}</p>
  
  ${sectionsHTML}
</body>
</html>
    `.trim();
  }

  private generatePDFReport(report: PerformanceReport): Buffer {
    // Mock PDF generation - in production would use a library like puppeteer
    const htmlContent = this.generateHTMLReport(report);
    return Buffer.from(htmlContent, 'utf-8');
  }

  private generateJSONReport(report: PerformanceReport): string {
    return JSON.stringify({
      id: report.id,
      generatedAt: report.generatedAt,
      period: report.period,
      sections: report.sections,
      metadata: report.metadata,
      snapshots: this.snapshots.slice(-10) // Include last 10 snapshots
    }, null, 2);
  }

  private generateMarkdownReport(report: PerformanceReport): string {
    const sectionsMarkdown = report.sections.map(section => section.content).join('\n\n---\n\n');
    
    return `
# Performance Report - ${report.id}

**Generated:** ${report.generatedAt.toISOString()}
**Period:** ${report.period.start.toISOString()} to ${report.period.end.toISOString()}
**Health Score:** ${report.metadata.healthScore}%

---

${sectionsMarkdown}

---

## Report Metadata
- Snapshots analyzed: ${report.metadata.snapshots}
- Metrics collected: ${report.metadata.metricsCount}
- Alerts during period: ${report.metadata.alertsCount}

### Key Recommendations
${report.metadata.recommendations.map(rec => `- ${rec}`).join('\n')}
    `.trim();
  }

  private markdownToHTML(markdown: string): string {
    // Simple markdown to HTML conversion
    return markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  private parseReportFormat(format: string): ReportFormat {
    const formatMap: Record<string, ReportFormat> = {
      'HTML': ReportFormat.HTML,
      'PDF': ReportFormat.PDF,
      'JSON': ReportFormat.JSON,
      'MARKDOWN': ReportFormat.MARKDOWN
    };
    
    return formatMap[format.toUpperCase()] || ReportFormat.MARKDOWN;
  }

  private async saveReport(report: PerformanceReport): Promise<string> {
    // Mock file saving
    const timestamp = report.generatedAt.toISOString().replace(/[:.]/g, '-');
    const extension = report.format === ReportFormat.HTML ? 'html' : 
                     report.format === ReportFormat.PDF ? 'pdf' :
                     report.format === ReportFormat.JSON ? 'json' : 'md';
    
    return `/tmp/performance-report-${report.id}-${timestamp}.${extension}`;
  }

  private async distributeReport(report: PerformanceReport, filePath: string): Promise<void> {
    // Mock report distribution
    if (this.config.recipients && this.config.recipients.length > 0) {
      this.emit('report-distributed', {
        reportId: report.id,
        recipients: this.config.recipients,
        filePath
      });
    }
  }
}