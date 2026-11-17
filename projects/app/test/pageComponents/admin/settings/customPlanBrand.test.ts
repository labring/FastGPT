import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  change: undefined as undefined | ((event: { target: { checked: boolean } }) => void),
  submit: undefined as undefined | (() => Promise<void>)
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { show_outlink_brand: true } })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => children,
  Flex: ({ children }: { children?: React.ReactNode }) => children,
  Grid: ({ children }: { children?: React.ReactNode }) => children,
  Input: () => null,
  Switch: (props: { onChange: typeof state.change }) => {
    state.change = props.onChange;
    return null;
  },
  Button: ({ onClick, children }: { onClick: typeof state.submit; children: React.ReactNode }) => {
    if (children === 'admin:confirm') state.submit = onClick;
    return null;
  }
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children, footer)
}));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/admin/Settings/PlanComponents', () => ({
  FeatureRow: () => null,
  getColumnFeatures: () => [],
  EditPlanModal: () => null
}));

import { CustomPlanModal } from '@/pageComponents/admin/config/components/FormField/StandardPlans';

beforeEach(() => {
  state.change = undefined;
  state.submit = undefined;
});

describe('custom plan independent branding permission', () => {
  it('allows enabling and clearing the branding permission without dropping other custom plan fields', async () => {
    for (const enabled of [true, false]) {
      const onChange = vi.fn();
      renderToStaticMarkup(
        React.createElement(CustomPlanModal, {
          planMap: {
            custom: {
              name: 'custom',
              customFormUrl: 'https://form.example.test',
              canHideShareBrand: !enabled
            }
          } as never,
          onChange,
          onClose: vi.fn()
        })
      );
      expect(state.change).toBeDefined();
      state.change!({ target: { checked: enabled } });
      await state.submit!();
      expect(onChange).toHaveBeenCalledWith({
        custom: {
          name: 'custom',
          customFormUrl: 'https://form.example.test',
          canHideShareBrand: enabled
        }
      });
    }
  });
});
