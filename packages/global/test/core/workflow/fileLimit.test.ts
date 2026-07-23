import { describe, expect, it } from 'vitest';
import {
  getFileAmountLimit,
  getFileSizeLimitBytes,
  getModuleFileAmountLimit,
  getUserFileAmountLimit
} from '../../../core/workflow/fileLimit';

describe('workflow file limits', () => {
  it('uses the team amount when configured and otherwise falls back to the system amount', () => {
    expect(getUserFileAmountLimit({ teamMaxFileAmount: 8, systemMaxFileAmount: 10 })).toBe(8);
    expect(getUserFileAmountLimit({ systemMaxFileAmount: 10 })).toBe(10);
    expect(getUserFileAmountLimit({ teamMaxFileAmount: 0, systemMaxFileAmount: 10 })).toBe(0);
  });

  it('caps an explicit module amount by the user amount', () => {
    expect(
      getFileAmountLimit({
        teamMaxFileAmount: 8,
        systemMaxFileAmount: 10,
        moduleMaxFileAmount: 3
      })
    ).toBe(3);
    expect(
      getFileAmountLimit({
        teamMaxFileAmount: 3,
        systemMaxFileAmount: 10,
        moduleMaxFileAmount: 8
      })
    ).toBe(3);
  });

  it('uses the user amount when a query has no explicit module amount', () => {
    expect(getFileAmountLimit({ teamMaxFileAmount: 8, systemMaxFileAmount: 10 })).toBe(8);
  });

  it('supports a module default for legacy Form, Plugin and variable inputs', () => {
    expect(
      getFileAmountLimit({
        systemMaxFileAmount: 3,
        defaultModuleMaxFileAmount: 5
      })
    ).toBe(3);
    expect(
      getModuleFileAmountLimit({
        userMaxFileAmount: 3,
        defaultModuleMaxFileAmount: 5
      })
    ).toBe(3);
  });

  it('uses the team size when configured and returns bytes', () => {
    expect(getFileSizeLimitBytes({ teamMaxFileSize: 2, systemMaxFileSize: 10 })).toBe(
      2 * 1024 * 1024
    );
    expect(getFileSizeLimitBytes({ systemMaxFileSize: 10 })).toBe(10 * 1024 * 1024);
    expect(getFileSizeLimitBytes({ teamMaxFileSize: 0, systemMaxFileSize: 10 })).toBe(0);
  });
});
