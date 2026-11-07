import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StandardPlans from '@/pageComponents/admin/config/components/FormField/StandardPlans';
import type { StandSubPlanLevelMapType } from '@fastgpt/global/support/wallet/sub/type';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { show_outlink_brand: true } })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: any) =>
    React.createElement('div', { role: 'dialog' }, children, footer)
}));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: any) => React.createElement('label', {}, children)
}));
vi.mock('@/components/admin/Settings/PlanComponents', () => ({
  FeatureRow: () => null,
  getColumnFeatures: () => [],
  EditPlanModal: () => null
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', {}, children),
  Flex: ({ children }: any) => React.createElement('div', {}, children),
  Grid: ({ children }: any) => React.createElement('div', {}, children),
  Button: ({ children, onClick }: any) => React.createElement('button', { onClick }, children),
  Input: ({ value, onChange }: any) => React.createElement('input', { value, onChange })
}));

let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('StandardPlans custom configuration', () => {
  it('hides the branding switch while preserving a previously stored value on save', async () => {
    const onChange = vi.fn();
    const value = {
      custom: { name: 'Enterprise', customFormUrl: 'https://example.com', canHideShareBrand: true }
    } as StandSubPlanLevelMapType;
    await act(async () => root.render(React.createElement(StandardPlans, { value, onChange })));
    const editButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent === '点击配置套餐'
    );
    await act(async () => editButtons[3].click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).not.toContain('common:share_brand_control');
    expect(dialog.querySelector('input[type="checkbox"]')).toBeNull();
    expect(dialog.textContent).toContain('套餐购买链接');

    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === '确认'
    );
    await act(async () => confirm!.click());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ custom: expect.objectContaining({ canHideShareBrand: true }) })
    );
  });
});
