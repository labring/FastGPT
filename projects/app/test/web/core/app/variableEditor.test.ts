import { describe, expect, it } from 'vitest';
import {
  getInitialVariableIdentifier,
  shouldLockVariableIdentifier,
  syncVariableIdentifier
} from '@/components/core/app/utils/variableEditor';

describe('getInitialVariableIdentifier', () => {
  it('uses the existing key when editing', () => {
    expect(getInitialVariableIdentifier({ key: 'customer_name', label: 'Customer Name' })).toBe(
      'customer_name'
    );
  });

  it('builds a key from the label when creating', () => {
    expect(getInitialVariableIdentifier({ key: '', label: 'Customer Name' })).toBe('customer_name');
  });
});

describe('shouldLockVariableIdentifier', () => {
  it('locks the identifier in edit mode', () => {
    expect(shouldLockVariableIdentifier({ key: 'customer_name' })).toBe(true);
  });

  it('does not lock the identifier in create mode', () => {
    expect(shouldLockVariableIdentifier({ key: '' })).toBe(false);
  });
});

describe('syncVariableIdentifier', () => {
  it('autofills the identifier from label until the user edits it manually', () => {
    expect(
      syncVariableIdentifier({
        label: 'Customer Name',
        key: '',
        touched: false
      })
    ).toBe('customer_name');
  });

  it('does not overwrite a manually edited identifier', () => {
    expect(
      syncVariableIdentifier({
        label: 'Customer Name',
        key: 'crm_customer',
        touched: true
      })
    ).toBe('crm_customer');
  });
});
