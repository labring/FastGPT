import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import {
  type Props,
  failChatRound,
  finalizeChatRound,
  pushChatRecords,
  updateInteractiveChat
} from '@fastgpt/service/core/chat/saveChat';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import {
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatRoleEnum
} from '@fastgpt/global/core/chat/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

const axiosPostMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: {
      ...mod.axios,
      post: axiosPostMock
    }
  };
});

const originalChatLogUrl = serviceEnv.CHAT_LOG_URL;
const originalChatLogInterval = serviceEnv.CHAT_LOG_INTERVAL;
const originalChatLogSourceIdPrefix = serviceEnv.CHAT_LOG_SOURCE_ID_PREFIX;

const createMockProps = (
  overrides?: Partial<Props>,
  ids?: { appId?: string; teamId?: string; tmbId?: string }
): Props => ({
  chatId: 'test-chat-id',
  appId: ids?.appId || '67e0d5535c02d1d5cdede71f',
  teamId: ids?.teamId || '654a4107c32f3bf5f998452f',
  tmbId: ids?.tmbId || '65ab7007462ada7dbb899948',
  nodes: [
    {
      nodeId: 'node-1',
      name: 'test-node',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      inputs: [],
      outputs: []
    }
  ],
  source: 'online' as any,
  userContent: {
    obj: ChatRoleEnum.Human,
    value: [
      {
        text: {
          content: 'Hello, how are you?'
        }
      }
    ]
  },
  aiContent: {
    obj: ChatRoleEnum.AI,
    value: [
      {
        text: {
          content: 'I am doing well, thank you!'
        }
      }
    ]
  },
  durationSeconds: 2.5,
  ...overrides
});

describe('pushChatRecords', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;

  beforeEach(async () => {
    axiosPostMock.mockReset();

    // Create test user
    const user = await MongoUser.create({
      username: 'test-user',
      password: 'test-password'
    });
    // Create test team
    const team = await MongoTeam.create({
      name: 'Test Team',
      ownerId: user._id,
      avatar: 'test-avatar',
      createTime: new Date(),
      balance: 0,
      teamDomain: 'test-domain'
    });
    testTeamId = String(team._id);

    // Create team member
    const teamMember = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      name: 'Test Member',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: true
    });
    testTmbId = String(teamMember._id);

    // Create a test app for use in tests
    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: team._id,
      tmbId: teamMember._id,
      avatar: 'test-avatar',
      intro: 'Test intro'
    });
    testAppId = String(app._id);
  });

  afterEach(() => {
    serviceEnv.CHAT_LOG_URL = originalChatLogUrl;
    serviceEnv.CHAT_LOG_INTERVAL = originalChatLogInterval;
    serviceEnv.CHAT_LOG_SOURCE_ID_PREFIX = originalChatLogSourceIdPrefix;
  });

  describe('pushChatRecords function', () => {
    it('should skip saving if chatId is empty', async () => {
      const props = createMockProps(
        { chatId: '' },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await pushChatRecords(props);

      const chatItems = await MongoChatItem.find({ appId: testAppId });
      expect(chatItems).toHaveLength(0);
    });

    it('should skip saving if chatId is NO_RECORD_HISTORIES', async () => {
      const props = createMockProps(
        { chatId: 'NO_RECORD_HISTORIES' },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await pushChatRecords(props);

      const chatItems = await MongoChatItem.find({ appId: testAppId });
      expect(chatItems).toHaveLength(0);
    });

    it('should remove file URLs from user content before processing', async () => {
      const props = createMockProps({
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [
            {
              file: {
                type: ChatFileTypeEnum.image,
                name: 'test.jpg',
                url: 'https://example.com/test.jpg',
                key: 'file-key-123'
              }
            }
          ]
        }
      });

      await pushChatRecords(props);

      // Verify that the URL was removed
      expect(props.userContent.value[0].file?.url).toBe('');
    });

    it('should create chat items and update chat record', async () => {
      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });

      await pushChatRecords(props);

      // Check chat items were created
      const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: props.chatId });
      expect(chatItems).toHaveLength(2);

      // Check human message
      const humanItem = chatItems.find((item) => item.obj === ChatRoleEnum.Human);
      expect(humanItem).toBeDefined();
      expect(humanItem?.value[0].text?.content).toBe('Hello, how are you?');

      // Check AI message
      const aiItem = chatItems.find((item) => item.obj === ChatRoleEnum.AI);
      expect(aiItem).toBeDefined();
      expect(aiItem?.value[0].text?.content).toBe('I am doing well, thank you!');

      // Check chat record
      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props.chatId });
      expect(chat).toBeDefined();
      expect(chat?.title).toBe('');
      expect(String(chat?.teamId)).toBe(props.teamId);
    });

    it('should persist agent loop control values in AI chat item value', async () => {
      const plan = {
        planId: 'plan_1',
        task: 'Compare products',
        description: 'Compare FastGPT and Dify',
        steps: [
          {
            id: 's1',
            title: 'Compare positioning',
            description: 'Compare product positioning',
            acceptanceCriteria: ['Positioning is clear'],
            status: 'pending' as const,
            evidence: []
          }
        ]
      };
      const agentPlanUpdate = {
        id: 'call_update_plan',
        functionName: 'update_plan',
        params: '{"updates":[]}',
        response: 'ok',
        assistantText: 'draft while updating plan',
        reasoningText: 'planning'
      };
      const agentAsk = {
        id: 'call_ask_agent',
        functionName: 'ask_agent',
        params: '{"question":"请补充目标"}',
        planId: 'plan_1',
        assistantText: 'need more input',
        reasoningText: 'asking'
      };
      const agentStopGate = {
        id: 'stop_gate_2_req_too_early',
        reason: 'Active plan is not complete.',
        feedback: '<stop_gate_feedback>Continue the active plan.</stop_gate_feedback>',
        assistantText: 'too early',
        reasoningText: 'checking'
      };
      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: { content: 'Final answer' }
              },
              {
                plan
              },
              {
                agentPlanUpdate
              },
              {
                agentAsk
              },
              {
                agentStopGate
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);

      const aiItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      }).lean();

      expect(aiItem?.value).toEqual(
        expect.arrayContaining([{ plan }, { agentPlanUpdate }, { agentAsk }, { agentStopGate }])
      );
    });

    it('should drop inline responseData from aiContent and not persist response rows', async () => {
      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: { content: 'Response' }
              }
            ],
            responseData: [
              {
                nodeId: 'xx',
                id: 'xx',
                moduleType: FlowNodeTypeEnum.chatNode,
                moduleName: 'Chat',
                runningTime: 1.5,
                totalPoints: 10
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);

      const [aiItem, responseCount, log] = await Promise.all([
        MongoChatItem.findOne({ appId: testAppId, chatId: props.chatId, obj: ChatRoleEnum.AI }),
        MongoChatItemResponse.countDocuments({ appId: testAppId, chatId: props.chatId }),
        MongoAppChatLog.findOne({ appId: testAppId, chatId: props.chatId })
      ]);
      expect(aiItem?.responseData).toBeUndefined();
      expect(responseCount).toBe(0);
      expect(log?.totalPoints).toBe(0);
    });

    it('should ignore inline responseData when calculating chat log error count', async () => {
      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [],
            responseData: [
              {
                nodeId: 'xx',
                id: 'xx',
                moduleType: FlowNodeTypeEnum.chatNode,
                moduleName: 'Chat',
                runningTime: 1.0,
                totalPoints: 5,
                errorText: 'API rate limit exceeded'
              }
            ]
          },
          errorMsg: 'API rate limit exceeded'
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);

      const logs = await MongoAppChatLog.find({ appId: testAppId, chatId: props.chatId });
      expect(logs).toHaveLength(1);
      expect(logs[0].errorCount).toBe(0);
    });

    it('should calculate total points from writer summary', async () => {
      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: []
          },
          nodeResponseSummary: {
            citeCollectionIds: [],
            errorCount: 0,
            totalPoints: 15
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);

      const logs = await MongoAppChatLog.find({ appId: testAppId, chatId: props.chatId });
      expect(logs).toHaveLength(1);
      expect(logs[0].totalPoints).toBe(15);
    });

    it('should save cite ids, error count and log points from writer summary', async () => {
      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: []
          },
          nodeResponseSummary: {
            citeCollectionIds: ['collection-summary'],
            errorCount: 1,
            lastError: 'summary error',
            totalPoints: 9
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);

      const [chat, aiItem, log, responseCount] = await Promise.all([
        MongoChat.findOne({ appId: testAppId, chatId: props.chatId }),
        MongoChatItem.findOne({ appId: testAppId, chatId: props.chatId, obj: ChatRoleEnum.AI }),
        MongoAppChatLog.findOne({ appId: testAppId, chatId: props.chatId }),
        MongoChatItemResponse.countDocuments({ appId: testAppId, chatId: props.chatId })
      ]);

      expect(chat?.errorCount).toBe(1);
      expect(aiItem?.citeCollectionIds).toEqual(['collection-summary']);
      expect(log?.errorCount).toBe(1);
      expect(log?.totalPoints).toBe(9);
      expect(responseCount).toBe(0);
    });

    it('should push chat log response time from persisted response rows', async () => {
      serviceEnv.CHAT_LOG_URL = 'http://chat-log.test';
      serviceEnv.CHAT_LOG_INTERVAL = 50;
      serviceEnv.CHAT_LOG_SOURCE_ID_PREFIX = 'test-';

      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: { content: 'Log answer' }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);
      const aiItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      }).lean();
      await MongoChatItemResponse.create({
        teamId: testTeamId,
        appId: testAppId,
        chatId: props.chatId,
        chatItemDataId: aiItem?.dataId,
        data: {
          nodeId: 'log-node',
          id: 'log-response',
          moduleType: FlowNodeTypeEnum.chatNode,
          moduleName: 'Log Chat',
          runningTime: 1.25,
          totalPoints: 4
        }
      });

      await vi.waitFor(() => expect(axiosPostMock).toHaveBeenCalledTimes(1));

      expect(axiosPostMock.mock.calls[0][0]).toBe('http://chat-log.test/api/chat/push');
      expect(axiosPostMock.mock.calls[0][1]).toMatchObject({
        chatId: props.chatId,
        responseTime: 1250,
        sourceId: `test-${testAppId}`
      });
    });

    it('should merge metadata from existing chat', async () => {
      const props1 = createMockProps(
        {
          metadata: { source: 'web', version: '1.0' }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props1);

      const props2 = createMockProps(
        {
          chatId: props1.chatId,
          metadata: { user: 'test-user' }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props2);

      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props1.chatId });
      expect(chat?.metadata).toMatchObject({
        source: 'web',
        version: '1.0',
        user: 'test-user'
      });
    });

    it('should track duration seconds', async () => {
      const props = createMockProps(
        {
          durationSeconds: 3.75
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await pushChatRecords(props);

      const aiItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      if (aiItem) {
        if ('durationSeconds' in aiItem) {
          expect(aiItem?.durationSeconds).toBe(3.75);
        } else {
          throw new Error('aiItem does not have durationSeconds');
        }
      }
    });
  });

  describe('prepared chat round finalization', () => {
    it('should finalize prepared round without creating duplicate chat items', async () => {
      const responseChatItemId = 'prepared-ai-finalize';
      const props = createMockProps(
        {
          userContent: {
            dataId: responseChatItemId,
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: {
                  content: 'Hello, how are you?'
                }
              }
            ]
          },
          aiContent: {
            dataId: responseChatItemId,
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: {
                  content: 'Final answer'
                }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await MongoChat.create({
        appId: testAppId,
        chatId: props.chatId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: props.source,
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        hasBeenRead: false
      });
      await MongoChatItem.create([
        {
          teamId: testTeamId,
          tmbId: testTmbId,
          appId: testAppId,
          chatId: props.chatId,
          dataId: responseChatItemId,
          obj: ChatRoleEnum.Human,
          value: []
        },
        {
          teamId: testTeamId,
          tmbId: testTmbId,
          appId: testAppId,
          chatId: props.chatId,
          dataId: responseChatItemId,
          obj: ChatRoleEnum.AI,
          value: []
        }
      ]);

      await finalizeChatRound(props);

      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props.chatId });
      expect(chat?.chatGenerateStatus).toBe(ChatGenerateStatusEnum.done);
      expect(chat?.hasBeenRead).toBe(false);

      const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: props.chatId });
      expect(chatItems).toHaveLength(2);

      const aiItem = chatItems.find((item) => item.obj === ChatRoleEnum.AI);
      expect(aiItem?.dataId).toBe(responseChatItemId);
      expect(aiItem?.value[0].text?.content).toBe('Final answer');

      const responses = await MongoChatItemResponse.find({
        appId: testAppId,
        chatId: props.chatId,
        chatItemDataId: responseChatItemId
      });
      expect(responses).toHaveLength(0);
      expect(aiItem?.responseData).toBeUndefined();
    });

    it('should mark prepared round as error and keep ai placeholder', async () => {
      const responseChatItemId = 'prepared-ai-error';
      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });

      await MongoChat.create({
        appId: testAppId,
        chatId: props.chatId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: props.source,
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        hasBeenRead: false
      });
      await MongoChatItem.create({
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        chatId: props.chatId,
        dataId: responseChatItemId,
        obj: ChatRoleEnum.AI,
        value: []
      });

      await failChatRound({
        appId: testAppId,
        chatId: props.chatId,
        responseChatItemId,
        error: new Error('stream failed')
      });

      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props.chatId });
      expect(chat?.chatGenerateStatus).toBe(ChatGenerateStatusEnum.error);
      expect(chat?.hasBeenRead).toBe(false);

      const aiItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        dataId: responseChatItemId,
        obj: ChatRoleEnum.AI
      });
      expect(aiItem?.value).toEqual([]);
      expect(aiItem?.errorMsg).toContain('stream failed');
    });
  });

  describe('updateInteractiveChat function', () => {
    it('should skip update if chatId is empty', async () => {
      const props = createMockProps(
        { chatId: '' },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'opt1', value: 'Option 1' },
            { key: 'opt2', value: 'Option 2' }
          ],
          userSelectedVal: undefined
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };
      await updateInteractiveChat({ interactive, ...props });

      const chatItems = await MongoChatItem.find({ appId: testAppId });
      expect(chatItems).toHaveLength(0);
    });

    it('should skip update if no AI chat item found', async () => {
      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });
      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'opt1', value: 'Option 1' },
            { key: 'opt2', value: 'Option 2' }
          ],
          userSelectedVal: undefined
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };
      await updateInteractiveChat({ interactive, ...props });

      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props.chatId });
      expect(chat).toBeNull();
    });

    it('should skip update if chat item is not from AI', async () => {
      // Create a human chat item
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: { content: 'Hello' }
          }
        ]
      });

      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });
      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'opt1', value: 'Option 1' },
            { key: 'opt2', value: 'Option 2' }
          ],
          userSelectedVal: undefined
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };
      await updateInteractiveChat({ interactive, ...props });

      // Should not create a chat record
      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props.chatId });
      expect(chat).toBeNull();
    });

    it('should skip update if no interactive value found', async () => {
      // Create an AI chat item without interactive
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: { content: 'Hello' }
          }
        ]
      });

      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });
      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'opt1', value: 'Option 1' },
            { key: 'opt2', value: 'Option 2' }
          ],
          userSelectedVal: undefined
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };
      await updateInteractiveChat({ interactive, ...props });

      // Should not create a chat record
      const chat = await MongoChat.findOne({ appId: testAppId, chatId: props.chatId });
      expect(chat).toBeNull();
    });

    it('should update userSelect interactive value', async () => {
      // Create an AI chat item with userSelect interactive
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        value: [
          {
            interactive: {
              type: 'userSelect',
              params: {
                userSelectedVal: undefined,
                options: ['Option 1', 'Option 2']
              }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          appId: testAppId,
          userContent: {
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: { content: 'Option 1' }
              }
            ]
          },
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: []
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'opt1', value: 'Option 1' },
            { key: 'opt2', value: 'Option 2' }
          ],
          userSelectedVal: undefined
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      if (chatItem) {
        if (chatItem.obj === ChatRoleEnum.AI) {
          const lastValue = chatItem.value[chatItem.value.length - 1];
          if (lastValue.interactive?.type === 'userSelect') {
            expect(lastValue.interactive?.params.userSelectedVal).toBe('Option 1');
          } else {
            throw new Error('chatItem does not have userSelect interactive');
          }
        } else {
          throw new Error('chatItem does not have value');
        }
      }
    });

    it('should update userInput interactive value', async () => {
      // Create an AI chat item with userInput interactive
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        value: [
          {
            interactive: {
              type: 'userInput',
              params: {
                submitted: false,
                inputForm: [
                  {
                    key: 'username',
                    type: 'input',
                    label: 'Username',
                    value: undefined
                  }
                ]
              }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          userContent: {
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: { content: JSON.stringify({ username: 'john_doe' }) }
              }
            ]
          },
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: []
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'userInput' as const,
        params: {
          description: '',
          submitted: false,
          inputForm: [
            {
              key: 'username',
              type: FlowNodeInputTypeEnum.input,
              label: 'Username',
              value: undefined,
              valueType: WorkflowIOValueTypeEnum.string,
              required: false
            }
          ]
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      if (chatItem) {
        if (chatItem.obj === ChatRoleEnum.AI) {
          const lastValue = chatItem.value[chatItem.value.length - 1];
          if (lastValue.interactive?.type === 'userInput') {
            expect(lastValue.interactive?.params.submitted).toBe(true);
            expect(lastValue.interactive?.params.inputForm[0].value).toBe('john_doe');
          } else {
            throw new Error('chatItem does not have userInput interactive');
          }
        } else {
          throw new Error('chatItem does not have value');
        }
      }
    });

    it('should sanitize fileSelect form value before storing interactive history', async () => {
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        value: [
          {
            interactive: {
              type: 'userInput',
              params: {
                submitted: false,
                inputForm: [
                  {
                    key: 'upload',
                    type: FlowNodeInputTypeEnum.fileSelect,
                    label: 'Upload',
                    value: []
                  }
                ]
              }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          userContent: {
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: {
                  content: JSON.stringify({
                    upload: [
                      {
                        id: 'runtime-id',
                        key: 'chat/files/invoice.png',
                        url: 'https://preview.example.com/invoice.png',
                        name: 'invoice.png',
                        type: ChatFileTypeEnum.image,
                        icon: 'https://preview.example.com/invoice.png',
                        status: 'done',
                        process: 100,
                        error: 'should not persist'
                      },
                      {
                        id: 'external-id',
                        url: 'https://external.example.com/report.pdf',
                        name: 'report.pdf',
                        type: ChatFileTypeEnum.file,
                        status: 'done'
                      },
                      {
                        url: 'data:image/png;base64,AAAA',
                        name: 'inline.png',
                        type: ChatFileTypeEnum.image
                      }
                    ]
                  })
                }
              }
            ]
          },
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: []
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'userInput' as const,
        params: {
          description: '',
          submitted: false,
          inputForm: [
            {
              key: 'upload',
              type: FlowNodeInputTypeEnum.fileSelect,
              label: 'Upload',
              value: [],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              required: false
            }
          ]
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });

      if (chatItem?.obj !== ChatRoleEnum.AI) {
        throw new Error('chatItem does not have AI interactive value');
      }

      const lastValue = chatItem.value[chatItem.value.length - 1];
      if (lastValue.interactive?.type !== 'userInput') {
        throw new Error('chatItem does not have userInput interactive');
      }

      expect(lastValue.interactive.params.inputForm[0].value).toEqual([
        {
          key: 'chat/files/invoice.png',
          name: 'invoice.png',
          type: ChatFileTypeEnum.image
        },
        {
          url: 'https://external.example.com/report.pdf',
          name: 'report.pdf',
          type: ChatFileTypeEnum.file
        }
      ]);
    });

    it('should require a prepared round for agentPlanAskQuery new records', async () => {
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'plan-ask-data-id',
        value: [
          {
            interactive: {
              type: 'agentPlanAskQuery',
              planId: 'plan_1',
              params: {
                content: '请补充目标',
                reason: '需要用户明确任务目标',
                blockerType: 'missing_required_input',
                options: ['继续研究 Rust', '改为研究 Go', '先给出学习路线']
              }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          userContent: {
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: { content: '深入了解 Rust 系统编程方向' }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'agentPlanAskQuery' as const,
        planId: 'plan_1',
        params: {
          content: '请补充目标',
          reason: '需要用户明确任务目标',
          blockerType: 'missing_required_input',
          options: ['继续研究 Rust', '改为研究 Go', '先给出学习路线']
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await expect(updateInteractiveChat({ interactive, ...props })).rejects.toThrow(
        'Prepared chat round is required for interactive query'
      );
    });

    it('should persist agentPlanAskQuery answer on previous interactive and finalize prepared records', async () => {
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'plan-ask-data-id',
        value: [
          {
            interactive: {
              type: 'agentPlanAskQuery',
              planId: 'plan_1',
              params: {
                content: '请补充目标',
                reason: '需要用户明确任务目标',
                blockerType: 'missing_required_input',
                options: ['继续研究 Rust', '改为研究 Go', '先给出学习路线']
              }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          userContent: {
            obj: ChatRoleEnum.Human,
            dataId: 'prepared-round-data-id',
            value: [
              {
                text: { content: '深入了解 Rust 系统编程方向' }
              }
            ]
          },
          aiContent: {
            obj: ChatRoleEnum.AI,
            dataId: 'prepared-round-data-id',
            value: [
              {
                text: { content: 'Rust 系统编程方向包括所有权、并发和 unsafe 边界。' }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await MongoChat.create({
        chatId: props.chatId,
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        source: props.source,
        title: 'Test Chat'
      });
      await MongoChatItem.create([
        {
          chatId: props.chatId,
          teamId: testTeamId,
          tmbId: testTmbId,
          appId: testAppId,
          obj: ChatRoleEnum.Human,
          dataId: 'prepared-round-data-id',
          value: [
            {
              text: { content: '深入了解 Rust 系统编程方向' }
            }
          ]
        },
        {
          chatId: props.chatId,
          teamId: testTeamId,
          tmbId: testTmbId,
          appId: testAppId,
          obj: ChatRoleEnum.AI,
          dataId: 'prepared-round-data-id',
          value: []
        }
      ]);

      const interactive = {
        type: 'agentPlanAskQuery' as const,
        planId: 'plan_1',
        params: {
          content: '请补充目标',
          reason: '需要用户明确任务目标',
          blockerType: 'missing_required_input',
          options: ['继续研究 Rust', '改为研究 Go', '先给出学习路线']
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({
        interactive,
        shouldFinalizePreparedRound: true,
        ...props
      });

      const previousChatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI,
        dataId: 'plan-ask-data-id'
      });

      if (previousChatItem?.obj !== ChatRoleEnum.AI) {
        throw new Error('previousChatItem does not have AI interactive value');
      }
      const lastValue = previousChatItem.value[previousChatItem.value.length - 1];
      if (lastValue.interactive?.type !== 'agentPlanAskQuery') {
        throw new Error('previousChatItem does not have agentPlanAskQuery interactive');
      }

      expect(lastValue.interactive.params.answer).toBe('深入了解 Rust 系统编程方向');
      expect(lastValue.interactive.params.reason).toBe('需要用户明确任务目标');
      expect(lastValue.interactive.params.options).toEqual([
        '继续研究 Rust',
        '改为研究 Go',
        '先给出学习路线'
      ]);

      const finalizedAiItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI,
        dataId: 'prepared-round-data-id'
      });
      const finalizedHumanItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.Human,
        dataId: 'prepared-round-data-id'
      });
      expect(finalizedHumanItem?.value[0].planId).toBe('plan_1');
      expect(finalizedAiItem?.value[0].text?.content).toBe(
        'Rust 系统编程方向包括所有权、并发和 unsafe 边界。'
      );
    });

    it('should remove paymentPause interactive value', async () => {
      // Create an AI chat item with paymentPause interactive
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        value: [
          {
            text: { content: 'Payment required' }
          },
          {
            interactive: {
              type: 'paymentPause',
              params: {}
            }
          }
        ]
      });

      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });

      const interactive = {
        type: 'paymentPause' as const,
        params: {
          description: 'Payment required',
          continue: false
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      // PaymentPause is removed, and AI response is appended
      expect(chatItem?.value.length).toBeGreaterThan(0);
    });

    it('should merge AI response values', async () => {
      // Create an AI chat item with interactive
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        value: [
          {
            text: { content: 'First response' }
          },
          {
            interactive: {
              type: 'userSelect',
              params: {
                description: '',
                userSelectOptions: [
                  { key: 'a', value: 'A' },
                  { key: 'b', value: 'B' }
                ]
              }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: { content: 'Second response' }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'a', value: 'A' },
            { key: 'b', value: 'B' }
          ]
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      // Original has 2 values (text + interactive), AI adds 1 more (text)
      expect(chatItem?.value.length).toBeGreaterThanOrEqual(3);
      expect(chatItem?.value[chatItem.value.length - 1].text?.content).toBe('Second response');
    });

    it('should accumulate duration seconds', async () => {
      // Create an AI chat item
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        durationSeconds: 1.5,
        value: [
          {
            interactive: {
              type: 'userSelect',
              params: { options: ['A', 'B'] }
            }
          }
        ]
      });

      const props = createMockProps(
        {
          durationSeconds: 2.3
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'a', value: 'A' },
            { key: 'b', value: 'B' }
          ]
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      if (chatItem) {
        if (chatItem.obj === ChatRoleEnum.AI) {
          expect(chatItem?.durationSeconds).toBe(3.8);
        } else {
          throw new Error('chatItem does not have durationSeconds');
        }
      }
    });

    it('should update interactive chat with node responses already owned by the existing AI item', async () => {
      // Create an AI chat item
      await MongoChatItem.create({
        chatId: 'test-chat-id',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        dataId: 'data-id-1',
        value: [
          {
            interactive: {
              type: 'userSelect',
              params: {
                description: '',
                userSelectOptions: [
                  { key: 'a', value: 'A' },
                  { key: 'b', value: 'B' }
                ]
              }
            }
          }
        ]
      });

      // Create an existing response
      await MongoChatItemResponse.create({
        teamId: testTeamId,
        appId: testAppId,
        chatId: 'test-chat-id',
        chatItemDataId: 'data-id-1',
        data: {
          id: 'existing-root',
          nodeId: 'existing-root',
          moduleType: FlowNodeTypeEnum.chatNode,
          moduleName: 'Chat',
          runningTime: 1.0,
          totalPoints: 10
        }
      });
      await MongoChatItemResponse.create({
        teamId: testTeamId,
        appId: testAppId,
        chatId: 'test-chat-id',
        chatItemDataId: 'data-id-1',
        data: {
          id: 'new-root',
          nodeId: 'new-root',
          moduleType: FlowNodeTypeEnum.agent,
          moduleName: 'New Agent',
          runningTime: 0.5,
          totalPoints: 5
        }
      });

      const props = createMockProps(
        {
          aiContent: {
            dataId: 'data-id-1',
            obj: ChatRoleEnum.AI,
            value: [],
            responseData: [
              {
                nodeId: 'xx',
                id: 'xx',
                moduleType: FlowNodeTypeEnum.datasetSearchNode,
                moduleName: 'Dataset Search',
                runningTime: 0.5,
                totalPoints: 5,
                childrenResponses: [
                  {
                    nodeId: 'xx-child',
                    id: 'xx-child',
                    moduleType: FlowNodeTypeEnum.agent,
                    moduleName: 'Child Agent',
                    runningTime: 0.2,
                    totalPoints: 2
                  }
                ]
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      const interactive = {
        type: 'userSelect' as const,
        params: {
          description: '',
          userSelectOptions: [
            { key: 'a', value: 'A' },
            { key: 'b', value: 'B' }
          ]
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      };

      await updateInteractiveChat({ interactive, ...props });

      const responses = await MongoChatItemResponse.find({
        appId: testAppId,
        chatId: props.chatId
      }).sort({ _id: 1 });

      expect(responses).toHaveLength(2);
      const existingResponse = responses.find((item) => item.data.id === 'existing-root');
      expect(existingResponse?.data.moduleType).toBe(FlowNodeTypeEnum.chatNode);
      expect(responses.map((item) => item.chatItemDataId)).toEqual(['data-id-1', 'data-id-1']);
      expect(responses.map((item) => item.data.id)).toEqual(['existing-root', 'new-root']);

      const records = await getChatItems({
        appId: testAppId,
        chatId: props.chatId,
        offset: 0,
        limit: 10,
        field: 'obj value',
        nodeResponseMode: 'full'
      });
      const aiRecord = records.histories.find((item) => item.obj === ChatRoleEnum.AI);

      expect(aiRecord?.responseData?.map((item) => item.id)).toEqual(['existing-root', 'new-root']);
    });
  });
});
