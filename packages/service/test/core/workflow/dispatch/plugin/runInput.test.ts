import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchPluginInput } from '@fastgpt/service/core/workflow/dispatch/plugin/runInput';
import {
  getWorkflowFileContext,
  runWithContext
} from '@fastgpt/service/core/workflow/utils/context';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const { mockRegisterInputFile, mockResolveInputFile } = vi.hoisted(() => ({
  mockRegisterInputFile: vi.fn(),
  mockResolveInputFile: vi.fn()
}));

const pluginInputNode = {
  inputs: [
    {
      key: 'upload',
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect]
    }
  ]
};

describe('dispatchPluginInput', () => {
  beforeEach(() => {
    mockRegisterInputFile.mockReset();
    mockResolveInputFile.mockReset();
  });

  const runWithMockFileContext = <T>(fn: () => Promise<T>) =>
    runWithContext(
      {
        mcpClientMemory: {},
        fileContext: {
          resolveInputFile: mockResolveInputFile
        } as any,
        fileRegistrar: {
          registerInputFile: mockRegisterInputFile
        } as any
      },
      fn
    );

  it('registers file params in the current workflow file context', async () => {
    mockRegisterInputFile
      .mockResolvedValueOnce({ modelUrl: 'https://preview.example.com/doc.pdf' })
      .mockResolvedValueOnce({ modelUrl: 'https://existing.example.com/image.png' });

    const result = await runWithMockFileContext(() =>
      dispatchPluginInput({
        params: {
          upload: [
            {
              type: ChatFileTypeEnum.file,
              key: 'chat/files/doc.pdf',
              name: 'doc.pdf'
            },
            {
              type: ChatFileTypeEnum.image,
              key: 'chat/files/image.png',
              name: 'image.png',
              url: 'https://existing.example.com/image.png'
            }
          ]
        },
        query: [],
        node: pluginInputNode
      } as any)
    );

    expect(result.data?.upload).toEqual([
      'https://preview.example.com/doc.pdf',
      'https://existing.example.com/image.png'
    ]);
    expect(result.data?.[NodeOutputKeyEnum.userFiles]).toEqual([]);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toEqual({});
    expect(mockRegisterInputFile).toHaveBeenNthCalledWith(1, {
      file: {
        type: ChatFileTypeEnum.file,
        key: 'chat/files/doc.pdf',
        name: 'doc.pdf'
      },
      source: 'plugin'
    });
    expect(mockRegisterInputFile).toHaveBeenNthCalledWith(2, {
      file: {
        type: ChatFileTypeEnum.image,
        key: 'chat/files/image.png',
        name: 'image.png'
      },
      source: 'plugin'
    });
  });

  it('registers plugin-called string url arrays in the current workflow file context', async () => {
    mockRegisterInputFile.mockResolvedValueOnce({
      modelUrl: 'https://external.example.com/doc.pdf'
    });

    const result = await runWithMockFileContext(() =>
      dispatchPluginInput({
        params: {
          upload: ['https://external.example.com/doc.pdf']
        },
        query: [],
        node: pluginInputNode
      } as any)
    );

    expect(result.data?.upload).toEqual(['https://external.example.com/doc.pdf']);
    expect(mockRegisterInputFile).toHaveBeenCalledWith({
      file: {
        type: ChatFileTypeEnum.file,
        name: 'doc.pdf',
        url: 'https://external.example.com/doc.pdf'
      },
      source: 'plugin'
    });
  });

  it('reuses a file already selected in the current child context', async () => {
    mockResolveInputFile.mockReturnValueOnce({
      modelUrl: 'https://parent.example.com/signed.pdf'
    });

    const result = await runWithMockFileContext(() =>
      dispatchPluginInput({
        params: {
          upload: ['https://parent.example.com/signed.pdf']
        },
        query: [],
        node: pluginInputNode
      } as any)
    );

    expect(result.data?.upload).toEqual(['https://parent.example.com/signed.pdf']);
    expect(mockRegisterInputFile).not.toHaveBeenCalled();
  });

  it('uses the real workflow context for scope checks, signing and external registration', async () => {
    const privateKey = 'chat/app/app-1/user-1/chat-1/report.pdf';
    const signedUrl = 'https://files.example.com/signed-report';
    const externalUrl = 'https://external.example.com/report.pdf';
    const getPreviewUrl = vi.fn().mockResolvedValue(signedUrl);
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        uid: 'user-1',
        chatId: 'chat-1'
      },
      maxFiles: 20,
      getPreviewUrl
    });

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar
      },
      async () => {
        const result = await dispatchPluginInput({
          params: {
            upload: [
              {
                type: ChatFileTypeEnum.file,
                key: privateKey,
                name: 'report.pdf'
              },
              externalUrl
            ]
          },
          query: [],
          node: pluginInputNode
        } as any);

        expect(result.data?.upload).toEqual([signedUrl, externalUrl]);
        expect(getPreviewUrl).toHaveBeenCalledTimes(1);
        expect(getWorkflowFileContext()?.resolve(signedUrl)?.source).toEqual({
          type: 'chatObject',
          objectKey: privateKey
        });
        expect(getWorkflowFileContext()?.resolve(externalUrl)?.source).toEqual({
          type: 'externalHttp',
          url: externalUrl
        });

        await expect(
          dispatchPluginInput({
            params: {
              upload: [
                {
                  type: ChatFileTypeEnum.file,
                  key: 'chat/app/app-1/user-1/other-chat/secret.pdf',
                  name: 'secret.pdf'
                }
              ]
            },
            query: [],
            node: pluginInputNode
          } as any)
        ).rejects.toThrow('does not belong to the current workflow');

        await expect(
          dispatchPluginInput({
            params: {
              upload: ['/api/system/file/d/relative-token']
            },
            query: [],
            node: pluginInputNode
          } as any)
        ).rejects.toThrow('Invalid workflow plugin file URL');
      }
    );
  });

  it('keeps legacy userFiles from top-level query files', async () => {
    const result = await dispatchPluginInput({
      params: {},
      query: [
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'top.pdf',
            url: 'https://query.example.com/top.pdf'
          }
        },
        {
          text: {
            content: 'ignored'
          }
        }
      ],
      node: {
        inputs: []
      }
    } as any);

    expect(result.data?.[NodeOutputKeyEnum.userFiles]).toEqual([
      'https://query.example.com/top.pdf'
    ]);
  });
});
