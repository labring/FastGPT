import { describe, expect, it } from 'vitest';
import {
  TeamPerList,
  TeamModelCreatePermissionVal
} from '@fastgpt/global/support/permission/user/constant';

describe('TeamModelCreatePermissionVal (refactored)', () => {
  it('should have value 0b10000000 (128)', () => {
    expect(TeamModelCreatePermissionVal).toBe(0b10000000);
  });

  it('should not overlap with existing permission bits', () => {
    const existingBits = [
      TeamPerList.read, // 0b100
      TeamPerList.write, // 0b010
      TeamPerList.manage, // 0b001
      TeamPerList.appCreate, // 0b001000
      TeamPerList.datasetCreate, // 0b010000
      TeamPerList.apikeyCreate, // 0b100000
      TeamPerList.skillCreate // 0b1000000
    ];

    const modelCreate = TeamModelCreatePermissionVal;
    for (const bit of existingBits) {
      // No overlap means (bit & modelCreate) === 0
      expect(bit & modelCreate).toBe(0);
    }
  });

  it('should be registered in TeamPerList.modelCreate', () => {
    expect(TeamPerList.modelCreate).toBe(0b10000000);
  });
});
