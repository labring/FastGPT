import { describe, expect, it, vi } from 'vitest';
import { defaultMetadataProcessor } from '@/pageComponents/admin/audit/commonProcessor';

describe('admin audit defaultMetadataProcessor', () => {
  it('translates allowlisted system label keys and preserves plugin names containing colons', () => {
    const t = vi.fn((key: string, opts?: { defaultValue?: string }) =>
      key === 'account_team:inform_level_important' ? '重要' : (opts?.defaultValue ?? key)
    );

    const processed = defaultMetadataProcessor(
      {
        name: 'root',
        pluginName: 'Custom: Keyword Moderation',
        level: 'account_team:inform_level_important'
      },
      t
    );

    expect(processed).toEqual({
      name: 'root',
      pluginName: 'Custom: Keyword Moderation',
      level: '重要'
    });
    expect(t).toHaveBeenCalledTimes(1);
  });

  it('handles undefined metadata and newItemNames arrays or strings', () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    expect(defaultMetadataProcessor(undefined, t)).toEqual({});
    expect(defaultMetadataProcessor({ newItemNames: ['a', 'b'] }, t)).toEqual({
      newItemNames: 'translated:a,translated:b'
    });
    expect(defaultMetadataProcessor({ newItemNames: 'a,b' }, t)).toEqual({
      newItemNames: 'translated:a,translated:b'
    });
  });
});
