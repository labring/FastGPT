import { describe, expect, it } from 'vitest';

import { shouldPromptContactBinding } from '@/web/support/user/inform/utils';

describe('shouldPromptContactBinding', () => {
  const baseParams = {
    isPlus: true,
    bindNotificationMethod: ['email'] as const,
    contact: null
  };

  it('allows an unbound member when contact binding is configured', () => {
    expect(shouldPromptContactBinding(baseParams)).toBe(true);
  });

  it.each([
    ['non-plus', { isPlus: false }],
    ['without binding methods', { bindNotificationMethod: [] }],
    ['already bound', { contact: 'user@example.com' }]
  ])('does not prompt for %s', (_caseName, overrides) => {
    expect(shouldPromptContactBinding({ ...baseParams, ...overrides })).toBe(false);
  });
});
