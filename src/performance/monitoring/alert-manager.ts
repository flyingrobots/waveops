/**
 * Alert management system for performance monitoring
 */

import { EventEmitter } from 'events';
import {
  AlertConfig,
  AlertRule,
  AlertSeverity,
  AlertChannelType,
  AlertChannel,
  AlertThrottlingConfig,
  AlertCondition,
  AlertOperator
} from '../types';

export interface Alert {
  id: string;
  name: string;
  rule?: AlertRule;
  severity: AlertSeverity;
  value: number;
  threshold?: number;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  channels: string[];
  metadata?: Record<string, unknown>;
}

export interface AlertStats {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  alertsByLevel: Record<AlertSeverity, number>;
  alertsByChannel: Record<string, number>;
  avgResolutionTime: number;
  alertRate: number; // alerts per hour
}

export class AlertManager extends EventEmitter {
  private readonly config: AlertConfig;
  private readonly activeAlerts: Map<string, Alert>;
  private readonly alertHistory: Alert[];
  private readonly channelHandlers: Map<AlertChannelType, (alert: Alert, channel: AlertChannel) => Promise<void>>;
  private readonly alertCooldowns: Map<string, Date>;
  private alertCounter: number;
  private isRunning: boolean;
  private evaluationTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: AlertConfig) {
    super();
    this.config = config;
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.channelHandlers = new Map();
    this.alertCooldowns = new Map();
    this.alertCounter = 0;
    this.isRunning = false;

    this.initializeChannelHandlers();
  }

  /**
   * Start the alert manager
   */
  async start(): Promise<void> {
    if (!this.config.enabled || this.isRunning) {return;}

    this.isRunning = true;

    // Start periodic tasks
    this.startPeriodicTasks();

    this.emit('alert-manager-started');
  }

  /**
   * Stop the alert manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {return;}

    this.isRunning = false;

    // Clear timers
    if (this.evaluationTimer) {clearInterval(this.evaluationTimer);}
    if (this.cleanupTimer) {clearInterval(this.cleanupTimer);}

    this.emit('alert-manager-stopped');
  }

  /**
   * Evaluate alert rule
   */
  evaluateRule(rule: AlertRule, value: number, timestamp: Date): void {
    if (!rule.enabled) {return;}

    // Check if rule is in cooldown
    if (this.isRuleInCooldown(rule)) {return;}

    const existingAlert = this.findActiveAlert(rule.name);
    const conditionMet = this.evaluateCondition(rule.condition, value);

    if (conditionMet && !existingAlert) {
      // New alert
      this.createAlert(rule, value, timestamp);
    } else if (!conditionMet && existingAlert) {
      // Resolve existing alert
      this.resolveAlert(existingAlert.id, timestamp);
    } else if (existingAlert) {
      // Update existing alert
      existingAlert.value = value;
      existingAlert.timestamp = timestamp;
    }
  }

  /**
   * Trigger alert manually
   */
  triggerAlert(alertData: Partial<Alert>): void {
    const alert = this.createAlertFromData(alertData);
    this.processNewAlert(alert);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string, timestamp?: Date): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved) {return false;}

    alert.resolved = true;
    alert.resolvedAt = timestamp || new Date();

    this.activeAlerts.delete(alertId);
    this.alertHistory.push(alert);

    this.emit('alert-resolved', alert);
    this.notifyChannels(alert, 'resolved');

    return true;
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved) {return false;}

    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    this.emit('alert-acknowledged', alert);
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): Alert[] {
    return limit ? this.alertHistory.slice(-limit) : [...this.alertHistory];
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): AlertStats {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentAlerts = this.alertHistory.filter(alert => 
      alert.timestamp.getTime() >= oneHourAgo
    );

    const alertsByLevel: Record<AlertSeverity, number> = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.ERROR]: 0,
      [AlertSeverity.CRITICAL]: 0
    };

    const alertsByChannel: Record<string, number> = {};
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const alert of this.alertHistory) {
      alertsByLevel[alert.severity]++;
      
      for (const channel of alert.channels) {
        alertsByChannel[channel] = (alertsByChannel[channel] || 0) + 1;
      }

      if (alert.resolved && alert.resolvedAt) {
        totalResolutionTime += alert.resolvedAt.getTime() - alert.timestamp.getTime();
        resolvedCount++;
      }
    }

    return {
      totalAlerts: this.alertHistory.length + this.activeAlerts.size,
      activeAlerts: this.activeAlerts.size,
      resolvedAlerts: this.alertHistory.filter(a => a.resolved).length,
      alertsByLevel,
      alertsByChannel,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      alertRate: recentAlerts.length
    };
  }

  /**
   * Add custom alert channel handler
   */
  addChannelHandler(
    type: AlertChannelType, 
    handler: (alert: Alert, channel: AlertChannel) => Promise<void>
  ): void {
    this.channelHandlers.set(type, handler);
  }

  private initializeChannelHandlers(): void {
    this.channelHandlers.set(AlertChannelType.EMAIL, this.handleEmailAlert.bind(this));
    this.channelHandlers.set(AlertChannelType.SLACK, this.handleSlackAlert.bind(this));
    this.channelHandlers.set(AlertChannelType.WEBHOOK, this.handleWebhookAlert.bind(this));
    this.channelHandlers.set(AlertChannelType.SMS, this.handleSMSAlert.bind(this));
    this.channelHandlers.set(AlertChannelType.PAGERDUTY, this.handlePagerDutyAlert.bind(this));
  }

  private createAlert(rule: AlertRule, value: number, timestamp: Date): Alert {
    const alertId = `alert-${++this.alertCounter}-${Date.now()}`;
    
    const alert: Alert = {
      id: alertId,
      name: rule.name,
      rule,
      severity: rule.severity,
      value,
      threshold: rule.condition.threshold,
      message: this.generateAlertMessage(rule, value),
      timestamp,
      resolved: false,
      channels: rule.channels
    };

    this.processNewAlert(alert);
    return alert;
  }

  private createAlertFromData(alertData: Partial<Alert>): Alert {
    const alertId = `alert-${++this.alertCounter}-${Date.now()}`;
    
    return {
      id: alertId,
      name: alertData.name || 'Manual Alert',
      severity: alertData.severity || AlertSeverity.WARNING,
      value: alertData.value || 0,
      message: alertData.message || 'Manual alert triggered',
      timestamp: alertData.timestamp || new Date(),
      resolved: false,
      channels: alertData.channels || [],
      ...alertData
    };
  }

  private processNewAlert(alert: Alert): void {
    // Check throttling
    if (this.isThrottled()) {
      this.emit('alert-throttled', alert);
      return;
    }

    this.activeAlerts.set(alert.id, alert);
    
    // Set cooldown for the rule
    if (alert.rule) {
      this.alertCooldowns.set(alert.rule.name, new Date(Date.now() + alert.rule.cooldown));
    }

    this.emit('alert-triggered', alert);
    this.notifyChannels(alert, 'triggered');
  }

  private async notifyChannels(alert: Alert, action: 'triggered' | 'resolved'): Promise<void> {
    if (alert.channels.length === 0) {return;}

    const notificationPromises: Promise<void>[] = [];

    for (const channelName of alert.channels) {
      const channel = this.config.channels.find(c => c.name === channelName);
      if (!channel || !channel.enabled) {continue;}

      const handler = this.channelHandlers.get(channel.type);
      if (handler) {
        notificationPromises.push(
          handler(alert, channel).catch(error => {
            this.emit('notification-error', { 
              alertId: alert.id, 
              channel: channelName, 
              error 
            });
          })
        );
      }
    }

    await Promise.allSettled(notificationPromises);
  }

  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case AlertOperator.GREATER_THAN:
        return value > condition.threshold;
      case AlertOperator.LESS_THAN:
        return value < condition.threshold;
      case AlertOperator.EQUALS:
        return value === condition.threshold;
      case AlertOperator.NOT_EQUALS:
        return value !== condition.threshold;
      case AlertOperator.GREATER_THAN_OR_EQUAL:
        return value >= condition.threshold;
      case AlertOperator.LESS_THAN_OR_EQUAL:
        return value <= condition.threshold;
      default:
        return false;
    }
  }

  private isRuleInCooldown(rule: AlertRule): boolean {
    const cooldownEnd = this.alertCooldowns.get(rule.name);
    return cooldownEnd ? cooldownEnd > new Date() : false;
  }

  private findActiveAlert(ruleName: string): Alert | undefined {
    return Array.from(this.activeAlerts.values()).find(alert => 
      alert.rule?.name === ruleName
    );
  }

  private isThrottled(): boolean {
    if (!this.config.throttling?.enabled) {return false;}

    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentAlerts = this.alertHistory.filter(alert => 
      alert.timestamp.getTime() >= oneHourAgo
    ).length + this.activeAlerts.size;

    return recentAlerts >= this.config.throttling.maxAlertsPerHour;
  }

  private generateAlertMessage(rule: AlertRule, value: number): string {
    const operator = this.getOperatorString(rule.condition.operator);
    return `${rule.name}: ${rule.condition.metric} is ${value} (${operator} ${rule.condition.threshold})`;
  }

  private getOperatorString(operator: AlertOperator): string {
    const operatorMap = {
      [AlertOperator.GREATER_THAN]: '>',
      [AlertOperator.LESS_THAN]: '<',
      [AlertOperator.EQUALS]: '=',
      [AlertOperator.NOT_EQUALS]: '!=',
      [AlertOperator.GREATER_THAN_OR_EQUAL]: '>=',
      [AlertOperator.LESS_THAN_OR_EQUAL]: '<='
    };
    return operatorMap[operator] || '?';
  }

  private startPeriodicTasks(): void {
    // Cleanup old alerts
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldAlerts();
    }, 3600000); // Every hour
  }

  private cleanupOldAlerts(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const initialLength = this.alertHistory.length;
    
    // Remove old alerts
    for (let i = this.alertHistory.length - 1; i >= 0; i--) {
      if (this.alertHistory[i].timestamp < cutoffTime) {
        this.alertHistory.splice(0, i + 1);
        break;
      }
    }

    // Clear old cooldowns
    const expiredCooldowns: string[] = [];
    for (const [ruleName, cooldownEnd] of this.alertCooldowns.entries()) {
      if (cooldownEnd <= new Date()) {
        expiredCooldowns.push(ruleName);
      }
    }

    for (const ruleName of expiredCooldowns) {
      this.alertCooldowns.delete(ruleName);
    }

    const cleanedCount = initialLength - this.alertHistory.length;
    if (cleanedCount > 0) {
      this.emit('alerts-cleaned', { cleanedCount, expiredCooldowns: expiredCooldowns.length });
    }
  }

  // Channel handlers
  private async handleEmailAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Mock email sending
    this.emit('alert-email-sent', { 
      alertId: alert.id, 
      channel: channel.name,
      recipients: channel.config.recipients || ['admin@example.com']
    });
  }

  private async handleSlackAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Mock Slack notification
    this.emit('alert-slack-sent', { 
      alertId: alert.id, 
      channel: channel.name,
      webhook: channel.config.webhook || 'https://hooks.slack.com/...'
    });
  }

  private async handleWebhookAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Mock webhook call
    this.emit('alert-webhook-sent', { 
      alertId: alert.id, 
      channel: channel.name,
      url: channel.config.url || 'https://example.com/webhook'
    });
  }

  private async handleSMSAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Mock SMS sending
    this.emit('alert-sms-sent', { 
      alertId: alert.id, 
      channel: channel.name,
      phoneNumbers: channel.config.phoneNumbers || ['+1234567890']
    });
  }

  private async handlePagerDutyAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Mock PagerDuty integration
    this.emit('alert-pagerduty-sent', { 
      alertId: alert.id, 
      channel: channel.name,
      integrationKey: channel.config.integrationKey || 'mock-key'
    });
  }
}