/**
 * Pinned JSON Block Management - Safe extraction and update of JSON state in GitHub issues
 */

export class JsonBlockManager {
  private static readonly START_GUARD = '<!-- wave-state:DO-NOT-EDIT -->';
  private static readonly END_GUARD = '<!-- /wave-state -->';

  /**
   * Extract JSON from HTML-guarded block
   */
  static extractJson(issueBody: string): string | null {
    const startIndex = issueBody.indexOf(this.START_GUARD);
    const endIndex = issueBody.indexOf(this.END_GUARD);

    if (startIndex === -1 || endIndex === -1) {
      return null;
    }

    const jsonSection = issueBody.slice(startIndex + this.START_GUARD.length, endIndex);
    
    // Extract content between ```json and ```
    const jsonMatch = jsonSection.match(/```json\s*\n([\s\S]*?)\n```/);
    return jsonMatch ? jsonMatch[1].trim() : null;
  }

  /**
   * Replace JSON in HTML-guarded block atomically
   */
  static replaceJson(issueBody: string, newJson: string): string {
    const startIndex = issueBody.indexOf(this.START_GUARD);
    const endIndex = issueBody.indexOf(this.END_GUARD);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error('JSON guard blocks not found in issue body');
    }

    const beforeGuard = issueBody.slice(0, startIndex + this.START_GUARD.length);
    const afterGuard = issueBody.slice(endIndex);

    const newJsonBlock = `\n\`\`\`json\n${newJson}\n\`\`\`\n`;

    return beforeGuard + newJsonBlock + afterGuard;
  }

  /**
   * Validate that JSON block can be safely extracted and replaced
   */
  static validateGuards(issueBody: string): boolean {
    const startCount = (issueBody.match(/<!-- wave-state:DO-NOT-EDIT -->/g) || []).length;
    const endCount = (issueBody.match(/<!-- \/wave-state -->/g) || []).length;
    
    return startCount === 1 && endCount === 1;
  }
}