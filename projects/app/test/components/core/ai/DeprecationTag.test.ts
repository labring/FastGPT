import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DeprecationTag from '@/components/core/ai/DeprecationTag';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

describe('DeprecationTag', () => {
  it('renders the default-size warning without caller configuration', () => {
    expect(renderToStaticMarkup(React.createElement(DeprecationTag))).toContain(
      'common:model.upcoming_deprecation'
    );
  });
});
