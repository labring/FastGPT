import { describe, expect, it } from 'vitest';
import { getConfigNames, groupTestsByConfig } from '../../scripts/test/light.mjs';

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

  it('将 L0 纯内存单测（*.unit.test.ts）优先路由到零数据库 vitest.unit.config.ts', () => {
    expect(getConfigNames('packages/service/test/support/demo/service.unit.test.ts')[0]).toBe(
      'vitest.unit.config.ts'
    );
  });
});
