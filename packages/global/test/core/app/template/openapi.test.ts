import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ListAppTemplateQuerySchema } from '@fastgpt/global/openapi/core/app/template/api';

describe('ListAppTemplateQuerySchema', () => {
  it('should treat empty template type query as all templates', () => {
    expect(ListAppTemplateQuerySchema.parse({ type: '' }).type).toBe('all');
  });

  it('should keep omitted type as unspecified for handler defaults', () => {
    expect(ListAppTemplateQuerySchema.parse({})).toEqual({});
  });

  it('should accept app type and all filters', () => {
    expect(ListAppTemplateQuerySchema.parse({ type: AppTypeEnum.workflow }).type).toBe(
      AppTypeEnum.workflow
    );
    expect(ListAppTemplateQuerySchema.parse({ type: 'all' }).type).toBe('all');
  });
});
