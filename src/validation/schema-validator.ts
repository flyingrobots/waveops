/**
 * Schema validation utilities using AJV
 */

import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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

export function validateTasksYaml(yamlContent: string): ValidationResult<any> {
  try {
    const data = yaml.load(yamlContent);
    const valid = validateTasks(data);
    
    if (valid) {
      return { valid: true, data };
    } else {
      return {
        valid: false,
        errors: validateTasks.errors?.map(err => `${err.instancePath}: ${err.message}`) || ['Unknown validation error']
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

export function validateTeamsYaml(yamlContent: string): ValidationResult<any> {
  try {
    const data = yaml.load(yamlContent);
    const valid = validateTeams(data);
    
    if (valid) {
      return { valid: true, data };
    } else {
      return {
        valid: false,
        errors: validateTeams.errors?.map(err => `${err.instancePath}: ${err.message}`) || ['Unknown validation error']
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

export function validateConfigYaml(yamlContent: string): ValidationResult<any> {
  try {
    const data = yaml.load(yamlContent);
    const valid = validateConfig(data);
    
    if (valid) {
      return { valid: true, data };
    } else {
      return {
        valid: false,
        errors: validateConfig.errors?.map(err => `${err.instancePath}: ${err.message}`) || ['Unknown validation error']
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}