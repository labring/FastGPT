import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  addPreviewUrlToChatItems,
  presignVariablesFileUrls
} from '@fastgpt/service/core/chat/utils';

const { mockCreateGetChatFileURL } = vi.hoisted(() => ({
  mockCreateGetChatFileURL: vi.fn()
}));

type MockCreatePreviewOptions = {
  expiredHours?: number;
  mode?: 'short-proxy' | 'short-redirect' | 'presigned';
};

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createGetChatFileURL: mockCreateGetChatFileURL
  }),
  createChatFilePreviewUrlGetter: (options?: MockCreatePreviewOptions) => async (key: string) => {
    const { url } = await mockCreateGetChatFileURL({
      key,
      external: true,
      ...options
    });
    return url;
  }
}));

describe('presignVariablesFileUrls', () => {
  beforeEach(() => {
    mockCreateGetChatFileURL.mockReset();
  });

  it('为全局变量文件补预览 url，并保留已有 type', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/image.png'
    });

    const variables = {
      imageFiles: [
        {
          key: 'chat/files/image.png',
          name: 'image.png',
          type: ChatFileTypeEnum.image
        }
      ]
    };

    const result = await presignVariablesFileUrls({
      variables,
      variableConfig: [
        {
          key: 'imageFiles',
          label: '图片',
          type: VariableInputEnum.file,
          valueType: WorkflowIOValueTypeEnum.arrayString
        }
      ]
    });

    expect(result?.imageFiles).toEqual([
      {
        key: 'chat/files/image.png',
        name: 'image.png',
        type: ChatFileTypeEnum.image,
        url: 'https://preview.example.com/image.png'
      }
    ]);
    expect(variables.imageFiles[0]).not.toHaveProperty('url');
    expect(mockCreateGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/files/image.png',
      external: true
    });
  });

  it('没有 S3 key 的文件值不请求预览 url，并保留已有 type', async () => {
    const result = await presignVariablesFileUrls({
      variables: {
        files: [
          {
            url: 'https://example.com/doc.pdf',
            name: 'doc.pdf',
            type: ChatFileTypeEnum.file
          }
        ]
      },
      variableConfig: [
        {
          key: 'files',
          label: '文件',
          type: VariableInputEnum.file,
          valueType: WorkflowIOValueTypeEnum.arrayString
        }
      ]
    });

    expect(result?.files).toEqual([
      {
        url: 'https://example.com/doc.pdf',
        name: 'doc.pdf',
        type: ChatFileTypeEnum.file
      }
    ]);
    expect(mockCreateGetChatFileURL).not.toHaveBeenCalled();
  });

  it('保留全局变量文件已有 type，不用文件名推断覆盖', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/photo.png'
    });

    const result = await presignVariablesFileUrls({
      variables: {
        files: [
          {
            key: 'chat/files/photo.png',
            name: 'photo.png',
            type: ChatFileTypeEnum.file
          }
        ]
      },
      variableConfig: [
        {
          key: 'files',
          label: '文件',
          type: VariableInputEnum.file,
          valueType: WorkflowIOValueTypeEnum.arrayString
        }
      ]
    });

    expect(result?.files).toEqual([
      {
        key: 'chat/files/photo.png',
        name: 'photo.png',
        type: ChatFileTypeEnum.file,
        url: 'https://preview.example.com/photo.png'
      }
    ]);
  });

  it('只重建文件变量，保留非文件变量引用，避免深拷贝大对象', async () => {
    const payload = {
      nested: {
        items: Array.from({ length: 10 }, (_, index) => ({ index }))
      }
    };
    const variables = {
      payload,
      files: [
        {
          url: 'https://example.com/doc.pdf',
          name: 'doc.pdf'
        }
      ]
    };

    const result = await presignVariablesFileUrls({
      variables,
      variableConfig: [
        {
          key: 'files',
          label: '文件',
          type: VariableInputEnum.file,
          valueType: WorkflowIOValueTypeEnum.arrayString
        }
      ]
    });

    expect(result).not.toBe(variables);
    expect(result?.payload).toBe(payload);
    expect(result?.files).not.toBe(variables.files);
    expect(variables.files[0]).not.toHaveProperty('type');
  });
});

describe('addPreviewUrlToChatItems', () => {
  beforeEach(() => {
    mockCreateGetChatFileURL.mockReset();
  });

  it('兼容缺少 params 的历史 interactive 数据，不阻断历史加载', async () => {
    const histories = [
      {
        obj: 'AI',
        value: [
          {
            interactive: {
              type: 'userInput'
            }
          }
        ]
      }
    ];

    await expect(addPreviewUrlToChatItems(histories as any, 'chatFlow')).resolves.toBeUndefined();
    expect(mockCreateGetChatFileURL).not.toHaveBeenCalled();
  });

  it('为历史 interactive fileSelect 值补预览 url 和 type', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/image.png'
    });

    const histories = [
      {
        obj: 'AI',
        value: [
          {
            interactive: {
              type: 'userInput',
              params: {
                inputForm: [
                  {
                    key: 'upload',
                    type: FlowNodeInputTypeEnum.fileSelect,
                    value: [
                      {
                        key: 'chat/files/image.png',
                        name: 'image.png',
                        type: ChatFileTypeEnum.image
                      }
                    ]
                  }
                ]
              }
            }
          }
        ]
      }
    ];

    await addPreviewUrlToChatItems(histories as any, 'chatFlow');

    expect(histories[0].value[0].interactive.params.inputForm[0].value).toEqual([
      {
        key: 'chat/files/image.png',
        name: 'image.png',
        type: ChatFileTypeEnum.image,
        url: 'https://preview.example.com/image.png'
      }
    ]);
    expect(mockCreateGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/files/image.png',
      external: true
    });
  });

  it('为 workflowTool 历史输入中的 fileSelect 值补预览 url', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/doc.pdf'
    });

    const histories = [
      {
        obj: 'Human',
        value: [
          {
            text: {
              content: JSON.stringify([
                {
                  renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
                  value: [
                    {
                      key: 'chat/files/doc.pdf',
                      name: 'doc.pdf',
                      type: ChatFileTypeEnum.file
                    }
                  ]
                }
              ])
            }
          }
        ]
      }
    ];

    await addPreviewUrlToChatItems(histories as any, 'workflowTool');

    expect(JSON.parse(histories[0].value[0].text.content)).toEqual([
      {
        renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
        value: [
          {
            key: 'chat/files/doc.pdf',
            name: 'doc.pdf',
            type: ChatFileTypeEnum.file,
            url: 'https://preview.example.com/doc.pdf'
          }
        ]
      }
    ]);
    expect(mockCreateGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/files/doc.pdf',
      external: true
    });
  });

  it('重新签发 Sandbox 工具文件链接并隐藏内部 fileRefs', async () => {
    const oldUrl = 'https://old.example.com/file-token';
    const newUrl = 'https://new.example.com/file-token';
    mockCreateGetChatFileURL.mockResolvedValueOnce({ url: newUrl });
    const histories = [
      {
        obj: 'AI',
        value: [
          {
            tools: [
              {
                id: 'call_file',
                toolName: 'Sandbox/Get File URL',
                toolAvatar: '',
                functionName: 'sandbox_get_file_url',
                params: '{}',
                response: JSON.stringify([{ fileUrl: oldUrl, filename: 'report.csv' }]),
                fileRefs: [
                  {
                    key: 'chat/app/app-1/user-1/chat-1/report.csv',
                    filename: 'report.csv',
                    url: oldUrl
                  }
                ]
              }
            ]
          },
          {
            text: {
              content: `[report.csv](${oldUrl})`
            }
          }
        ]
      }
    ];

    await addPreviewUrlToChatItems(histories as any, 'chatFlow');

    expect(JSON.parse(histories[0].value[0].tools[0].response)).toEqual([
      { fileUrl: newUrl, filename: 'report.csv' }
    ]);
    expect(histories[0].value[0].tools[0]).not.toHaveProperty('fileRefs');
    expect(histories[0].value[1].text.content).toBe(`[report.csv](${newUrl})`);
    expect(mockCreateGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/app/app-1/user-1/chat-1/report.csv',
      external: true
    });
  });
});
