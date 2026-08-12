import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { UserInputFormItemSchema } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  PresignChatFilePostUrlSchema,
  PresignDraftChatFilePostUrlSchema
} from '@fastgpt/global/openapi/core/chat/file/api';
import { getFileSelectRenderProps } from '@/components/core/app/formRender/utils';
import { sanitizeFileSelectValue } from '@/components/core/app/FileSelector/utils';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { resolveChatFileUploadMode } from '@/components/core/chat/ChatContainer/ChatBox/utils/file';
import {
  getDebugGlobalVariableFormProps,
  getDebugInputFormProps,
  getWorkflowStartDebugFileInput,
  getWorkflowStartDebugQuery
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebugInput';
import { getWorkflowDebugRuntimeContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowDebugContext';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';

const appId = '68ad85a7463006c963799a05';
const skillId = '68ad85a7463006c963799a06';
const chatId = 'file-upload-integration-chat';

describe('application file upload integration', () => {
  it.each([
    {
      name: '应用正式对话',
      chatType: ChatTypeEnum.chat,
      sourceType: ChatSourceTypeEnum.app,
      expected: 'runtime'
    },
    {
      name: '应用编辑器测试',
      chatType: ChatTypeEnum.test,
      sourceType: ChatSourceTypeEnum.app,
      expected: 'draft'
    },
    {
      name: 'Home Chat',
      chatType: ChatTypeEnum.home,
      sourceType: ChatSourceTypeEnum.app,
      expected: 'runtime'
    },
    {
      name: '应用分享链接',
      chatType: ChatTypeEnum.share,
      sourceType: ChatSourceTypeEnum.app,
      expected: 'runtime'
    },
    {
      name: 'Chat Agent Helper',
      chatType: ChatTypeEnum.test,
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      expected: 'runtime'
    },
    {
      name: 'Skill 编辑器',
      chatType: ChatTypeEnum.test,
      sourceType: ChatSourceTypeEnum.skillEdit,
      expected: 'draft'
    }
  ])('$name selects the $expected upload endpoint', ({ chatType, sourceType, expected }) => {
    expect(resolveChatFileUploadMode({ chatType, sourceType })).toBe(expected);
  });

  it('passes App, share and Helper targets through the runtime upload contract', () => {
    const runtimeBase = {
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 1024,
      chatId
    };

    expect(
      PresignChatFilePostUrlSchema.parse({
        ...runtimeBase,
        ...toChatAuthApiTarget({
          sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: appId }
        })
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId,
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 1024
    });

    expect(
      PresignChatFilePostUrlSchema.parse({
        ...runtimeBase,
        ...toChatAuthApiTarget({
          sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: appId },
          outLinkAuthData: { shareId: 'share-id', outLinkUid: 'share-user-id' }
        })
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: { shareId: 'share-id', outLinkUid: 'share-user-id' }
    });

    expect(
      PresignChatFilePostUrlSchema.parse({
        ...runtimeBase,
        ...toChatAuthApiTarget({
          sourceTarget: {
            sourceType: ChatSourceTypeEnum.chatAgentHelper,
            sourceId: appId
          }
        })
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: appId
    });
  });

  it('passes App and Skill editor targets plus the unsaved config through the draft contract', () => {
    const fileSelectConfig = {
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['.dat']
    };
    const draftBase = {
      filename: 'draft.dat',
      chatId,
      fileSelectConfig
    };

    expect(PresignDraftChatFilePostUrlSchema.parse({ ...draftBase, appId })).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId,
      fileSelectConfig
    });
    expect(PresignDraftChatFilePostUrlSchema.parse({ ...draftBase, skillId })).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId,
      fileSelectConfig
    });
  });

  it('shares the draft App target and chatId between workflow debug fields and execution', () => {
    expect(getWorkflowDebugRuntimeContext({ appId, chatId })).toEqual({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: appId },
      chatId,
      outLinkAuthData: {},
      fileUploadMode: 'draft'
    });

    const fileInput = getWorkflowStartDebugFileInput({
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      fileSelectConfig: { canSelectFile: true, canSelectImg: true, maxFiles: 2 }
    });
    expect(fileInput).toMatchObject({
      key: NodeOutputKeyEnum.userFiles,
      canLocalUpload: true,
      canUrlUpload: true,
      canSelectFile: true,
      canSelectImg: true,
      maxFiles: 2
    });

    expect(
      getWorkflowStartDebugQuery({
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        nodeVariables: {
          [NodeInputKeyEnum.userChatInput]: 'summarize',
          [NodeOutputKeyEnum.userFiles]: [
            {
              key: 'chat/app/team/user/file-upload-integration-chat/report.pdf',
              name: 'report.pdf',
              type: ChatFileTypeEnum.file
            },
            {
              url: 'https://example.com/image.png',
              name: 'image.png',
              type: ChatFileTypeEnum.image
            }
          ]
        }
      })
    ).toEqual([
      {
        file: {
          key: 'chat/app/team/user/file-upload-integration-chat/report.pdf',
          url: '',
          name: 'report.pdf',
          type: ChatFileTypeEnum.file
        }
      },
      {
        file: {
          url: 'https://example.com/image.png',
          name: 'image.png',
          type: ChatFileTypeEnum.image
        }
      },
      { text: { content: 'summarize' } }
    ]);
  });

  it('preserves upload parameters for global variables, plugin inputs and interactive forms', () => {
    expect(
      getDebugGlobalVariableFormProps({
        key: 'globalFiles',
        label: 'Global files',
        description: '',
        type: VariableInputEnum.file,
        valueType: WorkflowIOValueTypeEnum.arrayString,
        required: false
      })
    ).toMatchObject({
      canSelectFile: true,
      canLocalUpload: true
    });

    expect(
      getDebugInputFormProps({
        key: 'pluginFiles',
        label: 'Plugin files',
        renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
        valueType: WorkflowIOValueTypeEnum.arrayString,
        value: [],
        canSelectAudio: true,
        canLocalUpload: false,
        canUrlUpload: true
      })
    ).toMatchObject({
      canSelectFile: true,
      canSelectAudio: true,
      canLocalUpload: false,
      canUrlUpload: true
    });

    const interactiveFile = UserInputFormItemSchema.parse({
      key: 'formFiles',
      label: 'Form files',
      type: FlowNodeInputTypeEnum.fileSelect,
      valueType: WorkflowIOValueTypeEnum.arrayString,
      value: [],
      required: false,
      canSelectVideo: true,
      canLocalUpload: false,
      canUrlUpload: true
    });
    expect(getFileSelectRenderProps(interactiveFile)).toMatchObject({
      canSelectFile: true,
      canSelectVideo: true,
      canLocalUpload: false,
      canUrlUpload: true
    });
  });

  it('stores local uploads as key values and URL inputs as URL values', () => {
    expect(
      sanitizeFileSelectValue([
        {
          key: 'chat/app/team/user/chat-id/local.pdf',
          url: 'https://temporary-preview.example.com/local.pdf',
          name: 'local.pdf',
          type: ChatFileTypeEnum.file
        },
        {
          url: 'https://example.com/remote.pdf',
          name: 'remote.pdf',
          type: ChatFileTypeEnum.file
        }
      ])
    ).toEqual([
      {
        key: 'chat/app/team/user/chat-id/local.pdf',
        name: 'local.pdf',
        type: ChatFileTypeEnum.file
      },
      {
        url: 'https://example.com/remote.pdf',
        name: 'remote.pdf',
        type: ChatFileTypeEnum.file
      }
    ]);
  });
});
