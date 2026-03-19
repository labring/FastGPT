import { describe, expect, it } from 'vitest';
import { shouldLockVariableIdentifier } from '@/components/core/app/utils/variableEditor';

describe('shouldLockVariableIdentifier', () => {
  it('locks the identifier in edit mode', () => {
    expect(shouldLockVariableIdentifier({ key: 'customer_name' })).toBe(true);
  });

  it('does not lock the identifier in create mode', () => {
    expect(shouldLockVariableIdentifier({ key: '' })).toBe(false);
  });
});
