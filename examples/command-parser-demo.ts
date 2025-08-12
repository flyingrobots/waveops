/**
 * Command Parser Demo - Shows how to use the WaveOps natural language command parser
 */

import { CommandParser, CommandDispatcher, CommandType, CommandContext } from '../src/coordination';

async function demonstrateCommandParser() {
  console.log('🤖 WaveOps Command Parser Demo\n');
  
  // Create parser instance
  const parser = new CommandParser({
    enableFuzzyMatching: true,
    confidenceThreshold: 0.7,
    maxAlternatives: 2
  });

  // Create dispatcher for command execution
  const dispatcher = new CommandDispatcher(parser);

  // Setup context
  const context: CommandContext = {
    issueNumber: 123,
    repository: 'company/product',
    currentWave: 3,
    availableTeams: ['team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design'],
    availableTasks: ['W3.T001', 'W3.T002', 'W3.T003', 'W3.T004', 'W3.T005'],
    teamMemberships: {
      'alice': 'team-frontend',
      'bob': 'team-backend',
      'charlie': 'team-devops',
      'diana': 'team-qa'
    }
  };

  // Demo commands
  const demoCommands = [
    'start wave alpha with teams frontend, backend',
    'assign team frontend to tasks W3.T001, W3.T002 with high priority',
    'block team devops on team backend completion',
    'sync teams frontend, backend on code review completion',
    'auto-balance load across teams frontend, backend, devops',
    'reassign task W3.T003 to team qa with critical priority',
    'assign teams frontend, backend to tasks W3.T001, W3.T002; sync teams frontend, backend on deployment'
  ];

  console.log('🎯 Parsing Natural Language Commands:\n');

  for (let i = 0; i < demoCommands.length; i++) {
    const command = demoCommands[i];
    console.log(`${i + 1}. Input: "${command}"`);
    
    try {
      const result = await parser.parse(command, context);
      
      if (result.commands.length > 0) {
        console.log(`   ✅ Parsed as: ${result.commands[0].type}`);
        console.log(`   📊 Confidence: ${(result.commands[0].confidence * 100).toFixed(1)}%`);
        console.log(`   ⏱️  Parse time: ${result.metadata.parseTime}ms`);
        
        if (result.commands[0].type === CommandType.BATCH_OPERATION) {
          const batchParams = result.commands[0].parameters as { commands: any[] };
          console.log(`   📦 Batch operation with ${batchParams.commands.length} commands`);
        }
      } else {
        console.log(`   ❌ Failed to parse`);
        console.log(`   🚨 Errors: ${result.errors.join(', ')}`);
      }
      
      if (result.warnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`);
      }
      
    } catch (error) {
      console.log(`   💥 Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('');
  }

  // Demonstrate validation
  console.log('🔍 Command Validation Demo:\n');
  
  const testValidation = async (input: string, description: string) => {
    console.log(`Testing: ${description}`);
    console.log(`Command: "${input}"`);
    
    const result = await parser.parse(input, context);
    if (result.commands.length > 0) {
      const validation = await parser.validate(result.commands[0], context);
      console.log(`Valid: ${validation.valid ? '✅' : '❌'}`);
      if (validation.errors.length > 0) {
        console.log(`Errors: ${validation.errors.join(', ')}`);
      }
      if (validation.suggestions.length > 0) {
        console.log(`Suggestions: ${validation.suggestions.join(', ')}`);
      }
    }
    console.log('');
  };

  await testValidation('assign team nonexistent to task W3.T001', 'Invalid team name');
  await testValidation('block team frontend on team frontend completion', 'Circular dependency');
  await testValidation('balance team frontend', 'Insufficient teams for load balancing');

  console.log('🎉 Demo completed! The command parser successfully handles:');
  console.log('  • Natural language coordination commands');
  console.log('  • Multiple command types (wave start, assignments, blocking, sync, etc.)');
  console.log('  • Batch operations with multiple commands');
  console.log('  • Command validation with helpful error messages');
  console.log('  • Integration with GitHub webhook events');
  console.log('  • Extensible vocabulary and fuzzy matching');
}

// Run demo if this file is executed directly
if (require.main === module) {
  demonstrateCommandParser().catch(console.error);
}