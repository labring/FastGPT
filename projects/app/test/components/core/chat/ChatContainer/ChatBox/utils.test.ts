import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { stripChatValueFileUrls } from '@/components/core/chat/ChatContainer/ChatBox/utils/chatValue';
import { refreshSubmittedFormInteractiveValues } from '@/components/core/chat/ChatContainer/ChatBox/utils/interactive';
import {
  mergeResumeCompletedChatRecords,
  shouldAppendResumeInteractive,
  shouldReplaceResumeAiValue,
  shouldResetResumeAiPlaceholder
} from '@/components/core/chat/ChatContainer/ChatBox/utils/resume';

describe('stripChatValueFileUrls', () => {
  it('removes signed urls from keyed files before sending messages', () => {
    const value: ChatItemValueItemType[] = [
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          key: 'chat/files/image.png',
          url: 'https://preview.example.com/image.png'
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'external.pdf',
          url: 'https://external.example.com/external.pdf'
        }
      },
      {
        text: {
          content: 'hello'
        }
      }
    ];

    expect(stripChatValueFileUrls(value)).toEqual([
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          key: 'chat/files/image.png',
          url: ''
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'external.pdf',
          url: 'https://external.example.com/external.pdf'
        }
      },
      {
        text: {
          content: 'hello'
        }
      }
    ]);
    expect(value[0].file.url).toBe('https://preview.example.com/image.png');
  });
});

describe('shouldResetResumeAiPlaceholder', () => {
  it('should reset only before any resume output has been applied', () => {
    expect(
      shouldResetResumeAiPlaceholder({
        hasPreparedResumeAiRecord: false,
        hasReceivedResumeOutput: false
      })
    ).toBe(true);

    expect(
      shouldResetResumeAiPlaceholder({
        hasPreparedResumeAiRecord: false,
        hasReceivedResumeOutput: true
      })
    ).toBe(false);

    expect(
      shouldResetResumeAiPlaceholder({
        hasPreparedResumeAiRecord: true,
        hasReceivedResumeOutput: false
      })
    ).toBe(false);
  });
});

describe('shouldReplaceResumeAiValue', () => {
  it('does not replace loaded AI output with a resume placeholder', () => {
    expect(
      shouldReplaceResumeAiValue({
        hasExistingAiOutput: true,
        text: '',
        resetExistingValue: true
      })
    ).toBe(false);
  });

  it('can initialize an empty AI record as a resume placeholder', () => {
    expect(
      shouldReplaceResumeAiValue({
        hasExistingAiOutput: false,
        text: '',
        resetExistingValue: true
      })
    ).toBe(true);
  });

  it('can show resume unavailable text on an empty AI record', () => {
    expect(
      shouldReplaceResumeAiValue({
        hasExistingAiOutput: false,
        text: '停止中',
        resetExistingValue: false
      })
    ).toBe(true);
  });
});

describe('shouldAppendResumeInteractive', () => {
  it('does not append an unsubmitted resume interactive over a submitted one', () => {
    const baseInteractive = {
      type: 'userInput',
      entryNodeIds: ['form-node-id'],
      memoryEdges: [],
      nodeOutputs: [],
      usageId: 'usage-id',
      params: {
        description: '',
        inputForm: [
          {
            type: 'fileSelect',
            key: 'File',
            label: 'File',
            valueType: 'arrayString',
            description: '',
            required: false,
            defaultValue: '',
            canLocalUpload: true,
            canSelectFile: true,
            maxFiles: 5,
            value: []
          }
        ]
      }
    } as const;

    expect(
      shouldAppendResumeInteractive({
        existingValues: [
          {
            interactive: {
              ...baseInteractive,
              params: {
                ...baseInteractive.params,
                submitted: true,
                inputForm: [
                  {
                    ...baseInteractive.params.inputForm[0],
                    value: [
                      {
                        key: 'chat/file.docx',
                        name: 'file.docx',
                        type: 'file',
                        url: 'http://localhost:3000/api/system/file/download/file.docx'
                      }
                    ]
                  }
                ]
              }
            }
          }
        ],
        incomingInteractive: baseInteractive
      })
    ).toBe(false);
  });

  it('appends a new interactive when there is no submitted matching interactive', () => {
    expect(
      shouldAppendResumeInteractive({
        existingValues: [],
        incomingInteractive: {
          type: 'userInput',
          entryNodeIds: ['form-node-id'],
          memoryEdges: [],
          nodeOutputs: [],
          usageId: 'usage-id',
          params: {
            description: '',
            inputForm: [],
            submitted: false
          }
        }
      })
    ).toBe(true);
  });

  it('appends a repeated form node after a previous submitted form is no longer last', () => {
    const submittedInteractive = {
      type: 'userInput',
      entryNodeIds: ['form-node-id'],
      memoryEdges: [],
      nodeOutputs: [],
      usageId: 'first-usage-id',
      params: {
        description: '',
        inputForm: [],
        submitted: true
      }
    } as const;

    expect(
      shouldAppendResumeInteractive({
        existingValues: [
          {
            interactive: submittedInteractive
          },
          {
            text: {
              content: 'confirmed, continuing workflow'
            }
          }
        ],
        incomingInteractive: {
          ...submittedInteractive,
          usageId: 'second-usage-id',
          params: {
            ...submittedInteractive.params,
            submitted: false
          }
        }
      })
    ).toBe(true);
  });
});

describe('mergeResumeCompletedChatRecords', () => {
  it('preserves responseData replayed during resume when completed records overwrite the chat', () => {
    const responseChatId = 'ai-data-id';
    const currentRecords = [
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'loading',
        value: [{ text: { content: 'streaming' } }],
        responseData: [
          {
            id: 'node-response-id',
            nodeId: 'form-node-id',
            moduleName: '表单输入',
            moduleType: FlowNodeTypeEnum.formInput,
            formInputResult: {
              File: ['http://localhost:3000/api/system/file/download/file.docx']
            }
          }
        ]
      }
    ] as ChatSiteItemType[];
    const completedRecords = [
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [{ text: { content: 'done' } }],
        responseData: []
      }
    ] as ChatSiteItemType[];

    const result = mergeResumeCompletedChatRecords({
      currentRecords,
      completedRecords,
      responseChatId
    });

    expect(result[0].value).toEqual([{ text: { content: 'done' } }]);
    expect(result[0].responseData).toEqual(currentRecords[0].responseData);
  });

  it('does not duplicate responseData already present in completed records', () => {
    const responseChatId = 'ai-data-id';
    const responseData = [
      {
        id: 'node-response-id',
        nodeId: 'form-node-id',
        moduleName: '表单输入',
        moduleType: FlowNodeTypeEnum.formInput,
        formInputResult: {
          File: ['http://localhost:3000/api/system/file/download/file.docx']
        }
      }
    ];
    const currentRecords = [
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'loading',
        value: [{ text: { content: 'streaming' } }],
        responseData
      }
    ] as ChatSiteItemType[];
    const completedRecords = [
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [{ text: { content: 'done' } }],
        responseData
      }
    ] as ChatSiteItemType[];

    const result = mergeResumeCompletedChatRecords({
      currentRecords,
      completedRecords,
      responseChatId
    });

    expect(result[0].responseData).toHaveLength(1);
  });

  it('preserves hydrated submitted interactive values when completed records overwrite the chat', () => {
    const responseChatId = 'ai-data-id';
    const hydratedInteractive = {
      type: 'userInput',
      entryNodeIds: ['form-node-id'],
      memoryEdges: [],
      nodeOutputs: [],
      usageId: 'usage-id',
      params: {
        description: '',
        submitted: true,
        inputForm: [
          {
            type: 'fileSelect',
            key: 'File',
            label: 'File',
            valueType: 'arrayString',
            description: '',
            required: false,
            defaultValue: '',
            canLocalUpload: true,
            canSelectFile: true,
            maxFiles: 5,
            value: [
              {
                name: 'file.docx',
                url: 'https://example.com/file.docx'
              }
            ]
          }
        ]
      }
    };
    const currentRecords = [
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'loading',
        value: [{ interactive: hydratedInteractive }]
      }
    ] as ChatSiteItemType[];
    const completedRecords = [
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [
          {
            interactive: {
              ...hydratedInteractive,
              params: {
                ...hydratedInteractive.params,
                inputForm: [
                  {
                    ...hydratedInteractive.params.inputForm[0],
                    value: []
                  }
                ]
              }
            }
          }
        ]
      }
    ] as ChatSiteItemType[];

    const result = mergeResumeCompletedChatRecords({
      currentRecords,
      completedRecords,
      responseChatId
    });

    expect((result[0].value[0] as any).interactive.params.inputForm[0].value).toEqual([
      {
        name: 'file.docx',
        url: 'https://example.com/file.docx'
      }
    ]);
  });

  it('preserves hydrated submitted interactive values outside of the streaming response record', () => {
    const responseChatId = 'streaming-ai-data-id';
    const interactiveChatId = 'interactive-ai-data-id';
    const hydratedInteractive = {
      type: 'userInput',
      entryNodeIds: ['form-node-id'],
      memoryEdges: [],
      nodeOutputs: [],
      usageId: 'usage-id',
      params: {
        description: '',
        submitted: true,
        inputForm: [
          {
            type: 'fileSelect',
            key: 'File',
            label: 'File',
            valueType: 'arrayString',
            description: '',
            required: false,
            defaultValue: '',
            canLocalUpload: true,
            canSelectFile: true,
            maxFiles: 5,
            value: [
              {
                name: 'file.docx',
                url: 'https://example.com/file.docx'
              }
            ]
          }
        ]
      }
    };
    const currentRecords = [
      {
        id: interactiveChatId,
        dataId: interactiveChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [{ interactive: hydratedInteractive }]
      },
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'loading',
        value: [{ text: { content: 'streaming' } }]
      }
    ] as ChatSiteItemType[];
    const completedRecords = [
      {
        id: interactiveChatId,
        dataId: interactiveChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [
          {
            interactive: {
              ...hydratedInteractive,
              params: {
                ...hydratedInteractive.params,
                inputForm: [
                  {
                    ...hydratedInteractive.params.inputForm[0],
                    value: []
                  }
                ]
              }
            }
          }
        ]
      },
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [{ text: { content: 'done' } }]
      }
    ] as ChatSiteItemType[];

    const result = mergeResumeCompletedChatRecords({
      currentRecords,
      completedRecords,
      responseChatId
    });

    expect((result[0].value[0] as any).interactive.params.inputForm[0].value).toEqual([
      {
        name: 'file.docx',
        url: 'https://example.com/file.docx'
      }
    ]);
    expect(result[1].value).toEqual([{ text: { content: 'done' } }]);
  });

  it('preserves hydrated submitted interactive values when completed interactive dataId changes', () => {
    const responseChatId = 'streaming-ai-data-id';
    const hydratedInteractive = {
      type: 'userInput',
      entryNodeIds: ['form-node-id'],
      memoryEdges: [],
      nodeOutputs: [],
      usageId: 'usage-id',
      params: {
        description: '',
        submitted: true,
        inputForm: [
          {
            type: 'fileSelect',
            key: 'File',
            label: 'File',
            valueType: 'arrayString',
            description: '',
            required: false,
            defaultValue: '',
            canLocalUpload: true,
            canSelectFile: true,
            maxFiles: 5,
            value: [
              {
                name: 'file.docx',
                url: 'https://example.com/file.docx'
              }
            ]
          }
        ]
      }
    };
    const currentRecords = [
      {
        id: 'temporary-interactive-ai-data-id',
        dataId: 'temporary-interactive-ai-data-id',
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [{ interactive: hydratedInteractive }]
      },
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'loading',
        value: [{ text: { content: 'streaming' } }]
      }
    ] as ChatSiteItemType[];
    const completedRecords = [
      {
        id: 'persisted-interactive-ai-data-id',
        dataId: 'persisted-interactive-ai-data-id',
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [
          {
            interactive: {
              ...hydratedInteractive,
              params: {
                ...hydratedInteractive.params,
                inputForm: [
                  {
                    ...hydratedInteractive.params.inputForm[0],
                    value: []
                  }
                ]
              }
            }
          }
        ]
      },
      {
        id: responseChatId,
        dataId: responseChatId,
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [{ text: { content: 'done' } }]
      }
    ] as ChatSiteItemType[];

    const result = mergeResumeCompletedChatRecords({
      currentRecords,
      completedRecords,
      responseChatId
    });

    expect((result[0].value[0] as any).interactive.params.inputForm[0].value).toEqual([
      {
        name: 'file.docx',
        url: 'https://example.com/file.docx'
      }
    ]);
  });
});

describe('refreshSubmittedFormInteractiveValues', () => {
  it('writes resumed form input files back into the submitted interactive node', () => {
    const signedUrl =
      'http://localhost:3000/api/system/file/download/token?filename=H6%E4%BA%A7%E5%93%81%E6%A6%82%E8%BF%B0V1.5_tBF8kj.docx';
    const histories = [
      {
        id: 'ai-data-id',
        dataId: 'ai-data-id',
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [
          {
            interactive: {
              type: 'userInput',
              entryNodeIds: ['form-node-id'],
              memoryEdges: [],
              nodeOutputs: [],
              usageId: 'usage-id',
              params: {
                description: '',
                submitted: true,
                inputForm: [
                  {
                    type: 'fileSelect',
                    key: 'File',
                    label: 'File',
                    valueType: 'arrayString',
                    description: '',
                    required: false,
                    defaultValue: '',
                    canLocalUpload: true,
                    canSelectFile: true,
                    maxFiles: 5,
                    value: []
                  }
                ]
              }
            }
          }
        ]
      }
    ] as ChatSiteItemType[];

    const result = refreshSubmittedFormInteractiveValues({
      histories,
      nodeResponse: {
        id: 'node-response-id',
        nodeId: 'form-node-id',
        moduleName: '表单输入',
        moduleType: FlowNodeTypeEnum.formInput,
        formInputResult: {
          File: [signedUrl]
        }
      }
    });

    expect(result).not.toBe(histories);
    expect((result[0].value[0] as any).interactive.params.inputForm[0].value).toEqual([
      {
        name: 'H6产品概述V1.5_tBF8kj.docx',
        url: signedUrl
      }
    ]);
  });

  it('does not update unrelated interactive nodes', () => {
    const histories = [
      {
        id: 'ai-data-id',
        dataId: 'ai-data-id',
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [
          {
            interactive: {
              type: 'userInput',
              entryNodeIds: ['other-form-node-id'],
              memoryEdges: [],
              nodeOutputs: [],
              params: {
                description: '',
                submitted: true,
                inputForm: []
              }
            }
          }
        ]
      }
    ] as ChatSiteItemType[];

    const result = refreshSubmittedFormInteractiveValues({
      histories,
      nodeResponse: {
        id: 'node-response-id',
        nodeId: 'form-node-id',
        moduleName: '表单输入',
        moduleType: FlowNodeTypeEnum.formInput,
        formInputResult: {
          File: ['https://example.com/file.docx']
        }
      }
    });

    expect(result).toBe(histories);
  });

  it('falls back to the only submitted form interactive when node ids do not match', () => {
    const signedUrl =
      'http://localhost:3000/api/system/file/download/token?filename=%E6%96%87%E4%BB%B6.docx';
    const histories = [
      {
        id: 'ai-data-id',
        dataId: 'ai-data-id',
        obj: ChatRoleEnum.AI,
        status: 'finish',
        value: [
          {
            interactive: {
              type: 'userInput',
              entryNodeIds: ['different-node-id'],
              memoryEdges: [],
              nodeOutputs: [],
              params: {
                description: '',
                submitted: true,
                inputForm: [
                  {
                    type: 'fileSelect',
                    key: 'File',
                    label: 'File',
                    valueType: 'arrayString',
                    description: '',
                    required: false,
                    defaultValue: '',
                    canLocalUpload: true,
                    canSelectFile: true,
                    maxFiles: 5,
                    value: []
                  }
                ]
              }
            }
          }
        ]
      }
    ] as ChatSiteItemType[];

    const result = refreshSubmittedFormInteractiveValues({
      histories,
      nodeResponse: {
        id: 'node-response-id',
        nodeId: 'form-node-id',
        moduleName: '表单输入',
        moduleType: FlowNodeTypeEnum.formInput,
        formInputResult: {
          File: [signedUrl]
        }
      }
    });

    expect((result[0].value[0] as any).interactive.params.inputForm[0].value).toEqual([
      {
        name: '文件.docx',
        url: signedUrl
      }
    ]);
  });
});
