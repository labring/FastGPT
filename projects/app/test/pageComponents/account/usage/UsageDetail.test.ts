import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { UsageListItemType } from '@fastgpt/global/support/wallet/usage/type';
import UsageDetail from '@/pageComponents/account/usage/UsageDetail';

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
// 仅去掉弹窗 Portal 和成员信息依赖，明细表格及列选择逻辑执行真实组件。
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));
vi.mock('@/pageComponents/account/usage/UsageMember', () => ({ UsageMember: () => null }));

/** 渲染实际明细，读取用户可见的表头和单元格，避免依赖样式或内部状态。 */
const renderTable = (list: UsageListItemType['list']) => {
  const usage: UsageListItemType = {
    id: '68ad85a7463006c963799a07',
    time: new Date('2026-11-12T00:00:00Z'),
    appName: 'Voice input',
    source: UsageSourceEnum.fastgpt,
    totalPoints: list.reduce((sum, item) => sum + item.amount, 0),
    list,
    sourceMember: { name: 'Member', status: TeamMemberStatusEnum.active }
  };
  const dom = new JSDOM(
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(UsageDetail, { usage, onClose: () => undefined })
      )
    )
  );
  try {
    const text = (selector: string) =>
      Array.from(dom.window.document.querySelectorAll(selector), (element) => element.textContent);
    return { headers: text('thead th'), cells: text('tbody td') };
  } finally {
    dom.window.close();
  }
};

describe('UsageDetail STT quantities', () => {
  it.each([
    { quantity: { totalTokens: 77 }, header: 'account_usage:token_length', value: '77' },
    { quantity: { totalTokens: 0 }, header: 'account_usage:token_length', value: '0' },
    { quantity: { duration: 3 }, header: 'account_usage:duration_seconds', value: '3' },
    { quantity: { duration: 0 }, header: 'account_usage:duration_seconds', value: '0' },
    { quantity: { tokens: 77 }, header: 'account_usage:token_length', value: '77' }
  ])('shows only the stored quantity column for $quantity', ({ quantity, header, value }) => {
    const { headers, cells } = renderTable([{ moduleName: 'STT', amount: 1.25, ...quantity }]);
    expect(headers).toEqual([
      'account_usage:module_name',
      header,
      'account_usage:total_points_consumed'
    ]);
    expect(cells).toEqual(['STT', value, '1.25']);
  });

  it.each([
    { inputTokens: 125, outputTokens: 17 },
    { inputTokens: 125, outputTokens: 0 },
    { inputTokens: 0, outputTokens: 17 },
    { inputTokens: 0, outputTokens: 0 }
  ])('shows split counters including zero without a total or duration column: %j', (quantities) => {
    const { headers, cells } = renderTable([{ moduleName: 'STT', amount: 0, ...quantities }]);
    expect(headers).toEqual([
      'account_usage:module_name',
      'account_usage:input_token_length',
      'account_usage:output_token_length',
      'account_usage:total_points_consumed'
    ]);
    expect(cells).toEqual([
      'STT',
      String(quantities.inputTokens),
      String(quantities.outputTokens),
      '0'
    ]);
  });

  it('keeps missing quantities distinct from zero when historical and new usage share a table', () => {
    const { headers, cells } = renderTable([
      { moduleName: 'Old STT', amount: 1.25, tokens: 77 },
      { moduleName: 'Duration STT', amount: 0, duration: 0 }
    ]);
    expect(headers).toEqual([
      'account_usage:module_name',
      'account_usage:token_length',
      'account_usage:duration_seconds',
      'account_usage:total_points_consumed'
    ]);
    expect(cells).toEqual(['Old STT', '77', '-', '1.25', 'Duration STT', '-', '0', '0']);
  });
});
