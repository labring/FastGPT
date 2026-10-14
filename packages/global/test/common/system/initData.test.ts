import { describe, expect, it } from 'vitest';
import { getInitDataPage } from '../../../common/system/initData';

describe('getInitDataPage', () => {
  it.each([
    ['/login', 'login'],
    ['/login/sso', 'login'],
    ['/price', 'price'],
    ['/tools/price', 'base'],
    ['/chat', 'chat'],
    ['/chat/share', 'share'],
    ['/login/provider', 'base'],
    ['/login/fastlogin', 'base'],
    ['/apidoc/devapi', 'base'],
    ['/price-extra', 'base'],
    [undefined, 'base']
  ] as const)('classifies %s as %s', (pathname, expected) => {
    expect(getInitDataPage(pathname)).toBe(expected);
  });
});
