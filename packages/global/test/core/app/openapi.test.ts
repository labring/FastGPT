import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ListAppBodySchema } from '@fastgpt/global/openapi/core/app/common/api';

describe('ListAppBodySchema', () => {
  it('should treat empty app type as unspecified type', () => {
    expect(ListAppBodySchema.parse({ type: '' })).toEqual({});
  });

  it('should support single app type and app type array', () => {
    expect(ListAppBodySchema.parse({ type: AppTypeEnum.workflow }).type).toBe(AppTypeEnum.workflow);
    expect(
      ListAppBodySchema.parse({ type: [AppTypeEnum.folder, AppTypeEnum.workflow] }).type
    ).toEqual([AppTypeEnum.folder, AppTypeEnum.workflow]);
  });

  it('should ignore app types outside enum values', () => {
    expect(ListAppBodySchema.parse({ type: 'unknown' })).toEqual({});
    expect(ListAppBodySchema.parse({ type: ['unknown', AppTypeEnum.workflow] }).type).toEqual([
      AppTypeEnum.workflow
    ]);
    expect(ListAppBodySchema.parse({ type: ['unknown'] })).toEqual({});
  });
});
