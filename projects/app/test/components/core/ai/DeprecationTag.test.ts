import { describe, expect, it, vi } from 'vitest';
import type React from 'react';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/Tag', () => ({
  default: (props: Record<string, unknown>) => props
}));

const { default: DeprecationTag } = await import('@/components/core/ai/DeprecationTag');
const render = (
  DeprecationTag as unknown as { type: (props: { size?: 'sm' | 'md' }) => React.ReactElement }
).type;

describe('DeprecationTag', () => {
  it('uses the compact dimensions only for the small size', () => {
    const small = (render({ size: 'sm' }) as React.ReactElement).props as Record<string, unknown>;
    const medium = (render({}) as React.ReactElement).props as Record<string, unknown>;

    expect(small).toMatchObject({
      colorSchema: 'lightRed',
      fontSize: '10px',
      px: '8px',
      py: '4px'
    });
    expect(small.children).toBe('common:model.upcoming_deprecation');
    expect(medium).not.toHaveProperty('fontSize');
    expect(medium).not.toHaveProperty('px');
    expect(medium).not.toHaveProperty('py');
  });
});
