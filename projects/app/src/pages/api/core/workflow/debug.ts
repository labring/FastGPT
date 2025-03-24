import type { NextApiRequest, NextApiResponse } from 'next';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { defaultApp } from '@/web/core/app/constants';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PostWorkflowDebugResponse> {
  const {
    nodes = [],
    edges = [],
    variables = {},
    appId,
    query: requestQuery,
    histories: requestHistories
  } = req.body as PostWorkflowDebugProps & {
    query?: UserChatItemValueItemType[];
    histories?: ChatItemType[];
  };

  if (!nodes) {
    throw new Error('Prams Error');
  }
  if (!Array.isArray(nodes)) {
    throw new Error('Nodes is not array');
  }
  if (!Array.isArray(edges)) {
    throw new Error('Edges is not array');
  }

  const query_form_input: UserChatItemValueItemType[] = requestQuery || [
    {
      type: ChatItemValueTypeEnum.text,
      text: {
        content: '{"未知":"未知","数字":2}'
      }
    }
  ];
  const histories_form_input: ChatItemType[] = requestHistories || [
    {
      dataId: 'j2ywiLkIbMivBll5fzYvkuGK',
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: '123213'
          }
        }
      ]
    },
    {
      dataId: 'lRXcu9MtfCHlpUqeQWGSY4gu',
      obj: ChatRoleEnum.AI,
      value: [
        {
          type: ChatItemValueTypeEnum.interactive,
          interactive: {
            type: 'userInput',
            params: {
              description: '这是个表单输入',
              inputForm: [
                {
                  type: 'input',
                  key: '未知',
                  label: '未知',
                  description: '未知',
                  value: '',
                  maxLength: 20,
                  defaultValue: '未知',
                  valueType: 'string',
                  required: true,
                  list: [
                    {
                      label: '',
                      value: ''
                    }
                  ]
                },
                {
                  type: 'numberInput',
                  key: '数字',
                  label: '数字',
                  description: '数字',
                  value: '',
                  defaultValue: 2,
                  valueType: 'number',
                  required: false,
                  list: [
                    {
                      label: '',
                      value: ''
                    }
                  ],
                  max: 2,
                  min: 2
                }
              ]
            },
            entryNodeIds: ['mYvt4SN5KFwZ'],
            memoryEdges: [
              {
                source: 'workflowStartNodeId',
                target: 'oQKWr1cGFVBG',
                sourceHandle: 'workflowStartNodeId-source-right',
                targetHandle: 'oQKWr1cGFVBG-target-left',
                status: 'waiting'
              },
              {
                source: 'oQKWr1cGFVBG',
                target: 'uFnqha6Nx9qw',
                sourceHandle: 'oQKWr1cGFVBG-source-option1',
                targetHandle: 'uFnqha6Nx9qw-target-left',
                status: 'waiting'
              },
              {
                source: 'oQKWr1cGFVBG',
                target: '7kwgL1dVlwG6',
                sourceHandle: 'oQKWr1cGFVBG-source-option2',
                targetHandle: '7kwgL1dVlwG6-target-left',
                status: 'waiting'
              },
              {
                source: '7kwgL1dVlwG6',
                target: 'dZpDaSXFO0td',
                sourceHandle: '7kwgL1dVlwG6-source-right',
                targetHandle: 'dZpDaSXFO0td-target-left',
                status: 'waiting'
              },
              {
                source: 'dZpDaSXFO0td',
                target: 'uFnqha6Nx9qw',
                sourceHandle: 'dZpDaSXFO0td-source-option2',
                targetHandle: 'uFnqha6Nx9qw-target-left',
                status: 'waiting'
              },
              {
                source: 'workflowStartNodeId',
                target: 'mYvt4SN5KFwZ',
                sourceHandle: 'workflowStartNodeId-source-right',
                targetHandle: 'mYvt4SN5KFwZ-target-left',
                status: 'waiting'
              },
              {
                source: 'mYvt4SN5KFwZ',
                target: 'dfh8AqxAkoL4',
                sourceHandle: 'mYvt4SN5KFwZ-source-right',
                targetHandle: 'dfh8AqxAkoL4-target-left',
                status: 'waiting'
              }
            ],
            nodeOutputs: [
              {
                nodeId: 'workflowStartNodeId',
                key: NodeOutputKeyEnum.userChatInput,
                value: '123213'
              }
            ]
          }
        }
      ]
    }
  ];
  const query: UserChatItemValueItemType[] = requestQuery || [];
  const histories: ChatItemType[] = requestHistories || [];
  // || [
  //   {
  //     dataId: 'debug-history-1',
  //     obj: ChatRoleEnum.Human,
  //     value: [
  //       {
  //         type: ChatItemValueTypeEnum.text,
  //         text: {
  //           content: '启动工作流'
  //         }
  //       }
  //     ]
  //   },
  //   {
  //     dataId: 'debug-history-2',
  //     obj: ChatRoleEnum.AI,
  //     value: [
  //       {
  //         type: ChatItemValueTypeEnum.interactive,
  //         interactive: {
  //           type: 'userSelect',
  //           params: {
  //             description: '请选择操作',
  //             userSelectOptions: [
  //               { value: 'Confirm', key: 'option1' },
  //               { value: 'Cancel', key: 'option2' }
  //             ],
  //             // 已选择的值，使得此交互不会被getLastInteractiveValue返回
  //             userSelectedVal: 'Confirm'
  //           },
  //           entryNodeIds: ['nodeId1'],
  //           memoryEdges: [
  //             {
  //               source: 'workflowStartNodeId',
  //               target: 'nodeId1',
  //               sourceHandle: 'workflowStartNodeId-source-right',
  //               targetHandle: 'nodeId1-target-left',
  //               status: 'active'
  //             }
  //           ],
  //           nodeOutputs: [
  //             {
  //               nodeId: 'workflowStartNodeId',
  //               key: NodeOutputKeyEnum.userChatInput,
  //               value: '启动工作流'
  //             }
  //           ]
  //         }
  //       }
  //     ]
  //   },
  //   {
  //     dataId: 'bglb040v1wPQ3C1iNaDStPhm',
  //     obj: ChatRoleEnum.AI, // 使用枚举值
  //     value: [
  //       {
  //         type: ChatItemValueTypeEnum.interactive, // 使用枚举值
  //         interactive: {
  //           type: 'userSelect',
  //           params: {
  //             description: '你是谁',
  //             userSelectOptions: [
  //               {
  //                 value: 'Confirm',
  //                 key: 'option1'
  //               },
  //               {
  //                 value: 'Cancel',
  //                 key: 'option2'
  //               },
  //               {
  //                 value: 'wqeqweqwe',
  //                 key: 'y7eOdrYzYS5C'
  //               }
  //             ]
  //             // 重要：这里没有 userSelectedVal，所以这个交互会被getLastInteractiveValue返回
  //           },
  //           entryNodeIds: ['oQKWr1cGFVBG'],
  //           memoryEdges: [
  //             {
  //               source: 'workflowStartNodeId',
  //               target: 'oQKWr1cGFVBG',
  //               sourceHandle: 'workflowStartNodeId-source-right',
  //               targetHandle: 'oQKWr1cGFVBG-target-left',
  //               status: 'waiting'
  //             },
  //             {
  //               source: 'oQKWr1cGFVBG',
  //               target: 'uFnqha6Nx9qw',
  //               sourceHandle: 'oQKWr1cGFVBG-source-option1',
  //               targetHandle: 'uFnqha6Nx9qw-target-left',
  //               status: 'waiting'
  //             },
  //             {
  //               source: 'oQKWr1cGFVBG',
  //               target: '7kwgL1dVlwG6',
  //               sourceHandle: 'oQKWr1cGFVBG-source-option2',
  //               targetHandle: '7kwgL1dVlwG6-target-left',
  //               status: 'waiting'
  //             }
  //           ],
  //           nodeOutputs: [
  //             {
  //               nodeId: 'workflowStartNodeId',
  //               key: NodeOutputKeyEnum.userChatInput,
  //               value: 'Confirm'
  //             }
  //           ]
  //         }
  //       }
  //     ]
  //   }
  // ];
  /* user auth */
  const [{ teamId, tmbId }, { app }] = await Promise.all([
    authCert({
      req,
      authToken: true
    }),
    authApp({ req, authToken: true, appId, per: ReadPermissionVal })
  ]);

  // auth balance
  const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(tmbId);

  /* start process */
  const { flowUsages, flowResponses, debugResponse, newVariables } = await dispatchWorkFlow({
    res,
    requestOrigin: req.headers.origin,
    mode: 'debug',
    timezone,
    externalProvider,
    uid: tmbId,

    runningAppInfo: {
      id: app._id,
      teamId: app.teamId,
      tmbId: app.tmbId
    },
    runningUserInfo: {
      teamId,
      tmbId
    },

    runtimeNodes: nodes,
    runtimeEdges: edges,
    variables,
    query: query,
    chatConfig: defaultApp.chatConfig,
    histories: histories,
    stream: false,
    maxRunTimes: WORKFLOW_MAX_RUN_TIMES
  });

  createChatUsage({
    appName: `${app.name}-Debug`,
    appId,
    teamId,
    tmbId,
    source: UsageSourceEnum.fastgpt,
    flowUsages
  });

  return {
    ...debugResponse,
    newVariables,
    flowResponses
  };
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
