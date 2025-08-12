# GitHub API Extensions - Critical Infrastructure

This module contains the **FOUNDATION INFRASTRUCTURE** for WaveOps coordination features. These 4 critical methods unlock 20+ stub implementations across the codebase.

## 🎯 Critical Methods Implemented

### 1. `getTeamMembers(teamName: string): Promise<TeamMember[]>`
**Purpose**: Get real team membership from GitHub Teams API

**Features**:
- ✅ Complete pagination support for large teams
- ✅ Role and permission mapping (Member, Maintainer, Admin)  
- ✅ Graceful error handling for individual members
- ✅ Intelligent caching (15-minute TTL)
- ✅ Rate limit protection
- ✅ Custom error types (GitHubTeamNotFoundError, GitHubPermissionError)

**Usage**:
```typescript
const members = await github.getTeamMembers('backend-team');
console.log(`Found ${members.length} team members`);
members.forEach(member => {
  console.log(`${member.login}: ${member.role}, can_assign_issues: ${member.permissions.can_assign_issues}`);
});
```

### 2. `getRepositoryIssues(labels: string[]): Promise<GitHubIssue[]>`
**Purpose**: Get issues filtered by multiple labels for wave coordination

**Features**:
- ✅ Multi-label filtering with AND logic
- ✅ Complete pagination with search API optimization
- ✅ Automatic PR filtering (issues only)
- ✅ Rich metadata (assignees, state, labels, dates)
- ✅ Smart caching (5-minute TTL for frequent changes)
- ✅ Rate limit awareness with delays

**Usage**:
```typescript
const waveIssues = await github.getRepositoryIssues(['wave-1', 'backend']);
const criticalIssues = await github.getRepositoryIssues(['critical', 'bug']);
const allIssues = await github.getRepositoryIssues([]); // No filters
```

### 3. `getTeamRepositories(teamName: string): Promise<Repository[]>`
**Purpose**: Get repositories that a team has access to with permission levels

**Features**:
- ✅ Complete repository metadata
- ✅ Permission level mapping (admin, push, pull, triage, maintain)
- ✅ Topics and language information
- ✅ Archive and privacy status
- ✅ Long-term caching (30-minute TTL)
- ✅ Multi-repository coordination support

**Usage**:
```typescript
const repos = await github.getTeamRepositories('backend-team');
const adminRepos = repos.filter(repo => repo.permissions.admin);
const activeRepos = repos.filter(repo => !repo.archived);
```

### 4. `createTeamAssignment(team: string, issues: string[]): Promise<TeamAssignmentResult>`
**Purpose**: Assign team to multiple issues atomically for wave coordination

**Features**:
- ✅ Atomic batch operations with rollback
- ✅ Automatic team member assignment (up to 3 members)
- ✅ Team label application (`team:{teamName}`)
- ✅ Informative comment posting
- ✅ Detailed success/failure reporting
- ✅ Rate limit-aware batching (10 issues per batch)
- ✅ Partial success handling

**Usage**:
```typescript
const result = await github.createTeamAssignment('backend-team', ['101', '102', '103']);
console.log(`Success rate: ${(result.successRate * 100).toFixed(1)}%`);
console.log(`Successful: ${result.successful.join(', ')}`);
if (result.failed.length > 0) {
  console.log('Failed assignments:', result.failed);
}
```

## 🔒 Robust Error Handling

### Custom Error Types
- `GitHubAPIError` - Base class for all GitHub API errors
- `GitHubRateLimitError` - Rate limit exceeded with reset time
- `GitHubTeamNotFoundError` - Team doesn't exist in organization  
- `GitHubPermissionError` - Insufficient permissions with required permission
- `GitHubTeamAssignmentError` - Team assignment failures with partial results

### Error Handling Pattern
```typescript
try {
  const members = await github.getTeamMembers('my-team');
} catch (error) {
  if (error instanceof GitHubTeamNotFoundError) {
    console.log(`Team '${error.teamName}' not found in ${error.organization}`);
  } else if (error instanceof GitHubRateLimitError) {
    console.log(`Rate limited until ${error.resetTime}`);
  } else if (error instanceof GitHubPermissionError) {
    console.log(`Need permission: ${error.requiredPermission}`);
  }
}
```

## 🚀 Performance Optimizations

### Intelligent Caching
- **Team Members**: 15 minutes (membership changes infrequently)
- **Repository Issues**: 5 minutes (issues change frequently)  
- **Team Repositories**: 30 minutes (repository access changes rarely)
- **LRU Eviction**: Prevents memory leaks (max 1000 entries)

### Rate Limit Protection
- Automatic rate limit monitoring
- Proactive waiting when limits are low (< 10 requests)
- Exponential backoff on rate limit errors
- Special handling for GitHub Search API limits

### Batch Processing
- Issue assignments processed in batches of 10
- Parallel processing within batches
- Inter-batch delays for rate limit compliance
- Atomic success/failure tracking

## 🔧 Configuration

### Environment Variables
```bash
GITHUB_TOKEN=your_personal_access_token_or_app_token
GITHUB_OWNER=your_organization_name  
GITHUB_REPO=your_repository_name
```

### Required GitHub Permissions
- `teams:read` - Read team membership and repositories
- `issues:read` - Search and read repository issues
- `issues:write` - Assign teams to issues and add labels/comments
- `repo:read` - Access repository metadata

## 🧪 Testing

### Quick Validation
```bash
npx ts-node examples/quick-test-github-extensions.ts
```

### Full Demo with Real GitHub API  
```bash
GITHUB_TOKEN=xxx GITHUB_OWNER=myorg GITHUB_REPO=myrepo \
npx ts-node examples/github-api-extensions-demo.ts
```

### Test Team Assignment (CAUTION: Modifies GitHub Issues)
```bash
GITHUB_TEST_ASSIGNMENT=true \
GITHUB_TOKEN=xxx GITHUB_OWNER=myorg GITHUB_REPO=myrepo \
npx ts-node examples/github-api-extensions-demo.ts
```

## 🌊 Integration with WaveOps Features

These methods are now ready to unlock the following WaveOps features:

### Team Coordination
- **Team Readiness Checks** - `getTeamMembers()` provides real team composition
- **Wave Gate Transitions** - `getRepositoryIssues()` filters issues by wave labels
- **Cross-Team Dependencies** - `getTeamRepositories()` enables multi-repo coordination

### Issue Management  
- **Dynamic Team Assignment** - `createTeamAssignment()` enables automated work distribution
- **Label-Based Filtering** - `getRepositoryIssues()` supports wave coordination labels
- **Batch Operations** - All methods handle large datasets efficiently

### Multi-Repository Support
- **Repository Discovery** - `getTeamRepositories()` maps team access across repos
- **Permission-Aware Operations** - All methods respect GitHub permission model
- **Scalable Architecture** - Designed for organizations with 100+ repositories

## 💡 Architecture Decisions

### Why These 4 Methods?
1. **Team Context** - Most WaveOps features need to understand team composition
2. **Issue Filtering** - Wave coordination requires sophisticated issue queries  
3. **Multi-Repo Support** - Modern teams work across multiple repositories
4. **Atomic Operations** - Team assignments must be reliable and transactional

### Design Principles
- **Fail-Safe**: Partial failures don't break entire operations
- **Observable**: Rich error context and detailed result reporting  
- **Scalable**: Built-in pagination, caching, and rate limiting
- **Flexible**: Support both small teams and large enterprise organizations

## 🔗 Dependencies

- `@octokit/rest` - GitHub REST API client
- Existing WaveOps type system
- Built-in Node.js caching and error handling

## 📈 Monitoring

### Cache Statistics
```typescript
const stats = github.getCacheStats();
console.log(`Cache: ${stats.size} entries, ${stats.hitRate}% hit rate`);
```

### API Performance
```typescript  
const timings = github.getAPIResponseTimings();
const averages = github.getAverageResponseTime();
console.log('API Performance:', averages);
```

### Rate Limit Monitoring
```typescript
const rateLimit = await github.getRateLimit();
console.log(`Rate Limit: ${rateLimit.remaining}/${rateLimit.limit}`);
```

---

**🎯 MISSION ACCOMPLISHED**: These 4 critical methods provide the foundation infrastructure needed to unlock all WaveOps coordination features. The codebase can now move from stubs to fully functional team coordination!