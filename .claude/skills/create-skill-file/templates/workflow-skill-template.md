---
name: your-workflow-skill
description: Guides Claude through a multi-step workflow for [specific task]. Activates when user needs to [trigger scenario] or mentions [key terms].
---

# Your Workflow Skill Title

> Automates a complex multi-step process with decision points and validation

## When to Use This Skill

- User needs to execute a multi-step workflow
- User asks to "[workflow trigger phrase]"
- User is working on [specific type of project or task]
- Task requires validation and error handling at each step

## Workflow Overview

```
┌─────────────┐
│   Start     │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Preparation    │
│  & Validation   │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Step 1  │
    └────┬────┘
         │
    ┌────▼────┐
    │ Step 2  │──┐
    └────┬────┘  │ (Loop if needed)
         │       │
         └───────┘
         │
    ┌────▼────┐
    │ Step 3  │
    └────┬────┘
         │
         ▼
    ┌─────────────┐
    │  Complete   │
    │  & Report   │
    └─────────────┘
```

## Detailed Workflow

### Preparation Phase

Before starting the main workflow:

- [ ] Check prerequisite 1
- [ ] Validate prerequisite 2
- [ ] Ensure prerequisite 3 is met

If any prerequisite fails:
- Stop execution
- Report which prerequisite failed
- Provide remediation steps

### Step 1: [Step Name]

**Purpose**: What this step accomplishes

**Actions**:
1. Action 1
2. Action 2
3. Action 3

**Validation**:
- Check condition 1
- Verify condition 2

**On Success**: → Proceed to Step 2
**On Failure**: → [Error handling procedure]

### Step 2: [Step Name]

**Purpose**: What this step accomplishes

**Actions**:
1. Action 1
2. Action 2

**Decision Point**:
- If condition A: → Action X
- If condition B: → Action Y
- Otherwise: → Default action

**Validation**:
- Verify expected output
- Check for errors

**On Success**: → Proceed to Step 3
**On Failure**: → [Error handling procedure]

### Step 3: [Step Name]

**Purpose**: Final actions and cleanup

**Actions**:
1. Finalize changes
2. Run validation tests
3. Generate summary report

**Success Criteria**:
- All tests pass
- No errors in logs
- Expected artifacts created

## Examples

### Example 1: Standard Workflow Execution

**User Request**: "Run the [workflow name]"

**Execution**:

**Preparation Phase** ✓
```
✓ Prerequisite 1 met
✓ Prerequisite 2 validated
✓ Ready to begin
```

**Step 1: [Step Name]** ✓
```
→ Action 1 completed
→ Action 2 completed
→ Validation passed
```

**Step 2: [Step Name]** ✓
```
→ Decision: Condition A detected
→ Executing Action X
→ Validation passed
```

**Step 3: [Step Name]** ✓
```
→ Finalization complete
→ All tests passed
→ Summary generated
```

**Result**: Workflow completed successfully

### Example 2: Workflow with Error Recovery

**User Request**: "Execute [workflow name]"

**Execution**:

**Step 1** ✓
```
→ Completed successfully
```

**Step 2** ⚠️
```
→ Action 1 completed
→ Action 2 failed: [Error message]
```

**Error Recovery**:
1. Identified root cause: [Explanation]
2. Applied fix: [Fix description]
3. Retrying Step 2...

**Step 2 (Retry)** ✓
```
→ Completed after fix
```

**Step 3** ✓
```
→ Completed successfully
```

**Result**: Workflow completed with 1 retry

## Error Handling

### Error Categories

| Category | Action |
|----------|--------|
| **Recoverable** | Attempt automatic fix, retry up to 3 times |
| **User Input Needed** | Pause workflow, ask user for guidance |
| **Critical** | Stop workflow, rollback changes if possible |

### Common Errors

**Error 1: [Error Name]**
- **Cause**: What causes this error
- **Detection**: How to identify it
- **Recovery**: Steps to fix
  1. Recovery action 1
  2. Recovery action 2
  3. Retry from failed step

**Error 2: [Error Name]**
- **Cause**: What causes this error
- **Detection**: How to identify it
- **Recovery**: Manual intervention required
  - Ask user: "[Question to ask]"
  - Wait for user input
  - Apply user's guidance
  - Resume workflow

## Rollback Procedure

If the workflow fails critically:

1. **Identify last successful step**
   - Step 1: ✓ Completed
   - Step 2: ❌ Failed at action 3

2. **Undo changes from failed step**
   - Revert action 1
   - Revert action 2
   - Clean up partial state

3. **Verify system state**
   - Confirm rollback successful
   - Check for side effects

4. **Report to user**
   ```
   Workflow failed at Step 2, action 3
   Reason: [Error message]
   All changes have been rolled back
   System is back to pre-workflow state
   ```

## Workflow Variations

### Variation 1: Quick Mode

**When to use**: User needs faster execution, can accept lower validation

**Changes**:
- Skip optional validations
- Use cached data where available
- Reduce logging verbosity

**Trade-offs**:
- ⚡ 50% faster
- ⚠️ Less detailed error messages

### Variation 2: Strict Mode

**When to use**: Production deployments, critical changes

**Changes**:
- Enable all validations
- Require explicit user confirmation at each step
- Generate detailed audit logs

**Trade-offs**:
- 🛡️ Maximum safety
- 🐢 Slower execution

## Monitoring and Logging

Throughout the workflow:

```
[TIMESTAMP] [STEP] [STATUS] Message

[2025-01-31 14:30:01] [PREP] [INFO] Starting preparation phase
[2025-01-31 14:30:02] [PREP] [OK] All prerequisites met
[2025-01-31 14:30:03] [STEP1] [INFO] Beginning Step 1
[2025-01-31 14:30:05] [STEP1] [OK] Step 1 completed successfully
[2025-01-31 14:30:06] [STEP2] [INFO] Beginning Step 2
[2025-01-31 14:30:08] [STEP2] [WARN] Condition B detected, using fallback
[2025-01-31 14:30:10] [STEP2] [OK] Step 2 completed with warnings
[2025-01-31 14:30:11] [STEP3] [INFO] Beginning Step 3
[2025-01-31 14:30:15] [STEP3] [OK] Step 3 completed successfully
[2025-01-31 14:30:16] [COMPLETE] [OK] Workflow finished successfully
```

## Post-Workflow Report

After completion, generate a summary:

```markdown
# Workflow Execution Report

**Workflow**: [Workflow Name]
**Started**: 2025-01-31 14:30:01
**Completed**: 2025-01-31 14:30:16
**Duration**: 15 seconds
**Status**: ✓ Success

## Steps Executed

1. ✓ Preparation Phase (1s)
2. ✓ Step 1: [Step Name] (2s)
3. ✓ Step 2: [Step Name] (4s) - 1 warning
4. ✓ Step 3: [Step Name] (4s)

## Warnings

- Step 2: Condition B detected, used fallback action

## Artifacts Generated

- `/path/to/output1.txt`
- `/path/to/output2.json`
- `/path/to/report.html`

## Next Steps

- Review generated artifacts
- Deploy to production (if applicable)
- Archive logs to `/logs/workflow-20250131-143001.log`
```

## Best Practices

### Do

- ✅ Validate inputs before starting workflow
- ✅ Provide clear progress updates at each step
- ✅ Log all decisions and actions
- ✅ Handle errors gracefully with recovery options
- ✅ Generate summary report at completion

### Don't

- ❌ Skip validation steps to save time
- ❌ Continue after critical errors
- ❌ Assume prerequisites are met without checking
- ❌ Lose partial progress on failure
- ❌ Leave system in inconsistent state

## Advanced Features

### Parallel Execution

Some steps can run in parallel:

```
Step 1 ─┬─→ Step 2A ─┐
        │             ├─→ Step 3
        └─→ Step 2B ─┘
```

**Requirements**:
- Steps 2A and 2B must be independent
- Both must complete before Step 3

**Implementation**:
1. Start Step 2A in background
2. Start Step 2B in background
3. Wait for both to complete
4. Verify both succeeded
5. Proceed to Step 3

### Conditional Branching

```
Step 1 → Decision
         ├─→ [Condition A] → Path A → Step 3
         ├─→ [Condition B] → Path B → Step 3
         └─→ [Default]     → Path C → Step 3
```

## Testing This Workflow

To test the workflow without side effects:

1. Use `--dry-run` flag to simulate execution
2. Check that all steps are logged correctly
3. Verify error handling with intentional failures
4. Confirm rollback procedure works

Example:
```bash
workflow-runner --dry-run --inject-error step2
```

Expected output:
```
[DRY RUN] Step 1: Would execute [actions]
[DRY RUN] Step 2: Injected error as requested
[DRY RUN] Error Recovery: Would attempt fix
[DRY RUN] Rollback: Would undo Step 1 changes
```

---

**Version**: 1.0
**Last Updated**: YYYY-MM-DD
**Maintainer**: Team Name