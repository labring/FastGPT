import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ShareBrandFeature from '@/components/support/wallet/ShareBrandFeature';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';

const state = vi.hoisted(() => ({
  enabled: true,
  plans: {
    free: { canHideShareBrand: true },
    basic: { canHideShareBrand: true },
    advanced: { canHideShareBrand: true },
    custom: { canHideShareBrand: true }
  }
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: { show_outlink_brand: state.enabled },
    subPlans: { standard: state.plans }
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: () => React.createElement('span', { 'data-tip': true })
}));
vi.mock('@chakra-ui/react', () => ({
  Flex: ({ children, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-plan-feature': props['data-plan-feature'],
        'data-plan-level': props['data-plan-level']
      },
      children
    ),
  Box: ({ children, bg, fontWeight }: any) =>
    React.createElement('span', { 'data-bg': bg, 'data-weight': fontWeight }, children)
}));

describe('ShareBrandFeature', () => {
  it.each([
    StandardSubLevelEnum.free,
    StandardSubLevelEnum.basic,
    StandardSubLevelEnum.advanced,
    StandardSubLevelEnum.custom
  ])('highlights an enabled %s plan when requested', (level) => {
    const html = renderToStaticMarkup(
      React.createElement(ShareBrandFeature, { level, highlight: true })
    );
    expect(html).toContain(`data-plan-level="${level}"`);
    expect(html).toContain('data-bg="yellow.200"');
    expect(html).toContain('data-weight="bold"');
    expect(html).toContain('data-tip="true"');
  });

  it('shows an enabled feature without highlighting in ordinary views', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareBrandFeature, { level: StandardSubLevelEnum.basic })
    );
    expect(html).toContain('data-plan-feature="share-brand"');
    expect(html).not.toContain('data-bg');
    expect(html).not.toContain('data-tip');
  });

  it.each([
    [true, false, false],
    [false, true, true],
    [true, undefined, true],
    [false, undefined, false]
  ])('resolves template %s with team entitlement %s', (configured, entitlement, visible) => {
    state.plans.advanced.canHideShareBrand = configured;
    const html = renderToStaticMarkup(
      React.createElement(ShareBrandFeature, {
        level: StandardSubLevelEnum.advanced,
        canHideShareBrand: entitlement
      })
    );
    expect(html.includes('data-plan-feature="share-brand"')).toBe(visible);
    state.plans.advanced.canHideShareBrand = true;
  });

  it('hides disabled features and respects the global feature switch', () => {
    state.plans.basic.canHideShareBrand = false;
    expect(
      renderToStaticMarkup(
        React.createElement(ShareBrandFeature, {
          level: StandardSubLevelEnum.basic,
          highlight: true
        })
      )
    ).toBe('');
    state.plans.basic.canHideShareBrand = true;
    state.enabled = false;
    expect(
      renderToStaticMarkup(
        React.createElement(ShareBrandFeature, {
          level: StandardSubLevelEnum.free,
          highlight: true
        })
      )
    ).toBe('');
    state.enabled = true;
  });
});
