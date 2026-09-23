import { describe, expect, it } from 'vitest';
import { isClientOnlyRoute } from '@/web/context/clientOnlyRouteConfig';

describe('clientOnlyRouteConfig', () => {
  it('默认路由全部使用 client-only 模式', () => {
    expect(isClientOnlyRoute('/account/apikey')).toBe(true);
    expect(isClientOnlyRoute('/account/cancel')).toBe(true);
    expect(isClientOnlyRoute('/admin')).toBe(true);
    expect(isClientOnlyRoute('/admin/users')).toBe(true);
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
    expect(isClientOnlyRoute('/dataset/list')).toBe(true);
    expect(isClientOnlyRoute('/dataset/detail')).toBe(true);
    expect(isClientOnlyRoute('/app/detail')).toBe(true);
    expect(isClientOnlyRoute('/chat')).toBe(true);
    expect(isClientOnlyRoute('/price')).toBe(true);
    expect(isClientOnlyRoute('/login')).toBe(true);
    expect(isClientOnlyRoute('/')).toBe(true);
  });

  it('仅 /chat/share 保持 SSR 模式', () => {
    expect(isClientOnlyRoute('/chat/share')).toBe(false);
  });

  it('空路由安全处理为 client-only', () => {
    expect(isClientOnlyRoute('')).toBe(true);
  });
});
