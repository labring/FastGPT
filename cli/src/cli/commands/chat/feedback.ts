import { CliArgumentError } from '../../../shared/errors';
import type { CliCommandSpec } from '../../pipeline';
import { requireActiveClient } from '../dataset/shared';

/** 注册 App 对话消息用户反馈更新命令，沿用 chat 命令的参数命名约定。 */
export function createChatFeedbackCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['chat', 'feedback', 'update'],
      summary: 'Add, update, or clear user good/bad feedback on an App assistant message',
      risk: 'write',
      authModes: ['token', 'personalKey', 'appKey'],
      options: [
        {
          name: 'appId',
          flags: '--appId <value>',
          takesValue: true,
          description: 'Target App ID; optional for an App API Key'
        },
        {
          name: 'customUid',
          flags: '--customUid <value>',
          takesValue: true,
          description: 'App conversation user ID (API Keys only; mutually exclusive with authProxy)'
        },
        {
          name: 'authProxy',
          flags: '--authProxy <json>',
          takesValue: true,
          description:
            'Proxy App access as {"tmbId":"..."} or {"username":"..."} using an enabled personal API Key'
        },
        {
          name: 'chatId',
          flags: '--chatId <value>',
          takesValue: true,
          description: 'App conversation ID'
        },
        {
          name: 'dataId',
          flags: '--dataId <value>',
          takesValue: true,
          description: 'Assistant message data ID (not its database _id)'
        },
        {
          name: 'good',
          flags: '--good <text>',
          takesValue: true,
          description: 'User good feedback content (mutually exclusive with --clear)'
        },
        {
          name: 'bad',
          flags: '--bad <text>',
          takesValue: true,
          description: 'User bad feedback content (mutually exclusive with --clear)'
        },
        {
          name: 'clear',
          flags: '--clear',
          takesValue: false,
          description:
            'Clear existing user good and bad feedback (mutually exclusive with --good/--bad)'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate and preview the request without making changes'
        }
      ],
      examples: [
        {
          description: 'Submit positive feedback on an App assistant message',
          args: [
            'chat',
            'feedback',
            'update',
            '--appId',
            '68ad85a7463006c963799a05',
            '--chatId',
            'conversation-id',
            '--dataId',
            'message-id',
            '--good',
            'Helpful answer'
          ]
        },
        {
          description: 'Clear existing user feedback on an App assistant message',
          args: [
            'chat',
            'feedback',
            'update',
            '--appId',
            '68ad85a7463006c963799a05',
            '--chatId',
            'conversation-id',
            '--dataId',
            'message-id',
            '--clear'
          ]
        }
      ],
      execute: async ({ options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'chat feedback update');
        const authProxy = (() => {
          if (options.authProxy === undefined) {
            return undefined;
          }
          try {
            return JSON.parse(String(options.authProxy)) as unknown;
          } catch {
            throw new CliArgumentError('--authProxy must be valid JSON.');
          }
        })();

        return container.chatFeedbackService.update({
          client: activeClient,
          credential: resolvedAuth?.credential,
          dryRun: options.dryRun === true,
          input: {
            ...(options.appId !== undefined ? { appId: options.appId } : {}),
            ...(options.customUid !== undefined ? { customUid: options.customUid } : {}),
            ...(authProxy !== undefined ? { authProxy } : {}),
            ...(options.chatId !== undefined ? { chatId: options.chatId } : {}),
            ...(options.dataId !== undefined ? { dataId: options.dataId } : {}),
            ...(options.good !== undefined ? { userGoodFeedback: options.good } : {}),
            ...(options.bad !== undefined ? { userBadFeedback: options.bad } : {}),
            ...(options.clear === true ? { clear: true } : {})
          }
        });
      }
    }
  ];
}
