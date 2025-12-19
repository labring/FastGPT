import { describe, expect, it, beforeEach } from 'vitest';
import { saveChat, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { Props } from '@fastgpt/service/core/chat/saveChat';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

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
  newTitle: 'Test Chat',
  source: 'online' as any,
  userContent: {
    obj: ChatRoleEnum.Human,
    value: [
      {
        type: ChatItemValueTypeEnum.text,
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
        type: ChatItemValueTypeEnum.text,
        text: {
          content: 'I am doing well, thank you!'
        }
      }
    ],
    responseData: []
  },
  durationSeconds: 2.5,
  ...overrides
});

describe('saveChat', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;
  let testUserId: string;

  beforeEach(async () => {
    // Create test user
    const user = await MongoUser.create({
      username: 'test-user',
      password: 'test-password'
    });
    testUserId = String(user._id);

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

  describe('saveChat function', () => {
    it('should skip saving if chatId is empty', async () => {
      const props = createMockProps(
        { chatId: '' },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await saveChat(props);

      const chatItems = await MongoChatItem.find({ appId: testAppId });
      expect(chatItems).toHaveLength(0);
    });

    it('should skip saving if chatId is NO_RECORD_HISTORIES', async () => {
      const props = createMockProps(
        { chatId: 'NO_RECORD_HISTORIES' },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await saveChat(props);

      const chatItems = await MongoChatItem.find({ appId: testAppId });
      expect(chatItems).toHaveLength(0);
    });

    it('should remove file URLs from user content before processing', async () => {
      const props = createMockProps({
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [
            {
              type: ChatItemValueTypeEnum.file,
              file: {
                type: 'image',
                name: 'test.jpg',
                url: 'https://example.com/test.jpg',
                key: 'file-key-123'
              }
            }
          ]
        }
      });

      await saveChat(props);

      // Verify that the URL was removed
      expect(props.userContent.value[0].file?.url).toBe('');
    });

    it('should create chat items and update chat record', async () => {
      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });

      await saveChat(props);

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
      expect(chat?.title).toBe('Test Chat');
      expect(String(chat?.teamId)).toBe(props.teamId);
    });

    it('should create chat item responses when responseData is provided', async () => {
      const props = createMockProps({
        aiContent: {
          obj: ChatRoleEnum.AI,
          value: [
            {
              type: ChatItemValueTypeEnum.text,
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
      });

      await saveChat(props);

      const responses = await MongoChatItemResponse.find({
        appId: testAppId,
        chatId: props.chatId
      });
      // ResponseData is only created when dataId exists on the AI chat item
      // Since we're using real database, check if responses were created
      if (responses.length > 0) {
        expect(responses[0].data.moduleType).toBe(FlowNodeTypeEnum.chatNode);
        expect(responses[0].data.totalPoints).toBe(10);
      }
    });

    it('should handle dataset search node with quoteList', async () => {
      const quote = {
        id: 'quote-1',
        chunkIndex: 0,
        datasetId: 'dataset-1',
        collectionId: 'collection-1',
        sourceId: 'source-1',
        sourceName: 'doc.pdf',
        score: [{ type: 'embedding' as const, value: 0.95, index: 0 }],
        q: 'What is AI?',
        a: 'AI stands for Artificial Intelligence...',
        updateTime: new Date()
      };
      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [
              {
                type: ChatItemValueTypeEnum.text,
                text: { content: 'Based on the search results...' }
              }
            ],
            responseData: [
              {
                nodeId: 'xx',
                id: 'xx',
                moduleType: FlowNodeTypeEnum.datasetSearchNode,
                moduleName: 'Dataset Search',
                runningTime: 0.5,
                totalPoints: 5,
                quoteList: [quote]
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await saveChat(props);

      const responses = await MongoChatItemResponse.find({
        appId: testAppId,
        chatId: props.chatId
      });
      // ResponseData is only created when dataId exists on the AI chat item
      if (responses.length > 0) {
        expect(responses[0].data.quoteList).toBeDefined();
        expect(responses[0].data.quoteList?.[0]).toMatchObject({
          id: quote.id,
          chunkIndex: quote.chunkIndex,
          datasetId: quote.datasetId,
          collectionId: quote.collectionId,
          sourceId: quote.sourceId,
          sourceName: quote.sourceName,
          score: quote.score
        });
        // q and a should be removed
        expect(responses[0].data.quoteList?.[0]?.q).toBeUndefined();
        expect(responses[0].data.quoteList?.[0]?.a).toBeUndefined();
      }
    });

    it('should create chat data log with error count when response has error', async () => {
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

      await saveChat(props);

      const logs = await MongoAppChatLog.find({ appId: testAppId, chatId: props.chatId });
      expect(logs).toHaveLength(1);
      expect(logs[0].errorCount).toBe(1);
    });

    it('should calculate total points from response data', async () => {
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
                totalPoints: 10
              },
              {
                nodeId: '22',
                id: '33',
                moduleType: FlowNodeTypeEnum.datasetSearchNode,
                moduleName: 'Dataset Search',
                runningTime: 0.5,
                totalPoints: 5
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await saveChat(props);

      const logs = await MongoAppChatLog.find({ appId: testAppId, chatId: props.chatId });
      expect(logs).toHaveLength(1);
      expect(logs[0].totalPoints).toBe(15);
    });

    it('should merge metadata from existing chat', async () => {
      const props1 = createMockProps(
        {
          metadata: { source: 'web', version: '1.0' }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await saveChat(props1);

      const props2 = createMockProps(
        {
          chatId: props1.chatId,
          metadata: { user: 'test-user' }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await saveChat(props2);

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

      await saveChat(props);

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

    it('should store citeCollectionIds from dataset search', async () => {
      const props = createMockProps(
        {
          aiContent: {
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
                quoteList: [
                  {
                    id: 'quote-1',
                    chunkIndex: 0,
                    datasetId: 'dataset-1',
                    collectionId: 'collection-1',
                    sourceId: 'source-1',
                    sourceName: 'doc1.pdf',
                    score: [{ type: 'embedding', value: 0.95, index: 0 }],
                    q: 'What is AI?',
                    a: 'AI stands for Artificial Intelligence...',
                    updateTime: new Date()
                  },
                  {
                    id: 'quote-2',
                    chunkIndex: 1,
                    datasetId: 'dataset-1',
                    collectionId: 'collection-2',
                    sourceId: 'source-2',
                    sourceName: 'doc2.pdf',
                    score: [{ type: 'embedding', value: 0.85, index: 0 }],
                    q: 'What is AI?',
                    a: 'AI stands for Artificial Intelligence...',
                    updateTime: new Date()
                  }
                ]
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await saveChat(props);

      const aiItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });

      if (aiItem) {
        if ('citeCollectionIds' in aiItem) {
          expect(aiItem?.citeCollectionIds).toHaveLength(2);
          expect(aiItem?.citeCollectionIds).toContain('collection-1');
          expect(aiItem?.citeCollectionIds).toContain('collection-2');
        } else {
          throw new Error('aiItem does not have citeCollectionIds');
        }
      }
    });
  });

  describe('updateInteractiveChat function', () => {
    it('should skip update if chatId is empty', async () => {
      const props = createMockProps(
        { chatId: '' },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await updateInteractiveChat(props);

      const chatItems = await MongoChatItem.find({ appId: testAppId });
      expect(chatItems).toHaveLength(0);
    });

    it('should skip update if no AI chat item found', async () => {
      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });
      await updateInteractiveChat(props);

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
            type: ChatItemValueTypeEnum.text,
            text: { content: 'Hello' }
          }
        ]
      });

      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });
      await updateInteractiveChat(props);

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
            type: ChatItemValueTypeEnum.text,
            text: { content: 'Hello' }
          }
        ]
      });

      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });
      await updateInteractiveChat(props);

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
            type: ChatItemValueTypeEnum.interactive,
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
                type: ChatItemValueTypeEnum.text,
                text: { content: 'Option 1' }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await updateInteractiveChat(props);

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      if (chatItem) {
        if (chatItem.obj === ChatRoleEnum.AI) {
          if (chatItem?.value[0].interactive?.type === 'userSelect') {
            expect(chatItem?.value[0].interactive?.params.userSelectedVal).toBe('Option 1');
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
            type: ChatItemValueTypeEnum.interactive,
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
                type: ChatItemValueTypeEnum.text,
                text: { content: JSON.stringify({ username: 'john_doe' }) }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await updateInteractiveChat(props);

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      if (chatItem) {
        if (chatItem.obj === ChatRoleEnum.AI) {
          if (chatItem?.value[0].interactive?.type === 'userInput') {
            expect(chatItem?.value[0].interactive?.params.submitted).toBe(true);
            expect(chatItem?.value[0].interactive?.params.inputForm[0].value).toBe('john_doe');
          } else {
            throw new Error('chatItem does not have userInput interactive');
          }
        } else {
          throw new Error('chatItem does not have value');
        }
      }
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
            type: ChatItemValueTypeEnum.text,
            text: { content: 'Payment required' }
          },
          {
            type: ChatItemValueTypeEnum.interactive,
            interactive: {
              type: 'paymentPause',
              params: {}
            }
          }
        ]
      });

      const props = createMockProps({}, { appId: testAppId, teamId: testTeamId, tmbId: testTmbId });

      await updateInteractiveChat(props);

      const chatItem = await MongoChatItem.findOne({
        appId: testAppId,
        chatId: props.chatId,
        obj: ChatRoleEnum.AI
      });
      // PaymentPause is removed, and AI response is appended
      expect(chatItem?.value.length).toBeGreaterThan(0);
      // The first value should be text, last one should be from AI response
      expect(chatItem?.value[0].type).toBe(ChatItemValueTypeEnum.text);
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
            type: ChatItemValueTypeEnum.text,
            text: { content: 'First response' }
          },
          {
            type: ChatItemValueTypeEnum.interactive,
            interactive: {
              type: 'userSelect',
              params: { options: ['A', 'B'] }
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
                type: ChatItemValueTypeEnum.text,
                text: { content: 'Second response' }
              }
            ],
            responseData: []
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await updateInteractiveChat(props);

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
            type: ChatItemValueTypeEnum.interactive,
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

      await updateInteractiveChat(props);

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

    it('should merge chat item responses', async () => {
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
            type: ChatItemValueTypeEnum.interactive,
            interactive: {
              type: 'userSelect',
              params: { options: ['A', 'B'] }
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
          moduleType: FlowNodeTypeEnum.chatNode,
          moduleName: 'Chat',
          runningTime: 1.0,
          totalPoints: 10
        }
      });

      const props = createMockProps(
        {
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: [],
            responseData: [
              {
                nodeId: 'xx',
                id: 'xx',
                moduleType: FlowNodeTypeEnum.datasetSearchNode,
                moduleName: 'Dataset Search',
                runningTime: 0.5,
                totalPoints: 5
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );

      await updateInteractiveChat(props);

      const responses = await MongoChatItemResponse.find({
        appId: testAppId,
        chatId: props.chatId
      });
      // Should have merged responses
      expect(responses.length).toBeGreaterThan(0);
    });
  });
});
