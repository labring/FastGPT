import { JSDOM } from 'jsdom';
import React, { act, forwardRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlanEditModal from '@/pageComponents/admin/plans/components/PlanEditModal';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';

const mocks = vi.hoisted(() => ({ update: vi.fn(), toast: vi.fn() }));
vi.mock('@/web/admin/wallet/plan/api', () => ({ updatePlan: mocks.update }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: unknown) => ({ runAsync: fn, loading: false })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ isOpen, children, footer }: any) =>
    isOpen ? React.createElement('div', {}, children, footer) : null
}));
vi.mock('@fastgpt/web/components/common/MyDivider', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', {}, children),
  FormControl: ({ children }: any) => React.createElement('div', {}, children),
  FormLabel: ({ children, htmlFor }: any) => React.createElement('label', { htmlFor }, children),
  Button: ({ children, onClick }: any) => React.createElement('button', { onClick }, children),
  Input: forwardRef<HTMLInputElement, any>(function MockInput(
    { id, type, onChange, onBlur, name },
    ref
  ) {
    return React.createElement('input', { id, type, onChange, onBlur, name, ref });
  }),
  Select: ({ id, value, onChange, children }: any) =>
    React.createElement('select', { id, value, onChange }, children),
  useDisclosure: () => {
    const [isOpen, setOpen] = useState(false);
    return { isOpen, onOpen: () => setOpen(true), onClose: () => setOpen(false) };
  }
}));

const data = {
  id: 'plan',
  teamId: 'team',
  teamName: 'Team',
  userName: 'User',
  type: SubTypeEnum.standard,
  level: StandardSubLevelEnum.basic,
  createTime: '2026-01-01T00:00:00Z',
  startTime: '2026-01-01T00:00:00Z',
  expiredTime: '2027-01-01T00:00:00Z',
  totalPoints: 100,
  surplusPoints: 50,
  extraDatasetSize: 0
};
let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.update.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('PlanEditModal branding override', () => {
  it.each([
    [undefined, 'inherit'],
    [true, 'enabled'],
    [false, 'disabled']
  ])('shows the stored override %s as %s', async (override, expected) => {
    await act(async () =>
      root.render(
        React.createElement(PlanEditModal, {
          data: { ...data, canHideShareBrandOverride: override },
          subType: SubTypeEnum.standard,
          getData: vi.fn()
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
    expect((container.querySelector('#canHideShareBrandOverride') as HTMLSelectElement).value).toBe(
      expected
    );
  });

  it.each([
    ['enabled', true],
    ['disabled', false],
    ['inherit', undefined]
  ])('submits %s as %s', async (selection, expected) => {
    await act(async () =>
      root.render(
        React.createElement(PlanEditModal, {
          data: { ...data, canHideShareBrandOverride: false },
          subType: SubTypeEnum.standard,
          getData: vi.fn()
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
    const select = container.querySelector('#canHideShareBrandOverride') as HTMLSelectElement;
    await act(async () => {
      select.value = selection;
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '确定'
    );
    await act(async () => submit!.click());
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ canHideShareBrandOverride: expected })
    );
  });
});
