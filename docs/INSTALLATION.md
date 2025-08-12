# WaveOps Installation Guide

**Transform your team's workflow from continuous meetings to discrete sync points.**

## Quick Start

### Prerequisites

- GitHub repository with administrative access
- Node.js 18+ for local development (optional)
- GitHub App installation permissions

### 1. GitHub App Installation

#### Option A: Use Our Hosted App (Recommended)

1. Visit the [WaveOps GitHub App](https://github.com/apps/waveops) (placeholder - will be published)
2. Click "Install" on your organization or repository
3. Grant the required permissions:
   - **Issues**: Read & Write (for task coordination)
   - **Pull Requests**: Read & Write (for implementation tracking)
   - **Deployments**: Write (for readiness gates)
   - **Checks**: Write (for wave completion status)
   - **Repository contents**: Read (for configuration files)

#### Option B: Self-Host the GitHub App

```bash
# Clone the repository
git clone https://github.com/flyingrobots/waveops.git
cd waveops

# Install dependencies
npm install

# Build the project
npm run build

# Set up environment variables
cp .env.example .env
# Edit .env with your GitHub App credentials

# Start the service
npm start
```

**Environment Variables for Self-Hosting:**
```bash
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your-webhook-secret
PORT=3000
```

### 2. Repository Setup

Create the following configuration files in your repository:

#### `.github/waveops/tasks.yaml` - Task Definitions
```yaml
plan: "our-awesome-feature"
wave: 1
tz: "America/New_York"
teams:
  frontend:
    - id: "F001"
      title: "Implement user authentication UI"
      depends_on: []
      acceptance:
        - "Login form renders correctly"
        - "Error states display properly"
      critical: true
  
  backend:
    - id: "B001" 
      title: "Create user authentication API"
      depends_on: []
      acceptance:
        - "JWT tokens are generated"
        - "Password hashing works"
      critical: true

  qa:
    - id: "Q001"
      title: "End-to-end authentication testing"
      depends_on: ["F001", "B001"]
      acceptance:
        - "Login flow works end-to-end"
        - "Security tests pass"
      critical: false
```

#### `.github/waveops/config.yaml` - WaveOps Configuration
```yaml
# WaveOps Configuration
coordination:
  label: "coordination"  # Label for coordination issues
  auto_close: true       # Auto-close completed waves
  
notifications:
  slack_webhook: "https://hooks.slack.com/services/..." # Optional
  teams:
    - frontend
    - backend 
    - qa

wave_gates:
  require_all_teams: true    # All teams must be ready
  allow_manual_override: false  # Prevent manual wave completion
  timeout_hours: 24         # Auto-fail after timeout
```

### 3. Create Your First Wave

#### Step 1: Create a Coordination Issue

Use our GitHub issue template (created automatically) or manually create an issue:

```markdown
Title: Wave 1 · awesome-feature · Coordination

## Wave Status

**Plan:** awesome-feature  
**Wave:** 1  
**Teams:** frontend, backend, qa

### Team Status
- [ ] **frontend** - In Progress
- [ ] **backend** - In Progress  
- [ ] **qa** - Blocked (waiting on F001, B001)

### Tasks
**Frontend Team:**
- [ ] F001: Implement user authentication UI

**Backend Team:** 
- [ ] B001: Create user authentication API

**QA Team:**
- [ ] Q001: End-to-end authentication testing (blocked)

---
*This is a coordination issue. Teams report readiness by commenting `/ready` when their tasks are complete.*
```

#### Step 2: Teams Work on Tasks

1. **Create Task Issues:** Each task gets its own GitHub issue
2. **Implement in PRs:** Link PRs to task issues using "Closes #123"
3. **Merge When Ready:** Merge PRs when implementation is complete

#### Step 3: Report Team Readiness

When a team completes all their wave tasks:

```
/ready wave-1
```

Comment this on the coordination issue. WaveOps will:
- Validate all team tasks are complete
- Create deployment gates
- Check for wave completion

#### Step 4: Wave Completion

When all teams report ready, WaveOps automatically:
- ✅ Creates GitHub Check Run with "success" status
- ✅ Posts wave completion announcement
- ✅ Closes the coordination issue
- ✅ Triggers any configured notifications

## Troubleshooting

### Common Issues

**WaveOps not responding to `/ready` commands:**
- Check GitHub App has Issues: Write permission
- Verify coordination issue has `coordination` label
- Ensure comment format is exactly `/ready wave-N`

**Tasks not validating correctly:**  
- Ensure task issues reference the correct task IDs
- Check that PRs are merged (not just closed)
- Verify task IDs match exactly in tasks.yaml

**Wave never completes:**
- Check all teams have reported `/ready`
- Verify no tasks are still open
- Look at deployment gate status in repository

### Getting Help

- **Documentation:** Check [docs/](../docs/) directory
- **Examples:** See [examples/](../examples/) directory  
- **Issues:** Report bugs at [GitHub Issues](https://github.com/flyingrobots/waveops/issues)
- **Community:** Join our [Discussions](https://github.com/flyingrobots/waveops/discussions)

## Next Steps

1. **Team Onboarding:** Share the [Team Guide](./TEAM_GUIDE.md) with your teams
2. **Advanced Configuration:** Learn about [advanced features](./ADVANCED.md)
3. **Best Practices:** Read our [best practices guide](./BEST_PRACTICES.md)
4. **Examples:** Explore [real-world examples](../examples/)

---

🌊 **Ready to ride the wave?** Your team will ship faster with discrete sync points instead of continuous meetings.