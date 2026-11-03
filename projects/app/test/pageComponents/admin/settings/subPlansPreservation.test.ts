import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';

const mocks = vi.hoisted(() => ({
  /** 套餐来源接口的返回值；为 null 表示读取被拒（未激活/已到期的 Pro） */
  proConfig: null as Record<string, unknown> | null,
  /** /admin/system/config/update 的实际请求体 */
  posts: [] as any[],
  /** 套餐读取已结算次数：挂载一次 + 保存后刷新一次，用于等待保存的后续刷新落地 */
  planReads: 0,
  /** 批量保存控制器完成写入的次数 */
  saved: 0,
  /** 配置域读取已结算次数：挂载一次 + 保存后刷新一次 */
  loads: 0
}));

// 支付页本轮按部署版本开放，但套餐仍来自 Pro 的 /proApi/admin/system/getConfig，
// license 中间件不放行该路径，未激活时读取必然失败。
vi.mock('@/web/admin/system/api', () => ({
  getInitFormData: () => {
    const read =
      mocks.proConfig === null
        ? Promise.reject(new Error('系统未激活'))
        : Promise.resolve(mocks.proConfig);

    // 按"已结算"计数：测试据此等待挂载读取与保存后的刷新真正落地
    return read.then(
      (res) => {
        mocks.planReads += 1;
        return res;
      },
      (error) => {
        mocks.planReads += 1;
        throw error;
      }
    );
  }
}));

// 保留真实 useDomainConfig / updateDomainConfigApi，只替换 HTTP 出口：
// POST 直接落到真实批量保存控制器，用 Mongo 证明"省略 subPlans 键"确实保留存量套餐。
vi.mock('@/web/common/api/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/web/common/api/request')>();
  const { batchUpdateDomainConfigs } =
    await import('@fastgpt/service/common/system/systemInstanceConfig/controller');

  return {
    ...actual,
    GET: async () => {
      const { resolveSystemInstanceConfig } =
        await import('@fastgpt/global/common/system/config/schema');
      mocks.loads += 1;
      return {
        revision: 0,
        overrides: {},
        effectiveConfig: resolveSystemInstanceConfig({}).commercial,
        secretKeys: []
      };
    },
    POST: async (_url: string, data: any) => {
      mocks.posts.push(data);
      const results = await batchUpdateDomainConfigs({
        items: data.items,
        subPlans: data.subPlans,
        actor: { actor: 'admin', userId: 'root' }
      });
      mocks.saved += 1;
      return results;
    }
  };
});

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn(), onClose: vi.fn(), closeAll: vi.fn() })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isProService: false, enableSaasAdminConfig: false } })
}));
// 套餐编辑器、布局母版与提示图标都不参与本次提交装配，替换为空组件保留真实表单与保存链路。
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ children, onSave }: { children: React.ReactNode; onSave?: () => void }) =>
    React.createElement(
      'main',
      null,
      children,
      React.createElement('button', { 'data-action': 'save', onClick: () => onSave?.() }, 'save')
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

let dom: JSDOM;
let container: HTMLDivElement;
let root: import('react-dom/client').Root;
let createRoot: typeof import('react-dom/client').createRoot;
let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
let QueryClient: typeof import('@tanstack/react-query').QueryClient;
let QueryClientProvider: typeof import('@tanstack/react-query').QueryClientProvider;
let CommercialSettingComponent: typeof import('@/pageComponents/admin/settings/commercial').default;

/** 旧版本存量套餐：读不到时最容易被空表单覆盖掉的就是这些计费字段 */
const storedSubPlans = {
  [SubTypeEnum.extraDatasetSize]: { price: 12 },
  [SubTypeEnum.extraPoints]: {
    packages: [{ points: 1000, month: 1, price: 15, activityBonusPoints: 0 }]
  },
  planDescriptionUrl: 'https://example.com/plan'
};

const seedStoredSubPlans = async () => {
  await MongoSystemConfigs.create(
    [
      {
        type: SystemConfigsTypeEnum.fastgpt,
        value: { subPlans: structuredClone(storedSubPlans) },
        // 与保存写入的新记录拉开时间差，保证按 createTime 取最新时不会歧义
        createTime: new Date(Date.now() - 60_000)
      }
    ],
    { ordered: true }
  );
};

const readLatestSubPlans = async () => {
  const doc = await MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt })
    .sort({ createTime: -1 })
    .lean();
  return doc?.value?.subPlans as Record<string, unknown> | undefined;
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
    const value = key === 'window' ? dom.window : dom.window[key];
    vi.stubGlobal(key, value);
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  }));
  // DOM 就绪后再加载渲染依赖，保留真实的 input/change 事件路径
  ({ createRoot } = await import('react-dom/client'));
  ({ ChakraProvider } = await import('@chakra-ui/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ default: CommercialSettingComponent } =
    await import('@/pageComponents/admin/settings/commercial'));
});

beforeEach(() => {
  mocks.proConfig = null;
  mocks.posts = [];
  mocks.planReads = 0;
  mocks.saved = 0;
  mocks.loads = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

/** 挂载真实支付配置页：套餐区块走真实 RHF 与 imperative handle，读取结果由 mocks.proConfig 决定。 */
const renderPayPage = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(ChakraProvider, null, React.createElement(CommercialSettingComponent))
      )
    )
  );
  // 等待挂载期配置与套餐读取结算：套餐读取成功会 reset 表单，失败则区块保持只读
  await act(async () => {
    await vi.waitFor(() => {
      expect(mocks.loads).toBe(1);
      expect(mocks.planReads).toBe(1);
    });
  });

  return container;
};

/** Chakra Switch 的开关本体是区块内唯一的 checkbox */
const planSwitch = () =>
  container.querySelector<HTMLInputElement>("section#plans input[type='checkbox']")!;

const fillBankDescription = async (value: string) => {
  const field = container.querySelector<HTMLTextAreaElement>(
    'textarea[name="payment.bank.description"]'
  )!;
  expect(field).toBeDefined();

  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.blur());

  return field;
};

const clickSave = async () => {
  const button = container.querySelector<HTMLButtonElement>('button[data-action="save"]')!;
  await act(async () => {
    button.click();
    // 保存写入与保存后的并行刷新（配置 refetch、套餐 reload）都在 act 内结算，避免状态更新外泄
    await vi.waitFor(() => {
      expect(mocks.saved).toBe(1);
      expect(mocks.loads).toBe(2);
      expect(mocks.planReads).toBe(2);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const bankDescription = '收款户名：示例科技有限公司';

describe('pay settings subPlans preservation', () => {
  it('omits subPlans and keeps stored plans when the Pro plan read is rejected', async () => {
    await seedStoredSubPlans();
    await renderPayPage();

    // 读取失败：套餐区块只读，并提示本次保存不会改动存量套餐
    expect(container.textContent).toContain('admin:plan_load_failed_tip');
    expect(planSwitch().disabled).toBe(true);

    await fillBankDescription(bankDescription);
    await clickSave();

    // 提交体不带 subPlans 键：键存在即整字段替换，缺失才表示"本次不修改套餐"
    expect('subPlans' in mocks.posts[0]).toBe(false);
    expect(await readLatestSubPlans()).toEqual(storedSubPlans);
    // 支付配置本身仍照常保存
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean()).toMatchObject({
      overrides: { payment: { bank: { description: bankDescription } } }
    });
  });

  it('submits the plans read from Pro so a successful load keeps managing subPlans', async () => {
    mocks.proConfig = {
      fastgpt: {
        feConfigs: {},
        systemEnv: {},
        subPlans: structuredClone(storedSubPlans)
      },
      fastgptPro: {}
    };
    await seedStoredSubPlans();
    await renderPayPage();

    expect(container.textContent).not.toContain('admin:plan_load_failed_tip');
    expect(planSwitch().disabled).toBe(false);

    await fillBankDescription(bankDescription);
    await clickSave();

    expect(mocks.posts[0]).toHaveProperty('subPlans');
    // 读取成功后仍按表单值整字段写回，计费字段不会因为加了守卫而丢失
    expect(await readLatestSubPlans()).toMatchObject({
      [SubTypeEnum.extraDatasetSize]: { price: 12 },
      [SubTypeEnum.extraPoints]: { packages: [{ points: 1000, price: 15 }] }
    });
  });
});
