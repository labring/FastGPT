import { describe, expect, it } from 'vitest';
import { isClientOnlyRoute } from '@/web/context/clientOnlyRouteConfig';

describe('clientOnlyRouteConfig', () => {
  it('账户页面统一使用 client-only 模式', () => {
    expect(isClientOnlyRoute('/account/apikey')).toBe(true);
    expect(isClientOnlyRoute('/account/future-page')).toBe(true);
  });

  it('配置页面统一使用 client-only 模式', () => {
    expect(isClientOnlyRoute('/config/model')).toBe(true);
    expect(isClientOnlyRoute('/config/new-page')).toBe(true);
  });

  it('独立页面也可显式启用 client-only 模式', () => {
    expect(isClientOnlyRoute('/config/plugin/marketplace')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/tool/marketplace')).toBe(true);
    expect(isClientOnlyRoute('/price')).toBe(true);
  });

  it('未迁移路由不进入 client-only 门禁', () => {
    expect(isClientOnlyRoute('/chat')).toBe(false);
    expect(isClientOnlyRoute('/account/cancel')).toBe(false);
  });
});
