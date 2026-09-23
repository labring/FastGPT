import { describe, expect, it } from 'vitest';
import { isClientOnlyRoute } from '@/web/context/clientOnlyRouteConfig';

describe('clientOnlyRouteConfig', () => {
  it('账户页面统一使用 client-only 模式', () => {
    expect(isClientOnlyRoute('/account/apikey')).toBe(true);
    expect(isClientOnlyRoute('/account/future-page')).toBe(true);
  });

  it('Dashboard 页面统一使用 client-only 模式', () => {
    expect(isClientOnlyRoute('/dashboard/agent')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/tool')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/skill')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/templateMarket')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/systemTool')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/mcpServer')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/evaluation')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/evaluation/create')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/create')).toBe(true);
    expect(isClientOnlyRoute('/dashboard/tool/marketplace')).toBe(true);
  });

  it('独立页面也可显式启用 client-only 模式', () => {
    expect(isClientOnlyRoute('/config/plugin/marketplace')).toBe(false);
    expect(isClientOnlyRoute('/price')).toBe(true);
  });

  it('未迁移路由不进入 client-only 门禁', () => {
    expect(isClientOnlyRoute('/chat')).toBe(false);
    expect(isClientOnlyRoute('/account/cancel')).toBe(false);
  });
});
