# WaveOps Troubleshooting Guide

**Quick solutions for common WaveOps issues.**

## Quick Diagnostics

### Check Wave Status
```bash
# Get current wave status
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/OWNER/REPO/issues?labels=coordination&state=open"
```

### Verify GitHub App Permissions
1. Go to your repository settings
2. Click "Integrations" → "GitHub Apps"
3. Find WaveOps app and click "Configure"
4. Verify these permissions are granted:
   - Issues: **Read & Write**
   - Pull Requests: **Read & Write** 
   - Deployments: **Write**
   - Checks: **Write**
   - Contents: **Read**

## Common Issues

### 🚫 "/ready" Command Not Working

#### Symptoms
- Teams comment `/ready wave-1` but nothing happens
- No response from WaveOps bot
- Wave status doesn't update

#### Diagnosis
1. **Check comment format:**
   ```
   ✅ Correct: /ready wave-1
   ❌ Wrong: /ready wave 1
   ❌ Wrong: Ready for wave 1
   ❌ Wrong: /ready wave-1 - all tasks complete
   ```

2. **Verify issue has coordination label:**
   - Look for `coordination` label on the issue
   - Issue title should match: "Wave N · plan-name · Coordination"

3. **Check GitHub App permissions:**
   - App needs Issues: Write permission
   - App needs to be installed on the repository

4. **Verify team tasks are actually complete:**
   ```bash
   # Check if all team tasks have merged PRs
   gh issue list --label "task,team:frontend" --state closed
   ```

#### Solutions
- Use exact format: `/ready wave-N`
- Add `coordination` label to issue if missing
- Reinstall GitHub App with proper permissions
- Ensure all task PRs are merged (not just closed)

---

### ⏳ Wave Never Completes

#### Symptoms  
- All teams report ready but wave stays open
- Check run shows "in_progress" status indefinitely
- Coordination issue never closes

#### Diagnosis
1. **Check task validation:**
   ```bash
   # Look for validation errors in Actions logs
   gh run list --workflow="WaveOps Coordinator"
   gh run view [RUN_ID]
   ```

2. **Verify all tasks have issues:**
   - Each task in `tasks.yaml` needs a corresponding GitHub issue
   - Issue must be closed by merged PR
   - Task ID in issue title must match exactly

3. **Check for blocking dependencies:**
   - Look for tasks marked as `critical: true` that aren't complete
   - Verify cross-team dependencies are satisfied

4. **Review deployment gates:**
   - Check GitHub deployments tab for stuck deployments
   - Look for failing status checks

#### Solutions
- Create missing task issues
- Merge outstanding PRs
- Fix failing CI/tests that block deployment gates
- Check Actions logs for specific validation failures

---

### 🔄 Tasks Show as Incomplete

#### Symptoms
- PR is merged but task still shows incomplete
- WaveOps doesn't recognize task completion
- Task issue doesn't auto-close

#### Diagnosis
1. **Check PR-to-issue linking:**
   - PR description must include "Closes #123" or "Fixes #123"
   - Issue number must match exactly
   - PR must be merged (not closed without merging)

2. **Verify task ID matching:**
   ```bash
   # Check task ID in issue title matches tasks.yaml
   grep "F001" wave/tasks.yaml
   gh issue view 123 --json title
   ```

3. **Check issue labels:**
   - Issue should have `task` label
   - Team label like `team:frontend` helps organization

#### Solutions
- Edit merged PR to add "Closes #123" in description
- Manually close task issue if PR was merged
- Verify task IDs match exactly between issue and tasks.yaml
- Re-run wave validation from GitHub Actions

---

### 🚨 GitHub App Not Responding

#### Symptoms
- No response to commands or webhooks
- Actions workflow not triggering
- Missing check runs or deployment updates

#### Diagnosis
1. **Check webhook delivery:**
   - Go to repository Settings → Webhooks
   - Look for failed deliveries or error responses
   - Check recent webhook deliveries for 200 responses

2. **Verify Actions workflow:**
   ```bash
   # Check if workflow file exists and is valid
   cat .github/workflows/waveops.yml
   gh workflow list
   ```

3. **Check rate limiting:**
   ```bash
   # Check current rate limit status
   curl -H "Authorization: Bearer $GITHUB_TOKEN" \
     "https://api.github.com/rate_limit"
   ```

#### Solutions
- Reinstall GitHub App if webhooks are failing
- Check and fix workflow YAML syntax errors
- Wait if rate limited, or upgrade GitHub plan
- Verify all required secrets are set in repository

---

### ⚠️ Team Can't Report Ready

#### Symptoms
- Team believes tasks are complete but can't report ready
- Validation fails when team tries to report ready
- WaveOps shows team as "not ready"

#### Diagnosis
1. **Check team task completion:**
   ```bash
   # List all tasks for a team
   gh issue list --label "task,team:frontend" --json number,title,state
   ```

2. **Verify acceptance criteria:**
   - Are all acceptance criteria checkboxes checked?
   - Are there any failing status checks on merged PRs?

3. **Look for blocking tasks:**
   - Check if any `critical: true` tasks are incomplete
   - Verify dependencies listed in `depends_on` are satisfied

#### Solutions
- Complete all remaining tasks before reporting ready
- Check off all acceptance criteria in task issues
- Fix any failing CI/tests on merged PRs
- Resolve blocking dependencies from other teams

---

## Performance Issues

### 🐌 Slow Wave Completion

#### Symptoms
- Wave takes much longer than expected to complete
- GitHub Actions runs take minutes to finish
- API responses are slow

#### Diagnosis
- Check GitHub Actions execution time in workflow runs
- Look for API rate limiting in logs
- Verify deployment validation isn't timing out

#### Solutions
- Optimize tasks.yaml (fewer teams/tasks per wave)
- Use GitHub Actions caching for faster runs
- Consider upgrading GitHub plan for higher rate limits
- Split large waves into smaller, parallel waves

---

### 📊 High Resource Usage

#### Symptoms
- GitHub Actions runners use excessive compute time
- API rate limits hit frequently
- Webhook deliveries timing out

#### Solutions
- Reduce frequency of status checks
- Implement caching for repeated API calls  
- Use webhook filtering to reduce noise
- Optimize task validation logic

---

## Configuration Issues

### ❌ Invalid tasks.yaml

#### Common Errors
```yaml
# ❌ Missing required fields
teams:
  frontend:
    - title: "Some task"  # Missing 'id' field

# ❌ Invalid task references
- id: "F001"
  depends_on: ["F999"]  # F999 doesn't exist

# ❌ Circular dependencies  
- id: "F001"
  depends_on: ["F002"]
- id: "F002"
  depends_on: ["F001"]  # Creates cycle
```

#### Solutions
- Validate YAML syntax using online validator
- Ensure all task IDs are unique
- Verify all dependencies exist
- Check for circular dependency chains

---

### 🔧 GitHub App Configuration

#### Check App Installation
```bash
# Verify app is installed
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/OWNER/REPO/installation"
```

#### Required Permissions Checklist
- [x] Issues: Read & Write
- [x] Pull Requests: Read & Write
- [x] Deployments: Write  
- [x] Checks: Write
- [x] Contents: Read
- [x] Metadata: Read

---

## Emergency Procedures

### 🆘 Force Wave Completion

**⚠️ Use only in emergencies - bypasses all validation**

```bash
# Manually complete a stuck wave
gh api -X POST "/repos/OWNER/REPO/check-runs" \
  -F name="WaveOps: Wave 1 Complete" \
  -F head_sha="$(git rev-parse HEAD)" \
  -F status="completed" \
  -F conclusion="success"
```

### 🔄 Reset Wave State

```bash  
# Clear all wave state and start over
gh api -X PATCH "/repos/OWNER/REPO/issues/123" \
  -F state="closed"
  
# Create new coordination issue with correct state
```

### 🚨 Disable WaveOps Temporarily

1. Go to repository Settings → GitHub Apps
2. Suspend the WaveOps app installation
3. This stops all webhook processing immediately
4. Re-enable when issues are resolved

---

## Getting Help

### Self-Service Resources
1. **Check [Documentation](../docs/)** for detailed guides
2. **Search [GitHub Issues](https://github.com/flyingrobots/waveops/issues)** for similar problems  
3. **Review [Examples](../examples/)** for configuration patterns

### Community Support
- **GitHub Discussions:** Ask questions and share solutions
- **Issue Tracker:** Report bugs and request features
- **Documentation:** Contribute improvements and clarifications

### Enterprise Support
For organizations using WaveOps at scale:
- Priority support channels
- Custom configuration assistance  
- Performance optimization consulting
- Training and onboarding sessions

---

## Debug Commands

### Useful GitHub CLI Commands
```bash
# Check current wave coordination issues
gh issue list --label coordination --state open

# View recent workflow runs  
gh run list --workflow "WaveOps Coordinator" --limit 10

# Get detailed run logs
gh run view [RUN_ID] --log

# List deployments and their status
gh api "/repos/OWNER/REPO/deployments" | jq '.[] | {id, environment, description}'

# Check rate limit status
gh api rate_limit

# View check runs for current commit
gh api "/repos/OWNER/REPO/commits/$(git rev-parse HEAD)/check-runs"
```

### Useful Curl Commands
```bash
# Get wave validation status
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/OWNER/REPO/actions/workflows/waveops.yml/runs"

# Check webhook deliveries
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/OWNER/REPO/hooks"

# Manually trigger workflow
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/OWNER/REPO/actions/workflows/waveops.yml/dispatches" \
  -d '{"ref":"main"}'
```

---

**Still stuck?** Create an issue with:
- Your `tasks.yaml` and `config.yaml` files
- Recent workflow run logs
- Specific error messages
- Steps to reproduce the problem