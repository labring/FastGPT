import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/pages/app/detail/index.tsx'), 'utf8');

describe('app detail permission routing', () => {
  it('does not repeatedly route a read-only collaborator already on the logs tab', () => {
    expect(source).toContain(
      'const currentTab = useContextSelector(AppContext, (e) => e.currentTab);'
    );
    expect(source).toContain(
      'if (!appDetail.permission.hasWritePer && currentTab !== TabEnum.logs) {'
    );
    expect(source).toContain('currentTab,');
  });
});
