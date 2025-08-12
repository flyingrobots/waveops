# WaveOps Best Practices

**Proven patterns for successful wave-based coordination.**

## Wave Planning

### 🎯 Keep Waves Small and Focused

**✅ Good:**
```yaml
# Wave focused on authentication feature
teams:
  frontend: [F001: "Login UI", F002: "Logout button"]
  backend:  [B001: "Auth API", B002: "JWT handling"]
  qa:       [Q001: "Login E2E tests"]
```

**❌ Avoid:**
```yaml
# Wave trying to do too much
teams:  
  frontend: [F001-F010: "Complete redesign"]
  backend:  [B001-B015: "Entire API rewrite"]
  qa:       [Q001-Q020: "All testing"]
```

**Why:** Small waves complete faster, reduce coordination overhead, and provide more frequent value delivery.

### 🔗 Minimize Cross-Team Dependencies

**✅ Good:**
```yaml
# Teams can work independently
frontend:
  - id: "F001"
    title: "Login form UI"
    depends_on: []  # No external dependencies
    
backend:
  - id: "B001" 
    title: "Authentication API"
    depends_on: []  # No external dependencies
```

**❌ Avoid:**
```yaml
# Too many interdependencies
frontend:
  - id: "F001"
    depends_on: ["B001", "B002", "D001"]  # Waiting on 3 other teams
    
backend:
  - id: "B001"
    depends_on: ["F002", "D001"]  # Circular dependencies
```

**Why:** Dependencies create bottlenecks and reduce parallelism. Design waves so teams can work independently.

### ⏰ Set Realistic Timelines

**Wave Duration Guidelines:**
- **Small teams (2-3):** 1-2 weeks per wave
- **Medium teams (4-6):** 2-3 weeks per wave  
- **Large teams (7+):** 3-4 weeks per wave

**Configure timeouts:**
```yaml
wave_gates:
  timeout_hours: 168  # 1 week for small waves
  timeout_hours: 336  # 2 weeks for complex waves
```

## Task Design

### 📋 Write Clear Acceptance Criteria

**✅ Good:**
```yaml
- id: "F001"
  title: "Implement login form"
  acceptance:
    - "Form renders with email and password fields"
    - "Email validation prevents invalid formats"
    - "Password field masks input characters"
    - "Submit button is disabled until form is valid"
    - "Form shows loading state during submission"
    - "Error messages display for failed authentication"
    - "Successful login redirects to dashboard"
```

**❌ Avoid:**
```yaml  
- id: "F001"
  title: "Login stuff"
  acceptance:
    - "Make login work"
    - "Handle errors"
```

**Why:** Clear criteria eliminate ambiguity and enable accurate completion validation.

### 🚨 Mark Critical Tasks Appropriately

```yaml
# Critical tasks block wave completion
- id: "B001"
  title: "User authentication API"  
  critical: true  # Wave cannot complete without this

# Non-critical tasks can be moved to next wave if needed
- id: "B002"
  title: "Password strength indicator"
  critical: false  # Nice to have, but not blocking
```

**Rule:** Only mark tasks as critical if wave genuinely cannot complete without them.

### 🔄 Keep Tasks Atomic

**✅ Good:**
```yaml
- id: "F001"
  title: "Create login form component"
  
- id: "F002" 
  title: "Add form validation"
  
- id: "F003"
  title: "Integrate with authentication API"
```

**❌ Avoid:**
```yaml
- id: "F001"
  title: "Build entire authentication system"  # Too big!
```

**Why:** Atomic tasks are easier to estimate, implement, and test. They provide better progress visibility.

## Team Coordination

### 🗣️ Establish Clear Communication Channels

**GitHub Issues for:**
- ✅ Task-specific technical discussions
- ✅ Implementation questions
- ✅ Blocker reports and resolution
- ✅ Progress updates

**Slack/Chat for:**
- ✅ Quick questions and clarifications
- ✅ Urgent blocker notifications
- ✅ Team social coordination
- ✅ Celebrating completions! 🎉

**Don't Use:**
- ❌ Email for coordination (not transparent)
- ❌ Meetings for status updates (GitHub has the truth)
- ❌ Side channels others can't see

### 📢 Report Blockers Early

**As soon as you're blocked:**
```
/block backend "API endpoints not ready - need B001 and B002 completed"
```

**Update coordination issue:**
```markdown
## Current Blockers
- **Frontend** blocked by Backend (API endpoints)
  - Need: B001 (auth endpoints), B002 (user endpoints)  
  - Impact: Cannot start F003 (API integration)
  - ETA: Backend estimates Thursday completion
```

**Why:** Early blocker reporting allows teams to reprioritize and unblock each other.

### ✅ Conservative Readiness Reporting

**Only report ready when:**
- ✅ All assigned tasks are truly complete
- ✅ All acceptance criteria are satisfied  
- ✅ All PRs are merged (not just approved)
- ✅ No known issues that could block other teams
- ✅ Team lead has reviewed and approved

**Never report ready if:**
- ❌ Any task PRs are still open
- ❌ CI is failing on merged PRs
- ❌ You know other teams are waiting on fixes
- ❌ Technical debt was introduced without team discussion

## Quality Practices

### 🧪 Test Early and Often

**For each task:**
```markdown
## Definition of Done Checklist
- [ ] Implementation complete
- [ ] Unit tests written and passing
- [ ] Integration tests updated  
- [ ] Manual testing completed
- [ ] Acceptance criteria verified
- [ ] Code review approved
- [ ] Documentation updated
- [ ] No regressions introduced
```

### 🔒 Security-First Development

**Security considerations:**
- Validate all inputs in task implementations
- Review security implications during code review
- Run security scans before reporting ready
- Never commit secrets or sensitive data
- Use principle of least privilege for integrations

**For sensitive tasks:**
```yaml
- id: "B001"
  title: "User authentication API"
  acceptance:
    - "Passwords are hashed using bcrypt"
    - "JWT tokens have appropriate expiration"
    - "Rate limiting prevents brute force attacks"
    - "Input validation prevents injection attacks"
    - "Security scan passes with no high/critical issues"
  critical: true
```

### 📊 Monitor Performance

**Track key metrics:**
- **Cycle time:** Task creation → completion
- **Lead time:** Idea → production
- **Wave duration:** Planning → completion
- **Blocker frequency:** How often teams get blocked
- **Rework rate:** Tasks that need to be redone

**Set up alerts:**
```yaml
alerts:
  - name: "wave_timeout"
    condition: "wave_duration > 72h"
    notification: "slack"
  - name: "team_blocked_too_long"
    condition: "team_blocked_duration > 24h"
    notification: "email"
```

## Configuration Patterns

### 🏗️ Repository Structure

**Recommended structure:**
```
your-repo/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── coordination.yml
│   │   └── task.yml
│   ├── workflows/
│   │   └── waveops.yml
│   └── waveops/
│       ├── config.yaml
│       └── tasks.yaml
├── docs/
│   └── team-onboarding.md
└── src/
    └── your-code/
```

### ⚙️ Configuration Management

**Environment-specific configs:**
```yaml
# .github/waveops/config.yaml
development:
  wave_gates:
    timeout_hours: 48
    require_all_teams: false  # More flexible for dev
    
production:
  wave_gates:
    timeout_hours: 168
    require_all_teams: true   # Strict for production
    quality_gates:
      - security_scan_clean: true
      - performance_tests_pass: true
```

### 🎛️ Team-Specific Settings

```yaml
teams:
  frontend:
    leads: ["sarah-frontend", "mike-ui"]
    required_reviewers: 1
    auto_assign_reviews: true
    slack_channel: "#frontend-team"
    
  backend:  
    leads: ["alex-backend", "jenny-api"]
    required_reviewers: 2  # Backend needs more review
    auto_assign_reviews: true
    slack_channel: "#backend-team"
    
  qa:
    leads: ["david-qa"]
    required_reviewers: 1
    auto_assign_reviews: false  # Manual assignment
    slack_channel: "#qa-team"
```

## Scaling Patterns

### 🚀 Growing Teams

**Small → Medium (3-6 teams):**
- Add dependency tracking between teams
- Implement cross-team code review requirements
- Set up automated notifications
- Create team-specific documentation

**Medium → Large (6+ teams):**
- Use wave hierarchies (sub-waves)
- Implement advanced metrics and dashboards
- Add automated capacity planning
- Create escalation procedures for blockers

**Large → Enterprise:**
- Multi-repository wave coordination
- Advanced security and compliance features
- Custom integrations with enterprise tools
- Professional support and training

### 🔄 Multi-Wave Planning

**Wave sequence planning:**
```yaml
# Wave 1: Foundation
wave: 1
focus: "Core authentication system"
duration_estimate: "2 weeks"

# Wave 2: Features  
wave: 2
depends_on: [1]
focus: "User profile and settings"
duration_estimate: "2 weeks"

# Wave 3: Polish
wave: 3
depends_on: [1, 2]
focus: "UI polish and performance"
duration_estimate: "1 week"
```

## Common Antipatterns

### 🚫 What NOT to Do

**❌ Using WaveOps for everything:**
- Don't create waves for single-person tasks
- Don't use waves for exploratory work
- Don't coordinate individual bug fixes via waves

**❌ Micromanaging through waves:**
- Don't create tasks for every small code change
- Don't require wave coordination for routine maintenance
- Don't use waves to track individual developer productivity

**❌ Ignoring team autonomy:**
- Don't mandate specific implementation approaches in tasks
- Don't require approval for internal team decisions
- Don't use waves to circumvent established team processes

**❌ Poor wave boundaries:**
- Don't mix unrelated features in same wave
- Don't create dependencies between unrelated systems
- Don't ignore natural system boundaries

## Migration Patterns

### 🔄 Adopting WaveOps Gradually

**Phase 1: Single Team Pilot**
```yaml
# Start with one team to learn the patterns
teams:
  frontend: 
    - Simple tasks with clear acceptance criteria
    - Short wave duration (1 week)
    - Frequent team retrospectives
```

**Phase 2: Multi-Team Coordination**
```yaml
# Add a second team with minimal dependencies
teams:
  frontend: [F001: "UI Components"]
  backend:  [B001: "API Endpoints"]
  # Keep teams independent initially
```

**Phase 3: Full Organization**
```yaml
# Scale to all teams with advanced features
teams:
  frontend: [...]
  backend: [...]
  qa: [...] 
  devops: [...]
  design: [...]
# Add dependencies, automation, metrics
```

### 📈 Success Metrics

**Track improvement over time:**

**Before WaveOps:**
- Meeting hours per week per person
- Time to ship features
- Coordination overhead (emails, messages, meetings)
- Team satisfaction with coordination

**After WaveOps:**
- Wave completion time
- Team readiness accuracy (how often teams correctly report ready)
- Blocker resolution time
- Feature delivery frequency

**Target improvements:**
- 50-80% reduction in coordination meetings
- 2-3x faster feature delivery
- 90%+ team satisfaction with coordination process
- <24 hour blocker resolution time

---

## Getting Started with Best Practices

1. **Start Small:** Begin with a single team and simple waves
2. **Learn Iteratively:** Run retrospectives after each wave
3. **Document Learnings:** Capture what works for your team
4. **Scale Gradually:** Add complexity only after fundamentals work
5. **Measure Success:** Track metrics that matter to your organization

**Want to contribute your own best practices?** [Edit this guide](https://github.com/flyingrobots/waveops/edit/main/docs/BEST_PRACTICES.md) or [start a discussion](https://github.com/flyingrobots/waveops/discussions)!