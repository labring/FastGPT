import { ModelStatusLabel } from '@/components/Select/ModelStatusLabel';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { model?: string }) =>
      params?.model ? `${key}:${params.model}` : key
  })
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

describe('ModelStatusLabel', () => {
  it('uses the disabled prefix without rendering the deprecation tag', () => {
    const html = renderToStaticMarkup(
      React.createElement(ModelStatusLabel, {
        modelId: 'model',
        detail: {
          modelId: 'model',
          name: 'qwen3.8-flash',
          status: 'disabled',
          isUpcomingDeprecation: true
        },
        showUpcomingDeprecationTag: true,
        hideUpcomingDeprecationTagWhenDisabled: true,
        disabledLabel: (name: string) => `已停用 ${name}`
      })
    );

    expect(html).toContain('已停用 qwen3.8-flash');
    expect(html).not.toContain('common:model.upcoming_deprecation');
  });
});
