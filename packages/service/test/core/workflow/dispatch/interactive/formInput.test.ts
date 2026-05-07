import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchFormInput } from '@fastgpt/service/core/workflow/dispatch/interactive/formInput';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  createGetChatFileURL: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createGetChatFileURL: mocks.createGetChatFileURL
  })
}));

const buildProps = (text: string) =>
  ({
    histories: [{ id: 'h1' }, { id: 'h2' }],
    node: {
      isEntry: true
    },
    params: {
      [NodeInputKeyEnum.description]: '',
      [NodeInputKeyEnum.userInputForms]: [
        {
          key: 'files',
          label: 'Files',
          type: FlowNodeInputTypeEnum.fileSelect,
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          value: [],
          required: false
        }
      ]
    },
    query: [
      {
        text: {
          content: text
        }
      }
    ],
    lastInteractive: {
      type: 'userInput'
    }
  }) as any;

describe('dispatchFormInput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts fileSelect keys to urls and filters invalid file objects', async () => {
    mocks.createGetChatFileURL.mockImplementation(async ({ key }: { key: string }) => ({
      url: `https://files.example/${key}`
    }));

    const result = await dispatchFormInput(
      buildProps(
        JSON.stringify({
          files: [
            { key: 'chat/app/user/chat/file.png' },
            { url: 'https://example.com/file.pdf' },
            { rawFile: {}, icon: 'data:image/png;base64,large' },
            null,
            {},
            ''
          ]
        })
      )
    );

    expect(mocks.createGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/app/user/chat/file.png',
      external: true
    });
    expect(result.data?.files).toEqual([
      'https://files.example/chat/app/user/chat/file.png',
      'https://example.com/file.pdf'
    ]);
    expect(result.data?.[NodeOutputKeyEnum.formInputResult]).toEqual({
      files: ['https://files.example/chat/app/user/chat/file.png', 'https://example.com/file.pdf']
    });
  });

  it('returns an interactive form when the node is not ready to consume input', async () => {
    const props = buildProps('{}');
    props.node.isEntry = false;

    const result = await dispatchFormInput(props);

    expect(result[DispatchNodeResponseKeyEnum.interactive]).toEqual({
      type: 'userInput',
      params: {
        description: '',
        inputForm: props.params[NodeInputKeyEnum.userInputForms]
      }
    });
    expect(props.node.isEntry).toBe(false);
  });

  it('does not pass non-array fileSelect objects through', async () => {
    const result = await dispatchFormInput(
      buildProps(
        JSON.stringify({
          files: { icon: 'data:image/png;base64,large' }
        })
      )
    );

    expect(result.data?.files).toEqual([]);
  });
});
