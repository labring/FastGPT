import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

const mocks = vi.hoisted(() => ({
  readPlans: vi.fn(),
  save: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
  revision: 7,
  effectiveConfig: {} as Record<string, unknown>
}));

vi.mock('@/web/admin/system/api', () => ({ getInitFormData: mocks.readPlans }));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: () => ({
    revision: mocks.revision,
    effectiveConfig: mocks.effectiveConfig,
    overrides: {},
    isLoading: false,
    isUpdating: false,
    refetch: mocks.refetch
  }),
  updateDomainConfigApi: mocks.save
}));
vi.mock('@/pageComponents/admin/useAdminPermission', () => ({
  useAdminPermission: () => ({
    isFieldVisible: () => false,
    filterConfigDataByEdition: (_domain: string, data: unknown) => data
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ children, onSave }: { children: React.ReactNode; onSave: () => void }) =>
    React.createElement(
      'main',
      null,
      children,
      React.createElement('button', { 'data-action': 'save', onClick: onSave }, 'save')
    )
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children, id }: { children: React.ReactNode; id: string }) =>
    React.createElement('section', { id }, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({ default: () => null }));

// 使用原生控件保留 React Hook Form 的真实输入及提交行为，不依赖 Chakra 环境。
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children);
  const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    function Input(props, ref) {
      return React.createElement('input', { ...props, ref });
    }
  );
  const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >(function Textarea(props, ref) {
    return React.createElement('textarea', { ...props, ref });
  });
  const Switch = ({
    isChecked,
    isDisabled,
    onChange
  }: {
    isChecked: boolean;
    isDisabled: boolean;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
  }) =>
    React.createElement('input', {
      type: 'checkbox',
      checked: isChecked,
      disabled: isDisabled,
      onChange
    });
  const Button = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    React.createElement('button', { onClick }, children);
  return {
    Box: Container,
    Flex: Container,
    HStack: Container,
    SimpleGrid: Container,
    Text: Container,
    Input,
    Textarea,
    Switch,
    Button
  };
});

let dom: JSDOM;
let container: HTMLDivElement;
let root: import('react-dom/client').Root;
let createRoot: typeof import('react-dom/client').createRoot;
let CommercialSettingComponent: typeof import('@/pageComponents/admin/settings/commercial').default;

const storedSubPlans: SubPlanType = {
  standard: {
    basic: {
      name: '真实基础套餐',
      price: 99,
      totalPoints: 4000,
      maxTeamMember: 5,
      maxAppAmount: 50,
      maxDatasetAmount: 30,
      maxDatasetSize: 6000,
      chatHistoryStoreDuration: 180
    }
  },
  extraDatasetSize: { price: 12 },
  extraPoints: { packages: [{ points: 1000, month: 1, price: 15 }] },
  planDescriptionUrl: 'https://example.com/plan',
  appRegistrationUrl: 'https://example.com/register',
  communitySupportTip: '已有套餐提示'
};

beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const key of [
    'window',
    'document',
    'Element',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'FileList',
    'Blob',
    'Event',
    'FocusEvent',
    'MouseEvent',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  ({ createRoot } = await import('react-dom/client'));
  ({ default: CommercialSettingComponent } =
    await import('@/pageComponents/admin/settings/commercial'));
});

beforeEach(() => {
  mocks.readPlans.mockReset();
  mocks.save.mockReset().mockResolvedValue({ results: [] });
  mocks.refetch.mockReset().mockResolvedValue(undefined);
  mocks.toast.mockReset();
  mocks.revision = 7;
  mocks.effectiveConfig = resolveSystemInstanceConfig({}).commercial;
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

const renderPayPage = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(CommercialSettingComponent)));
};

const savePayPage = async () => {
  const button = container.querySelector<HTMLButtonElement>('button[data-action="save"]')!;
  await act(async () => {
    button.click();
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  });
};

describe('subscription plans on the payment settings page', () => {
  it.each([
    { legacy: {}, revision: 0, label: 'legacy Pro document is absent' },
    { legacy: { fastgptPro: { auth: {} } }, revision: 7, label: 'legacy auth is empty' },
    {
      legacy: { fastgptPro: { auth: { github: { clientId: 'client', secret: 'secret' } } } },
      revision: 7,
      label: 'legacy auth has no SMS settings'
    }
  ])('loads and submits stored plans when $label', async ({ legacy, revision }) => {
    mocks.revision = revision;
    mocks.readPlans.mockResolvedValue({
      fastgpt: { subPlans: structuredClone(storedSubPlans) },
      ...legacy,
      subPlansRevision: revision
    });

    await renderPayPage();

    const planSwitch = container.querySelector<HTMLInputElement>('#plans input[type="checkbox"]')!;
    expect(planSwitch.disabled).toBe(false);
    expect(planSwitch.checked).toBe(true);
    expect(container.textContent).not.toContain('admin:plan_load_failed_tip');
    expect(
      container.querySelector<HTMLInputElement>('input[name="subPlans.planDescriptionUrl"]')?.value
    ).toBe(storedSubPlans.planDescriptionUrl);

    await savePayPage();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        subPlansExpectedRevision: revision,
        subPlans: expect.objectContaining({
          standard: expect.objectContaining({ basic: storedSubPlans.standard?.basic }),
          extraDatasetSizePrice: 12,
          extraPointsPackages: storedSubPlans.extraPoints?.packages,
          planDescriptionUrl: storedSubPlans.planDescriptionUrl,
          appRegistrationUrl: storedSubPlans.appRegistrationUrl,
          communitySupportTip: storedSubPlans.communitySupportTip
        })
      })
    );
  });

  it.each(['rejected', 'missing revision'])(
    'preserves existing plans on save when the plan read is %s',
    async (failure) => {
      if (failure === 'rejected') {
        mocks.readPlans.mockRejectedValue(new Error('Pro configuration unavailable'));
      } else {
        mocks.readPlans.mockResolvedValue({
          fastgpt: { subPlans: structuredClone(storedSubPlans) }
        });
      }

      await renderPayPage();

      const planSwitch = container.querySelector<HTMLInputElement>(
        '#plans input[type="checkbox"]'
      )!;
      expect(planSwitch.disabled).toBe(true);
      expect(container.textContent).toContain('admin:plan_load_failed_tip');

      await savePayPage();
      const request = mocks.save.mock.calls[0][0];
      expect(request).not.toHaveProperty('subPlans');
      expect(request).not.toHaveProperty('subPlansExpectedRevision');
      expect(request.items[0]).toMatchObject({ domain: 'commercial', expectedRevision: 7 });
    }
  );

  it('keeps the draft and does not submit or reload when plan and commercial revisions differ', async () => {
    mocks.readPlans.mockResolvedValue({
      fastgpt: { subPlans: structuredClone(storedSubPlans) },
      subPlansRevision: 8
    });
    await renderPayPage();

    const bankDescription = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="payment.bank.description"]'
    )!;
    await act(async () => {
      bankDescription.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        bankDescription,
        '收款草稿'
      );
      bankDescription.dispatchEvent(new Event('input', { bubbles: true }));
      bankDescription.blur();
    });

    const button = container.querySelector<HTMLButtonElement>('button[data-action="save"]')!;
    await act(async () => {
      button.click();
      await vi.waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith({
          status: 'warning',
          title: 'admin:revision_conflict_refresh_required'
        })
      );
    });

    expect(bankDescription.value).toBe('收款草稿');
    expect(
      container.querySelector<HTMLInputElement>('#plans input[type="checkbox"]')?.checked
    ).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.readPlans).toHaveBeenCalledTimes(1);
    expect(mocks.refetch).not.toHaveBeenCalled();
  });
});
