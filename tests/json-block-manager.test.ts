/**
 * Tests for JSON Block Management
 */

import { JsonBlockManager } from '../src/core/json-block-manager';

describe('JsonBlockManager', () => {
  const sampleIssueBody = `## Wave 1 Coordination

<!-- wave-state:DO-NOT-EDIT -->
\`\`\`json
{
  "plan": "test",
  "wave": 1,
  "all_ready": false
}
\`\`\`
<!-- /wave-state -->

Some other content here.`;

  it('should extract JSON from guarded block', () => {
    const json = JsonBlockManager.extractJson(sampleIssueBody);
    
    expect(json).toContain('"plan": "test"');
    expect(json).toContain('"wave": 1');
    expect(json).toContain('"all_ready": false');
  });

  it('should replace JSON in guarded block atomically', () => {
    const newJson = '{\n  "plan": "updated",\n  "wave": 2,\n  "all_ready": true\n}';
    
    const updatedBody = JsonBlockManager.replaceJson(sampleIssueBody, newJson);
    
    expect(updatedBody).toContain('"plan": "updated"');
    expect(updatedBody).toContain('"wave": 2');
    expect(updatedBody).toContain('Some other content here.');
    
    // Verify guards are preserved
    expect(updatedBody).toContain('<!-- wave-state:DO-NOT-EDIT -->');
    expect(updatedBody).toContain('<!-- /wave-state -->');
  });

  it('should validate guard blocks correctly', () => {
    expect(JsonBlockManager.validateGuards(sampleIssueBody)).toBe(true);
    
    // Missing end guard
    const missingEnd = sampleIssueBody.replace('<!-- /wave-state -->', '');
    expect(JsonBlockManager.validateGuards(missingEnd)).toBe(false);
    
    // Duplicate guards  
    const duplicate = sampleIssueBody + sampleIssueBody;
    expect(JsonBlockManager.validateGuards(duplicate)).toBe(false);
  });

  it('should handle missing guards gracefully', () => {
    const noGuards = 'Just some regular issue content';
    
    expect(JsonBlockManager.extractJson(noGuards)).toBe(null);
    expect(() => {
      JsonBlockManager.replaceJson(noGuards, '{}');
    }).toThrow('JSON guard blocks not found');
  });

  it('should preserve surrounding content during replacement', () => {
    const beforeContent = 'Content before guards\n\n';
    const afterContent = '\n\nContent after guards';
    const bodyWithContent = beforeContent + sampleIssueBody + afterContent;
    
    const newJson = '{"updated": true}';
    const result = JsonBlockManager.replaceJson(bodyWithContent, newJson);
    
    expect(result).toContain('Content before guards');
    expect(result).toContain('Content after guards');
    expect(result).toContain('"updated": true');
  });
});