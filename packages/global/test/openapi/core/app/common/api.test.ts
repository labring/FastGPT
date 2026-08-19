import { UpdateAppBodySchema } from '@fastgpt/global/openapi/core/app/common/api';
import { describe, expect, it } from 'vitest';

describe('UpdateAppBodySchema', () => {
  it('rejects workflow fields', () => {
    expect(UpdateAppBodySchema.safeParse({ nodes: [] }).success).toBe(false);
  });
});
