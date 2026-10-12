import { describe, expect, it } from 'vitest';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BatchResourceMoveBodySchema
} from '@fastgpt/global/openapi/common/batch/api';

const resourceId = '68ad85a7463006c963799a05';
const targetParentId = '68ad85a7463006c963799a06';

describe('openapi/common/batch', () => {
  it('validates resource ID list constraints for delete requests', () => {
    expect(BatchResourceDeleteBodySchema.safeParse({ ids: [resourceId] }).success).toBe(true);
    expect(BatchResourceDeleteBodySchema.safeParse({ ids: [] }).success).toBe(false);
    expect(BatchResourceDeleteBodySchema.safeParse({ ids: [resourceId, resourceId] }).success).toBe(
      false
    );
  });

  it('requires an explicit parent ID for move requests and accepts root moves', () => {
    expect(BatchResourceMoveBodySchema.safeParse({ ids: [resourceId] }).success).toBe(false);
    expect(
      BatchResourceMoveBodySchema.safeParse({ ids: [resourceId], parentId: targetParentId }).success
    ).toBe(true);
    expect(
      BatchResourceMoveBodySchema.safeParse({ ids: [resourceId], parentId: null }).success
    ).toBe(true);
  });

  it('validates the common action response shape', () => {
    expect(
      BatchResourceActionResponseSchema.safeParse({
        successIds: [resourceId],
        failedIds: [],
        affectedIds: [resourceId]
      }).success
    ).toBe(true);
    expect(
      BatchResourceActionResponseSchema.safeParse({
        successIds: [resourceId],
        failedIds: [],
        affectedIds: ['invalid-id']
      }).success
    ).toBe(false);
  });
});
