import { describe, expect, it } from 'vitest';
import { clientGetWorkflowToolRunUserQuery } from '@/components/core/chat/ChatContainer/PluginRunBox/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

describe('clientGetWorkflowToolRunUserQuery', () => {
  it('serializes visible values, preserves falsy overrides and defaults only missing variables', () => {
    const variables = {
      query: 'custom query',
      count: 0,
      enabled: false,
      empty: '',
      internal: 'secret'
    };
    const pluginInputs: FlowNodeInputItemType[] = [
      'query',
      'count',
      'enabled',
      'empty',
      'fallback',
      'internal'
    ].map((key) => ({
      key,
      defaultValue: `default-${key}`,
      renderTypeList: [
        key === 'internal' ? FlowNodeInputTypeEnum.hidden : FlowNodeInputTypeEnum.input
      ]
    }));

    const result = clientGetWorkflowToolRunUserQuery({ pluginInputs, variables });
    const inputs: FlowNodeInputItemType[] = JSON.parse(
      result.value.find((item) => item.text)?.text?.content ?? ''
    );

    expect(result).toMatchObject({ obj: ChatRoleEnum.Human, dataId: expect.any(String) });
    expect(inputs.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'query', value: 'custom query' },
      { key: 'count', value: 0 },
      { key: 'enabled', value: false },
      { key: 'empty', value: '' },
      { key: 'fallback', value: 'default-fallback' }
    ]);
  });

  it('forwards attachments alongside an empty input list', () => {
    const file = { type: ChatFileTypeEnum.image, url: 'http://example.com/image.png' };

    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs: [],
      variables: {},
      files: [file]
    });

    expect(result.value).toEqual([{ file }, { text: { content: '[]' } }]);
  });
});
