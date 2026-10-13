import { describe, expect, it } from 'vitest';
import { groupTestsByConfig } from '../../scripts/test/light.mjs';

describe('test:light', () => {
  it('同一 workspace 的单元测试和集成测试按各自配置分组', () => {
    const groups = groupTestsByConfig([
      'packages/service/test/worker/utils.test.ts',
      'packages/service/test/integrations/vectorDB/pg/index.integration.test.ts'
    ]);

    expect(groups).toHaveLength(2);
    expect(
      groups.some(({ configPath }) => configPath.endsWith('packages/service/vitest.config.ts'))
    ).toBe(true);
    expect(
      groups.some(({ configPath }) =>
        configPath.endsWith('packages/service/vitest.integration.config.ts')
      )
    ).toBe(true);
  });
});
