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

describe('PlanEditModal boolean overrides', () => {
  it.each([
    [undefined, 'inherit'],
    [true, 'enabled'],
    [false, 'disabled']
  ])('shows the stored override %s as %s', async (override, expected) => {
    await act(async () =>
      root.render(
        React.createElement(PlanEditModal, {
          data: { ...data, canHideShareBrandOverride: override, enableSandbox: override },
          subType: SubTypeEnum.standard,
          getData: vi.fn()
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
    expect((container.querySelector('#canHideShareBrandOverride') as HTMLSelectElement).value).toBe(
      expected
    );
    expect((container.querySelector('#enableSandbox') as HTMLSelectElement).value).toBe(expected);
  });

  it.each([
    [true, 'inherit', undefined],
    [false, 'inherit', undefined],
    [undefined, 'enabled', true],
    [false, 'enabled', true],
    [undefined, 'disabled', false],
    [true, 'disabled', false]
  ])('changes %s to %s and submits %s', async (initial, selection, expected) => {
    await act(async () =>
      root.render(
        React.createElement(PlanEditModal, {
          data: { ...data, canHideShareBrandOverride: initial, enableSandbox: initial },
          subType: SubTypeEnum.standard,
          getData: vi.fn()
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
    for (const id of ['canHideShareBrandOverride', 'enableSandbox']) {
      const select = container.querySelector(`#${id}`) as HTMLSelectElement;
      await act(async () => {
        select.value = selection;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      expect(select.value).toBe(selection);
    }
    const buttons = container.querySelectorAll('button');
    const submit = buttons[buttons.length - 1];
    await act(async () => submit.click());
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ canHideShareBrandOverride: expected, enableSandbox: expected })
    );
  });

  it.each([
    ['canHideShareBrandOverride', 'enableSandbox'],
    ['enableSandbox', 'canHideShareBrandOverride']
  ])('changes %s without changing %s', async (changed, unchanged) => {
    await act(async () =>
      root.render(
        React.createElement(PlanEditModal, {
          data: { ...data, canHideShareBrandOverride: true, enableSandbox: true },
          subType: SubTypeEnum.standard,
          getData: vi.fn()
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
    const select = container.querySelector(`#${changed}`) as HTMLSelectElement;
    await act(async () => {
      select.value = 'inherit';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    expect(select.value).toBe('inherit');
    expect((container.querySelector(`#${unchanged}`) as HTMLSelectElement).value).toBe('enabled');

    const buttons = container.querySelectorAll('button');
    await act(async () => buttons[buttons.length - 1].click());
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ [changed]: undefined, [unchanged]: true })
    );
  });

  it('shows the refreshed values when reopened after saving', async () => {
    const getData = vi.fn();
    const render = (override: boolean | undefined) =>
      root.render(
        React.createElement(PlanEditModal, {
          data: { ...data, canHideShareBrandOverride: override, enableSandbox: override },
          subType: SubTypeEnum.standard,
          getData
        })
      );
    await act(async () => render(false));
    await act(async () => container.querySelector('button')!.click());
    for (const id of ['canHideShareBrandOverride', 'enableSandbox']) {
      const select = container.querySelector(`#${id}`) as HTMLSelectElement;
      await act(async () => {
        select.value = 'inherit';
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }
    const buttons = container.querySelectorAll('button');
    await act(async () => buttons[buttons.length - 1].click());
    expect(getData).toHaveBeenCalledWith(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ canHideShareBrandOverride: undefined, enableSandbox: undefined })
    );

    await act(async () => render(undefined));
    await act(async () => container.querySelector('button')!.click());
    for (const id of ['canHideShareBrandOverride', 'enableSandbox']) {
      expect((container.querySelector(`#${id}`) as HTMLSelectElement).value).toBe('inherit');
    }
  });
});
