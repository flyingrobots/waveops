/**
 * Schema validation utilities using AJV
 */

import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
// For CommonJS compatibility - __dirname is available in CommonJS modules
declare const __dirname: string;

const ajv = new Ajv({ allErrors: true, strict: false });

// Load schemas
const tasksSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/tasks.json'), 'utf8'));
const teamsSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/teams.json'), 'utf8'));
const configSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/config.json'), 'utf8'));

const validateTasks = ajv.compile(tasksSchema);
const validateTeams = ajv.compile(teamsSchema);
const validateConfig = ajv.compile(configSchema);

export interface ValidationError {
  valid: false;
  errors: string[];
}

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

interface TasksData {
  plan: string;
  tz: string;
  waves: Array<{
    number: number;
    teams: Record<string, Array<{
      id: string;
      issue: number;
      effort: number;
    }>>;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    wave: number;
    team: string;
    depends_on: string[];
    acceptance: string[];
    critical: boolean;
  }>;
}

export function validateTasksYaml(yamlContent: string): ValidationResult<TasksData> {
  try {
    const data = yaml.load(yamlContent);
    const valid = validateTasks(data);
    
    if (valid) {
      return { valid: true, data: data as TasksData };
    } else {
      return {
        valid: false,
        errors: validateTasks.errors?.map(err => `${err.instancePath}: ${err.message || 'Unknown error'}`) || ['Unknown validation error']
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

interface TeamsData {
  [teamName: string]: {
    members: string[];
  };
}

export function validateTeamsYaml(yamlContent: string): ValidationResult<TeamsData> {
  try {
    const data = yaml.load(yamlContent);
    const valid = validateTeams(data);
    
    if (valid) {
      return { valid: true, data: data as TeamsData };
    } else {
      return {
        valid: false,
        errors: validateTeams.errors?.map(err => `${err.instancePath}: ${err.message || 'Unknown error'}`) || ['Unknown validation error']
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

interface ConfigData {
  github: {
    token: string;
    owner: string;
    repo: string;
  };
  coordination: {
    issue_prefix: string;
    ready_environment: string;
  };
}

export function validateConfigYaml(yamlContent: string): ValidationResult<ConfigData> {
  try {
    const data = yaml.load(yamlContent);
    const valid = validateConfig(data);
    
    if (valid) {
      return { valid: true, data: data as ConfigData };
    } else {
      return {
        valid: false,
        errors: validateConfig.errors?.map(err => `${err.instancePath}: ${err.message || 'Unknown error'}`) || ['Unknown validation error']
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}