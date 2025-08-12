# WaveOps Command Reference

**Complete reference for all WaveOps commands and interactions.**

## Coordination Commands

All coordination commands are posted as comments on **coordination issues** (issues with the `coordination` label).

### `/ready wave-N`

Reports that your team has completed all assigned tasks for the specified wave.

**Syntax:**
```
/ready wave-1
/ready wave-2
/ready wave-10
```

**Requirements:**
- All team tasks must be complete (merged PRs)
- All acceptance criteria must be satisfied
- No blocking issues for other teams
- Team lead authorization (if configured)

**Examples:**
```
/ready wave-1
```

**What happens:**
1. WaveOps validates all team tasks are complete
2. Creates deployment gate for team readiness
3. Updates wave status in coordination issue
4. If all teams ready, completes the wave automatically

---

### `/status`

Gets current wave status and team readiness information.

**Syntax:**
```
/status
/status wave-2
```

**Example Response:**
```
🌊 **Wave 1 Status**

**Teams:** 2/3 ready
✅ **frontend** - Ready (3/3 tasks complete)
✅ **backend** - Ready (2/2 tasks complete)  
⏳ **qa** - In Progress (1/3 tasks complete)

**Remaining Tasks:**
- Q002: Security testing for authentication
- Q003: Performance testing for auth endpoints

**Next Steps:**
QA team needs to complete remaining tasks and report /ready wave-1
```

---

### `/block team reason`

Reports that another team is blocking your progress.

**Syntax:**
```
/block [team] [reason]
```

**Examples:**
```
/block backend "API endpoints not ready for frontend integration"
/block qa "Test environment is down"
/block devops "Deployment pipeline is broken"
```

**What happens:**
1. Creates blocking relationship in wave tracking
2. Notifies the blocked team via configured channels
3. Updates wave status to show blocking issues
4. Triggers escalation if block persists beyond threshold

---

### `/unblock team`

Clears a previously reported blocking issue.

**Syntax:**
```
/unblock [team]
```

**Examples:**
```
/unblock backend
/unblock qa
```

---

### `/help`

Shows available commands and basic usage.

**Response:**
```
🌊 **WaveOps Commands**

**Coordination Commands:**
• `/ready wave-N` - Report team readiness for wave N
• `/status` - Get current wave status
• `/block team reason` - Report blocking issue
• `/unblock team` - Clear blocking issue
• `/help` - Show this help

**Usage:** Comment these commands on coordination issues.
**Docs:** https://github.com/flyingrobots/waveops/blob/main/docs/
```

---

## Task Commands

Commands used in **task issues** (individual task tracking).

### `/assign @username`

Assigns a task to a specific team member.

**Examples:**
```
/assign @sarah-frontend
/assign @alex-backend @jenny-api
```

---

### `/estimate 3d`

Adds effort estimate to a task.

**Examples:**
```
/estimate 2h
/estimate 1d  
/estimate 3d
/estimate 1w
```

---

### `/depends #123`

Creates dependency relationship between tasks.

**Examples:**
```
/depends #156
/depends #156 #157
```

---

### `/progress 50%`

Updates task progress percentage.

**Examples:**  
```
/progress 25%
/progress 75%
/progress 100%
```

---

## Administrative Commands

Commands for repository administrators and team leads.

### `/wave-admin complete wave-N`

**⚠️ Admin only** - Force completes a wave bypassing validation.

**Examples:**
```
/wave-admin complete wave-1
/wave-admin complete wave-2 --force
```

---

### `/wave-admin reset wave-N`

**⚠️ Admin only** - Resets wave state to start over.

**Examples:**
```
/wave-admin reset wave-1
/wave-admin reset wave-2 --keep-tasks
```

---

### `/wave-admin config`

**⚠️ Admin only** - Shows current WaveOps configuration.

**Response:**
```yaml
plan: awesome-feature
wave: 2
teams: [frontend, backend, qa]
require_all_teams: true
timeout_hours: 48
```

---

## GitHub Actions Integration

WaveOps runs via GitHub Actions. You can trigger actions manually.

### Manual Workflow Dispatch

Trigger wave validation manually:

```bash
gh workflow run waveops.yml
```

With parameters:
```bash  
gh workflow run waveops.yml -f wave=1 -f event=manual
```

---

## CLI Tools

WaveOps provides CLI tools for advanced usage.

### Wave Status CLI

Check wave status from command line:

```bash
npx waveops status
npx waveops status --wave=2
npx waveops status --verbose
```

### Wave Coordination CLI

Process events manually:

```bash
npx waveops coordinate --event=issue --issue=123
npx waveops coordinate --event=pr --pr=456  
npx waveops coordinate --event=push --ref=main
```

---

## API Integration

For custom integrations, WaveOps exposes these endpoints.

### GET /api/waves/status

Get current wave status:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/owner/repo/dispatches" \
  -d '{"event_type":"waveops-status","client_payload":{"wave":1}}'
```

### POST /api/waves/ready

Report team readiness:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/owner/repo/dispatches" \
  -d '{"event_type":"waveops-ready","client_payload":{"wave":1,"team":"frontend"}}'
```

---

## Command Permissions

### Who Can Use Commands

**Coordination Commands (`/ready`, `/status`, `/block`):**
- Repository collaborators
- Team members (if teams configured)
- Anyone with Issues: Write permission

**Task Commands (`/assign`, `/estimate`):**
- Task assignees  
- Repository collaborators
- Team leads (if configured)

**Admin Commands (`/wave-admin`):**
- Repository administrators
- Configured WaveOps admins only

### Permission Configuration

In your `config.yaml`:

```yaml
permissions:
  coordination_commands:
    - role: "collaborator" 
    - team: "frontend"
    - team: "backend"
    
  admin_commands:
    - role: "admin"
    - user: "team-lead"
    - user: "project-manager"

  task_commands:
    - role: "collaborator"
    - assignee: true  # Task assignees can always use task commands
```

---

## Command Validation

### Format Requirements

**Strict format required:**
```
✅ /ready wave-1
❌ /ready wave 1
❌ Ready for wave 1  
❌ /ready wave-1 please
```

**Case sensitive:**
```
✅ /ready wave-1
❌ /READY wave-1
❌ /Ready wave-1
```

**Must be start of comment:**
```
✅ /ready wave-1

❌ I think we're /ready wave-1
❌ All done! /ready wave-1
```

### Error Responses

**Invalid format:**
```
❌ Invalid command format. Use: /ready wave-N
```

**Insufficient permissions:**
```
❌ You don't have permission to report readiness for this team.
```

**Team not ready:**
```  
❌ Team 'frontend' cannot report ready:
- Task F001 is still open (#123)
- Task F002 has failing checks (#124)
```

**Wave already complete:**
```
❌ Wave 1 is already complete. Use /status to see current wave.
```

---

## Integration Examples

### Slack Bot Integration

Forward WaveOps commands from Slack:

```javascript
// Slack bot that forwards /ready commands to GitHub
app.command('/ready', async ({ command, ack, respond }) => {
  await ack();
  
  // Post to GitHub issue
  await github.issues.createComment({
    owner: 'your-org',
    repo: 'your-repo', 
    issue_number: coordinationIssue,
    body: `/ready ${command.text}`
  });
  
  await respond(`Posted: /ready ${command.text}`);
});
```

### Jira Integration

Sync WaveOps status with Jira:

```javascript
// Update Jira when wave completes
webhook.on('waveops.wave.completed', async (payload) => {
  await jira.updateIssue(payload.wave.jira_epic, {
    fields: {
      status: 'Done',
      resolution: 'Fixed'
    }
  });
});
```

---

## Troubleshooting Commands

### Debug Commands

**Check command history:**
```bash
gh api "/repos/owner/repo/issues/123/comments" | \
  jq '.[] | select(.body | startswith("/")) | {user: .user.login, body: .body}'
```

**Validate team readiness:**
```bash
npx waveops validate --team=frontend --wave=1
```

**Show command permissions:**
```bash  
npx waveops permissions --user=@sarah-frontend
```

### Common Command Issues

**Command not recognized:**
- Check exact format and spelling
- Ensure commenting on coordination issue
- Verify issue has `coordination` label

**Permission denied:**
- Check if user has repository access
- Verify team membership configuration  
- Confirm user has Issues: Write permission

**Team validation fails:**
- Run `npx waveops validate --team=frontend`
- Check task completion status
- Verify all PRs are merged (not closed)

---

For more help, see the [Troubleshooting Guide](./TROUBLESHOOTING.md) or create an issue in the WaveOps repository.