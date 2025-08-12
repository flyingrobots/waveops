# WaveOps Team Guide

**Your team's guide to shipping faster with wave-based coordination.**

## What is WaveOps?

WaveOps replaces continuous meetings with **discrete sync points** called "waves." Think of it like GPU programming - instead of threads constantly communicating, they synchronize at barriers and then execute independently.

### Key Benefits
- 🚫 **No more status meetings** - coordination happens asynchronously
- 🎯 **Clear completion criteria** - every task has explicit acceptance criteria  
- ⚡ **Faster shipping** - teams work in parallel, sync at boundaries
- 📊 **Automatic tracking** - GitHub provides the single source of truth

## How Waves Work

### Wave Lifecycle

```
1. PLANNING → 2. EXECUTION → 3. COORDINATION → 4. COMPLETION
   ↑                                                     ↓
   └─────────────────── NEXT WAVE ←─────────────────────┘
```

1. **Planning**: Define tasks, dependencies, and acceptance criteria
2. **Execution**: Teams work independently on their tasks
3. **Coordination**: Teams report readiness when tasks complete
4. **Completion**: Wave closes automatically when all teams ready

### Your Team's Responsibilities

#### During Planning
- **Review tasks assigned to your team**
- **Ask questions about acceptance criteria** 
- **Flag any concerns or blockers early**
- **Estimate effort and timeline**

#### During Execution
- **Create GitHub issues** for each assigned task
- **Work in PRs** that close task issues
- **Communicate blockers** in task issues or Slack
- **Keep task issues updated** with progress

#### During Coordination  
- **Report readiness** with `/ready wave-N` when ALL team tasks complete
- **Don't report ready** if any task is incomplete
- **Help unblock other teams** if they're waiting on you

## Daily Workflow

### Morning Check-in (2 minutes)
1. Check coordination issue for wave status
2. Review your team's task list
3. Check if any teammates need help

### During Development
1. **Create task issues** using the task template
2. **Work in feature branches** with descriptive names
3. **Link PRs to issues** using "Closes #123"
4. **Update progress** in issue comments

### When Tasks Complete
1. **Merge the PR** (don't just close it)
2. **Verify issue auto-closed** 
3. **Check all team tasks** are complete
4. **Report team ready** if everything is done

### Reporting Ready

When ALL your team's tasks are complete:

```
/ready wave-1
```

**⚠️ Important:** Only report ready when:
- ✅ All assigned tasks have merged PRs
- ✅ All acceptance criteria are met
- ✅ No blockers exist for other teams
- ✅ Team lead has approved completion

## Task Management

### Creating Task Issues

Use this template for consistency:

```markdown
**Task ID:** F001  
**Wave:** 1
**Team:** frontend

## Description
Implement the user authentication login form with proper validation and error handling.

## Acceptance Criteria
- [ ] Login form renders with email and password fields
- [ ] Form validates inputs client-side
- [ ] Error messages display for invalid inputs  
- [ ] Loading state shows during authentication
- [ ] Successful login redirects to dashboard

## Dependencies
- Blocked by: none
- Blocks: F002 (dashboard implementation)

## Definition of Done
- [ ] Code reviewed and approved
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Design review completed
```

### PR Best Practices

- **Link to task issue:** Use "Closes #123" in PR description
- **Clear title:** "F001: Implement user authentication UI"
- **Self-review first:** Review your own changes before requesting review
- **Test locally:** Ensure all tests pass locally
- **Update docs:** Include any necessary documentation changes

## Coordination Commands

Teams use these commands in coordination issue comments:

### `/ready wave-N`
Reports that your team has completed all assigned tasks for the specified wave.

```
/ready wave-1
```

### `/status`  
Get current wave status (what WaveOps sees):

```
/status
```

### `/block team reason`
Report that another team is blocking your progress:

```
/block backend "API endpoints not ready"
```

### `/unblock team`
Clear a previously reported block:

```
/unblock backend
```

## Communication Guidelines

### Use GitHub Issues For:
- ✅ Task-specific discussions
- ✅ Technical questions about implementation
- ✅ Blockers and dependencies
- ✅ Progress updates

### Use Slack For:
- ✅ Quick questions and clarifications
- ✅ Casual team coordination  
- ✅ Celebrating wins! 🎉
- ✅ Emergency blockers needing immediate attention

### DON'T Use:
- ❌ Email for coordination (GitHub is source of truth)
- ❌ Meetings for status updates (use GitHub issues)
- ❌ Side channels that others can't see

## Handling Blockers

### If You're Blocked:
1. **Comment on the task issue** explaining the blocker
2. **Tag the blocking team/person** with @mentions
3. **Use `/block` command** in coordination issue if severe
4. **Ping in Slack** if urgent
5. **Work on other tasks** while waiting

### If You're Blocking Others:
1. **Prioritize unblocking** over new work
2. **Communicate timeline** in the relevant issue
3. **Ask for help** if you can't resolve quickly
4. **Update regularly** on progress

## Quality Standards

### Before Reporting Ready:
- [ ] All PRs merged (not just closed)
- [ ] All tests passing in CI
- [ ] Code review completed
- [ ] Acceptance criteria verified
- [ ] No known blockers for other teams
- [ ] Team lead approval obtained

### Never Report Ready If:
- ❌ Any task PR is still open
- ❌ Tests are failing
- ❌ Acceptance criteria not met
- ❌ You're blocking other teams
- ❌ Technical debt was introduced without discussion

## Troubleshooting

### "WaveOps didn't recognize my `/ready` command"
- Check exact format: `/ready wave-1` (no extra text)
- Ensure you're commenting on the coordination issue
- Verify issue has the `coordination` label
- Check GitHub App has proper permissions

### "My task isn't showing as complete"
- Verify PR is merged (not closed)
- Check issue closed automatically when PR merged
- Ensure task ID in issue matches tasks.yaml exactly
- Look for typos in task references

### "Wave completed but I wasn't ready"
- Check if someone else reported ready for your team
- Verify all your tasks were actually complete
- Review the coordination issue timeline
- Contact your team lead to clarify

## Best Practices

### For Teams:
- **Communicate early and often** about blockers
- **Help other teams** when you have bandwidth
- **Be conservative** about reporting ready
- **Celebrate completions** to maintain team morale

### For Individuals:
- **Ask questions** if acceptance criteria are unclear
- **Update progress** regularly in issues
- **Test thoroughly** before marking tasks complete
- **Review teammates' work** proactively

## Getting Help

### First Steps:
1. Check this guide and other [documentation](../docs/)
2. Search existing [GitHub issues](https://github.com/flyingrobots/waveops/issues)
3. Ask in your team Slack channel

### Still Need Help:
- **Create an issue** in the WaveOps repository
- **Tag relevant team members** who might know
- **Join the discussion** in GitHub Discussions

---

🌊 **Welcome to wave-based development!** Your team will ship faster and stress less with clear sync points instead of constant meetings.