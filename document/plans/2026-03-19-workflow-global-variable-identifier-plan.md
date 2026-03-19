# Workflow Global Variable Identifier Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define a readable global variable `key` when creating workflow variables, keep the key immutable after creation, and preserve all existing runtime/reference behavior.

**Architecture:** Reuse the existing `chatConfig.variables[].key` field as the canonical runtime identifier. Add a shared identifier helper for generation/validation, wire it into the frontend variable editor, and add a defensive server-side validation gate before app updates are persisted. Runtime resolution and workflow references remain unchanged.

**Tech Stack:** React, TypeScript, Chakra UI, React Hook Form, Next.js API routes, Vitest, Zod-compatible app schema conventions.

---

## Spec Reference

- `document/specs/2026-03-19-workflow-global-variable-identifier-design.md`

## File Map

### Shared logic

- Create: `packages/global/core/app/variableIdentifier.ts`
  - Shared pure functions for generating and validating variable identifiers.
- Create: `test/cases/global/core/app/variableIdentifier.test.ts`
  - Unit tests for identifier generation and validation.

### Frontend editor

- Modify: `projects/app/src/components/core/app/VariableEditModal/index.tsx`
  - Create-mode/edit-mode handling for `key`.
- Modify: `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.tsx`
  - Render variable `key` field only for `type === 'variable'`.
- Modify: `projects/app/src/components/core/app/utils/formValidation.ts`
  - Split `label` and `key` validation concerns.
- Modify: `projects/app/src/components/core/app/VariableEdit.tsx`
  - Show `key` in the list and add copy affordance.
- Create: `projects/app/test/web/core/app/variableEditor.test.ts`
  - Frontend-level pure helper tests for create/edit field behavior.

### Server validation

- Modify: `packages/service/core/app/controller.ts`
  - Add defensive validation before persisting app updates.
- Modify: `projects/app/src/pages/api/core/app/update.ts`
  - Surface validation failures through the existing update path if controller throws.
- Create: `test/cases/service/core/app/controller.test.ts`
  - Server validation tests for duplicate/invalid/system-conflicting keys.

### Regression coverage

- Modify: `projects/app/test/web/core/app/utils.test.ts`
  - Extend app utility coverage if any helper lands there.
- Modify: `test/cases/global/core/workflow/runtime/utils.test.ts`
  - Add regression tests proving runtime lookup still uses canonical `key`.
- Modify: `test/cases/global/core/workflow/utils.test.ts`
  - Add regression tests for global variable output construction.

---

## Chunk 1: Shared Identifier Rules

### Task 1: Introduce shared variable identifier helpers

**Files:**
- Create: `packages/global/core/app/variableIdentifier.ts`
- Test: `test/cases/global/core/app/variableIdentifier.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  buildDefaultVariableIdentifier,
  validateVariableIdentifier
} from '@fastgpt/global/core/app/variableIdentifier';

describe('buildDefaultVariableIdentifier', () => {
  it('builds a snake_case identifier from an ascii label', () => {
    expect(buildDefaultVariableIdentifier('Customer Name')).toBe('customer_name');
  });

  it('prefixes identifiers that do not start with a letter', () => {
    expect(buildDefaultVariableIdentifier('1st contact')).toBe('var_1st_contact');
  });
});

describe('validateVariableIdentifier', () => {
  it('rejects invalid characters', () => {
    expect(validateVariableIdentifier('customer-name')).toEqual({
      valid: false,
      reason: 'invalid_format'
    });
  });

  it('rejects system keys', () => {
    expect(
      validateVariableIdentifier('userId', {
        reservedKeys: ['userId']
      })
    ).toEqual({
      valid: false,
      reason: 'system_conflict'
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- test/cases/global/core/app/variableIdentifier.test.ts`
Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Implement the minimal shared helper**

Implementation notes:
- Export a `VARIABLE_IDENTIFIER_REGEX`
- Export `buildDefaultVariableIdentifier(label: string): string`
- Export `validateVariableIdentifier(key: string, options): { valid: boolean; reason?: string }`
- Keep the helper pure and free of UI dependencies
- Keep the reserved system keys in one exported constant

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- test/cases/global/core/app/variableIdentifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/global/core/app/variableIdentifier.ts test/cases/global/core/app/variableIdentifier.test.ts
git commit -m "feat: add workflow variable identifier helpers"
```

---

## Chunk 2: Frontend Create/Edit Experience

### Task 2: Separate label validation and key validation in the frontend

**Files:**
- Modify: `projects/app/src/components/core/app/utils/formValidation.ts`
- Modify: `projects/app/src/components/core/app/VariableEditModal/index.tsx`
- Test: `projects/app/test/web/core/app/variableEditor.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  getInitialVariableIdentifier,
  shouldLockVariableIdentifier
} from '@/components/core/app/utils/variableEditor';

describe('getInitialVariableIdentifier', () => {
  it('uses the existing key when editing', () => {
    expect(getInitialVariableIdentifier({ key: 'customer_name', label: 'Customer Name' })).toBe(
      'customer_name'
    );
  });

  it('builds a key from the label when creating', () => {
    expect(getInitialVariableIdentifier({ key: '', label: 'Customer Name' })).toBe(
      'customer_name'
    );
  });
});

describe('shouldLockVariableIdentifier', () => {
  it('locks the identifier in edit mode', () => {
    expect(shouldLockVariableIdentifier({ key: 'customer_name' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- projects/app/test/web/core/app/variableEditor.test.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Add a small frontend helper and update validation hooks**

Implementation notes:
- Create `projects/app/src/components/core/app/utils/variableEditor.ts`
- Keep only pure editor-state helpers there
- Update `formValidation.ts` to expose:
  - `validateFieldLabel`
  - `validateFieldKey`
- Reuse shared rules from `@fastgpt/global/core/app/variableIdentifier`
- Keep toast text in the hook layer, not in the shared helper

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- projects/app/test/web/core/app/variableEditor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add projects/app/src/components/core/app/utils/formValidation.ts projects/app/src/components/core/app/utils/variableEditor.ts projects/app/test/web/core/app/variableEditor.test.ts projects/app/src/components/core/app/VariableEditModal/index.tsx
git commit -m "refactor: split workflow variable label and key validation"
```

### Task 3: Add create-time editable `key` and edit-time readonly `key`

**Files:**
- Modify: `projects/app/src/components/core/app/VariableEditModal/index.tsx`
- Modify: `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.tsx`
- Test: `projects/app/test/web/core/app/variableEditor.test.ts`

- [ ] **Step 1: Extend the failing tests for create/edit behavior**

```ts
describe('variable identifier form behavior', () => {
  it('autofills the identifier from label until the user edits it manually', () => {
    const state = reduceVariableIdentifierState({
      label: 'Customer Name',
      key: '',
      touched: false
    });
    expect(state.key).toBe('customer_name');
  });

  it('does not overwrite a manually edited identifier', () => {
    const state = reduceVariableIdentifierState({
      label: 'Customer Name',
      key: 'crm_customer',
      touched: true
    });
    expect(state.key).toBe('crm_customer');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- projects/app/test/web/core/app/variableEditor.test.ts`
Expected: FAIL until the reducer/helper is implemented.

- [ ] **Step 3: Implement the UI wiring**

Implementation notes:
- `InputTypeConfig.tsx` should only render the `key` field for `type === 'variable'`
- Create mode:
  - editable input
  - helper text explaining the identifier is used for API/runtime references
- Edit mode:
  - readonly input or readonly text block
  - helper text saying the identifier cannot be changed after creation
- `VariableEditModal/index.tsx` must validate `label` and `key` separately before save
- Remove the current “label doubles as uniqueness source for everything” coupling

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- projects/app/test/web/core/app/variableEditor.test.ts`
Expected: PASS

- [ ] **Step 5: Manual UI verification**

Check in the workflow editor:
- Creating a variable with label `Customer Name` prefills `customer_name`
- Manually changing the key to `crm_customer` preserves the custom value
- Editing the saved variable shows the key in readonly mode
- Plugin/form input editors do not gain a new key field

- [ ] **Step 6: Commit**

```bash
git add projects/app/src/components/core/app/VariableEditModal/index.tsx projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.tsx projects/app/test/web/core/app/variableEditor.test.ts
git commit -m "feat: support custom workflow variable identifiers on create"
```

### Task 4: Expose `key` in the variable list and add copy affordance

**Files:**
- Modify: `projects/app/src/components/core/app/VariableEdit.tsx`

- [ ] **Step 1: Add the UI change**

Implementation notes:
- Add a dedicated `key` column
- Keep `label` as the first column
- Add a copy button/icon near the identifier
- Do not change drag-and-drop semantics

- [ ] **Step 2: Manual verification**

Check:
- Variables list shows both label and key
- Copy action copies the canonical key
- Row layout remains usable at common zoom levels

- [ ] **Step 3: Commit**

```bash
git add projects/app/src/components/core/app/VariableEdit.tsx
git commit -m "feat: show workflow variable identifiers in the editor list"
```

---

## Chunk 3: Server Validation and Runtime Regression

### Task 5: Add defensive server-side validation before app updates persist

**Files:**
- Modify: `packages/service/core/app/controller.ts`
- Modify: `projects/app/src/pages/api/core/app/update.ts`
- Create: `test/cases/service/core/app/controller.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';

describe('beforeUpdateAppFormat variable identifier validation', () => {
  it('throws on duplicate variable keys', () => {
    expect(() =>
      beforeUpdateAppFormat({
        nodes: [],
        chatConfig: {
          variables: [
            { key: 'customer_name', label: 'Customer Name', type: 'input' },
            { key: 'customer_name', label: 'Customer Alias', type: 'input' }
          ]
        } as any
      })
    ).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- test/cases/service/core/app/controller.test.ts`
Expected: FAIL because validation is not implemented yet.

- [ ] **Step 3: Implement the validation**

Implementation notes:
- Extend `beforeUpdateAppFormat` to accept `chatConfig`
- Validate:
  - identifier format
  - duplicate keys within the app
  - conflict with reserved system keys
- Throw a typed/business-meaningful error instead of a generic string
- Call the updated formatter from `projects/app/src/pages/api/core/app/update.ts`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- test/cases/service/core/app/controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/service/core/app/controller.ts projects/app/src/pages/api/core/app/update.ts test/cases/service/core/app/controller.test.ts
git commit -m "feat: validate workflow variable identifiers on app update"
```

### Task 6: Add runtime and workflow regression coverage

**Files:**
- Modify: `test/cases/global/core/workflow/runtime/utils.test.ts`
- Modify: `test/cases/global/core/workflow/utils.test.ts`

- [ ] **Step 1: Write the failing regression tests**

Add cases that prove:
- Global variables continue to resolve by canonical `key`
- Global variable metadata construction still uses `key` for outputs
- Runtime compatibility still accepts `label` input when the compatibility path is hit

- [ ] **Step 2: Run the regression suite and verify failures**

Run: `pnpm test -- test/cases/global/core/workflow/runtime/utils.test.ts test/cases/global/core/workflow/utils.test.ts`
Expected: At least one FAIL until new coverage/fixtures are aligned.

- [ ] **Step 3: Update fixtures/helpers without changing runtime semantics**

Implementation notes:
- Keep `[VARIABLE_NODE_ID, key]` references unchanged
- Do not remove the current compatibility fallback in chat/runtime code in this feature
- Only add or adjust tests/fixtures as needed

- [ ] **Step 4: Run the regression suite and verify it passes**

Run: `pnpm test -- test/cases/global/core/workflow/runtime/utils.test.ts test/cases/global/core/workflow/utils.test.ts`
Expected: PASS

- [ ] **Step 5: Run the focused end-to-end subset**

Run: `pnpm test -- projects/app/test/web/core/app/utils.test.ts projects/app/test/web/core/app/variableEditor.test.ts test/cases/global/core/app/variableIdentifier.test.ts test/cases/service/core/app/controller.test.ts test/cases/global/core/workflow/runtime/utils.test.ts test/cases/global/core/workflow/utils.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add projects/app/test/web/core/app/utils.test.ts test/cases/global/core/workflow/runtime/utils.test.ts test/cases/global/core/workflow/utils.test.ts
git commit -m "test: cover workflow variable identifier regressions"
```

---

## Manual QA Checklist

- Create a new global variable and confirm the generated key is readable.
- Override the generated key manually and confirm the override is preserved.
- Save the variable and reopen it; confirm the key is readonly.
- Reference the variable in a workflow node and verify debug/runtime still resolves correctly.
- Open an old app with nanoid-style variable keys and verify it still loads and runs.
- Submit chat variables through both web-form-style key input and compatibility label input if an API harness exists.

## Final Verification

Run:

```bash
pnpm test -- test/cases/global/core/app/variableIdentifier.test.ts projects/app/test/web/core/app/variableEditor.test.ts test/cases/service/core/app/controller.test.ts test/cases/global/core/workflow/runtime/utils.test.ts test/cases/global/core/workflow/utils.test.ts projects/app/test/web/core/app/utils.test.ts
```

Expected:
- All targeted tests PASS
- No runtime logic changes outside identifier generation/validation and editor presentation

## Execution Notes

- Prefer landing shared helper/tests first, then frontend, then server validation.
- Keep UI-only wording changes in the same commit as the UI behavior they describe.
- Do not remove `label -> key` compatibility logic in this feature.
- If backend validation introduces a new error code, update the related i18n string in the same commit.
