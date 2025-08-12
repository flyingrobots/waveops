/**
 * Tests for schema validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { validateTasksYaml, validateTeamsYaml } from '../src/validation/schema-validator';

describe('Schema Validation', () => {
  it('should validate tasks.yaml from plan-spec.md sample', () => {
    const tasksYaml = fs.readFileSync(path.join(__dirname, '../wave/tasks.yaml'), 'utf8');
    const result = validateTasksYaml(tasksYaml);
    
    if (!result.valid) {
      // Log validation errors for debugging
      result.errors.forEach(error => console.error('Validation error:', error));
    }
    
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.plan).toBe('waveops-v1');
      expect(result.data.waves).toHaveLength(2); // Now has Wave 1 and Wave 2
      expect(result.data.tasks).toHaveLength(8); // Now has 8 tasks total
    }
  });

  it('should validate teams.yaml', () => {
    const teamsYaml = fs.readFileSync(path.join(__dirname, '../.github/wave/teams.yaml'), 'utf8');
    const result = validateTeamsYaml(teamsYaml);
    
    if (!result.valid) {
      // Log validation errors for debugging
      result.errors.forEach(error => console.error('Validation error:', error));
    }
    
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.alpha.members).toEqual(['alice']);
      expect(result.data.beta.members).toEqual(['bob']);
    }
  });

  it('should reject invalid YAML with helpful errors', () => {
    const invalidYaml = `
plan: test
waves:
  - number: "not-a-number"
    teams: {}
tasks: []
`;
    
    const result = validateTasksYaml(invalidYaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('number');
    }
  });
});