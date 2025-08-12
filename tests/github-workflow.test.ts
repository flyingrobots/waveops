/**
 * Tests for GitHub Actions Workflow (W3.T001 - Alice)
 * GitHub Actions wave-coordinator.yml workflow tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('GitHub Actions Workflow (W3.T001)', () => {
  let workflow: any;

  beforeAll(() => {
    const workflowPath = path.join(__dirname, '../.github/workflows/wave-coordinator.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    workflow = yaml.load(workflowContent);
  });

  describe('Workflow configuration', () => {
    it('should have correct name and triggers', () => {
      expect(workflow.name).toBe('WaveOps Coordinator');
      
      // Check all required triggers
      expect(workflow.on).toHaveProperty('issues');
      expect(workflow.on).toHaveProperty('issue_comment');
      expect(workflow.on).toHaveProperty('pull_request');
      expect(workflow.on).toHaveProperty('pull_request_review');
      expect(workflow.on).toHaveProperty('push');
      expect(workflow.on).toHaveProperty('workflow_dispatch');
    });

    it('should have proper issue triggers', () => {
      expect(workflow.on.issues.types).toEqual(['opened', 'edited', 'closed', 'reopened']);
      expect(workflow.on.issue_comment.types).toEqual(['created', 'edited']);
    });

    it('should have proper PR triggers', () => {
      expect(workflow.on.pull_request.types).toEqual(['opened', 'closed', 'synchronize']);
      expect(workflow.on.pull_request_review.types).toEqual(['submitted']);
    });

    it('should have push trigger for main branch', () => {
      expect(workflow.on.push.branches).toEqual(['main']);
    });

    it('should have workflow_dispatch with proper inputs', () => {
      expect(workflow.on.workflow_dispatch.inputs).toHaveProperty('command');
      expect(workflow.on.workflow_dispatch.inputs).toHaveProperty('issue_number');
      expect(workflow.on.workflow_dispatch.inputs.command.required).toBe(true);
    });
  });

  describe('Security configuration', () => {
    it('should have minimal required permissions', () => {
      const permissions = workflow.permissions;
      expect(permissions).toEqual({
        contents: 'read',
        issues: 'write',
        'pull-requests': 'write',
        deployments: 'write',
        checks: 'write',
        actions: 'read'
      });
    });

    it('should have proper concurrency controls', () => {
      expect(workflow.concurrency).toEqual({
        group: 'wave-coordination-${{ github.repository }}',
        'cancel-in-progress': false
      });
    });
  });

  describe('Coordination job', () => {
    let coordinateJob: any;

    beforeAll(() => {
      coordinateJob = workflow.jobs.coordinate;
    });

    it('should have proper job configuration', () => {
      expect(coordinateJob.name).toBe('Wave Coordination');
      expect(coordinateJob['runs-on']).toBe('ubuntu-latest');
      expect(coordinateJob['timeout-minutes']).toBe(10);
    });

    it('should have event filtering condition', () => {
      expect(coordinateJob.if).toBeDefined();
      expect(coordinateJob.if).toContain('coordination');
      expect(coordinateJob.if).toContain('github.event_name');
    });

    it('should have required steps', () => {
      const stepNames = coordinateJob.steps.map((step: any) => step.name);
      expect(stepNames).toContain('Checkout repository');
      expect(stepNames).toContain('Setup Node.js');
      expect(stepNames).toContain('Install dependencies');
      expect(stepNames).toContain('Build project');
      expect(stepNames).toContain('Extract event context');
      expect(stepNames).toContain('Process coordination command');
      expect(stepNames).toContain('Update wave status');
      expect(stepNames).toContain('Handle coordination errors');
    });

    it('should use proper action versions', () => {
      const checkoutStep = coordinateJob.steps.find((step: any) => step.uses?.includes('checkout'));
      const nodeStep = coordinateJob.steps.find((step: any) => step.uses?.includes('setup-node'));
      
      expect(checkoutStep.uses).toBe('actions/checkout@v4');
      expect(nodeStep.uses).toBe('actions/setup-node@v4');
      expect(nodeStep.with['node-version']).toBe('20');
      expect(nodeStep.with.cache).toBe('npm');
    });

    it('should have proper error handling', () => {
      const errorStep = coordinateJob.steps.find((step: any) => step.name === 'Handle coordination errors');
      expect(errorStep.if).toBe('failure()');
      expect(errorStep.env).toHaveProperty('GITHUB_TOKEN');
      expect(errorStep.env).toHaveProperty('ISSUE_NUMBER');
    });
  });

  describe('Security audit job', () => {
    let auditJob: any;

    beforeAll(() => {
      auditJob = workflow.jobs.audit;
    });

    it('should have proper configuration', () => {
      expect(auditJob.name).toBe('Security Audit');
      expect(auditJob['runs-on']).toBe('ubuntu-latest');
      expect(auditJob.if).toContain('push');
      expect(auditJob.if).toContain('refs/heads/main');
    });

    it('should include security checks', () => {
      const stepNames = auditJob.steps.map((step: any) => step.name);
      expect(stepNames).toContain('Security audit');
      expect(stepNames).toContain('Check for secrets in logs');
    });
  });

  describe('Environment variables', () => {
    it('should use GITHUB_TOKEN for authentication', () => {
      const steps = workflow.jobs.coordinate.steps;
      const commandStep = steps.find((step: any) => step.name === 'Process coordination command');
      
      expect(commandStep.env).toHaveProperty('GITHUB_TOKEN');
      expect(commandStep.env.GITHUB_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    });

    it('should extract proper context variables', () => {
      const steps = workflow.jobs.coordinate.steps;
      const commandStep = steps.find((step: any) => step.name === 'Process coordination command');
      
      expect(commandStep.env).toHaveProperty('ISSUE_NUMBER');
      expect(commandStep.env).toHaveProperty('PR_NUMBER');
      expect(commandStep.env).toHaveProperty('EVENT_NAME');
    });
  });

  describe('Command processing', () => {
    it('should handle all event types', () => {
      const steps = workflow.jobs.coordinate.steps;
      const commandStep = steps.find((step: any) => step.name === 'Process coordination command');
      
      const runScript = commandStep.run;
      expect(runScript).toContain('case "$EVENT_NAME" in');
      expect(runScript).toContain('"issues"');
      expect(runScript).toContain('"issue_comment"');
      expect(runScript).toContain('"pull_request"');
      expect(runScript).toContain('"pull_request_review"');
      expect(runScript).toContain('"push"');
      expect(runScript).toContain('"workflow_dispatch"');
    });

    it('should call proper npm scripts', () => {
      const steps = workflow.jobs.coordinate.steps;
      const commandStep = steps.find((step: any) => step.name === 'Process coordination command');
      
      const runScript = commandStep.run;
      expect(runScript).toContain('npm run coordinate');
      expect(runScript).toContain('--event=');
      expect(runScript).toContain('--issue=');
      expect(runScript).toContain('--pr=');
    });
  });

  describe('Workflow file structure', () => {
    it('should be valid YAML', () => {
      expect(workflow).toBeDefined();
      expect(typeof workflow).toBe('object');
    });

    it('should have proper file location', () => {
      const workflowPath = path.join(__dirname, '../.github/workflows/wave-coordinator.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);
    });
  });
});