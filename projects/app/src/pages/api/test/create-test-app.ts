import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Create Test App ===');

    // 验证用户身份
    const { userId, teamId, tmbId } = await authCert({ req, authToken: true });
    console.log('User ID:', userId);
    console.log('Team ID:', teamId);
    console.log('TMB ID:', tmbId);

    const { appName = '测试应用' } = req.body;

    // 创建测试应用
    const testApp = await MongoApp.create({
      name: `${appName} - ${new Date().toLocaleString()}`,
      type: AppTypeEnum.simple,
      avatar: '/imgs/app/simple.svg',
      intro: '这是一个测试应用，用于验证团队切换功能',
      teamId,
      tmbId,
      modules: [
        {
          moduleId: getNanoid(),
          name: 'AI 对话',
          intro: '基础的AI对话模块',
          avatar: '/imgs/module/AI.png',
          flowNodeType: 'chatNode',
          position: { x: 500, y: 200 },
          version: '481',
          inputs: [
            {
              key: 'switch',
              renderTypeList: ['hidden'],
              label: '',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'any',
              canEdit: false,
              value: undefined,
              connected: false
            },
            {
              key: 'model',
              renderTypeList: ['settingLLMModel', 'reference'],
              label: 'core.module.input.label.aiModel',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'string',
              canEdit: false,
              value: 'gpt-3.5-turbo',
              connected: false
            },
            {
              key: 'temperature',
              renderTypeList: ['hidden'],
              label: '',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'number',
              canEdit: false,
              value: 0,
              connected: false
            },
            {
              key: 'maxToken',
              renderTypeList: ['hidden'],
              label: '',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'number',
              canEdit: false,
              value: 2000,
              connected: false
            },
            {
              key: 'isResponseAnswerText',
              renderTypeList: ['hidden'],
              label: '',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'boolean',
              canEdit: false,
              value: true,
              connected: false
            },
            {
              key: 'quoteTemplate',
              renderTypeList: ['hidden'],
              label: '',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'string',
              canEdit: false,
              value: '',
              connected: false
            },
            {
              key: 'quotePrompt',
              renderTypeList: ['hidden'],
              label: '',
              debugLabel: '',
              description: '',
              required: false,
              valueType: 'string',
              canEdit: false,
              value: '',
              connected: false
            },
            {
              key: 'systemPrompt',
              renderTypeList: ['textarea', 'reference'],
              valueType: 'string',
              label: 'core.ai.Prompt',
              debugLabel: '',
              description: 'core.app.tip.systemPromptTip',
              required: false,
              placeholder: 'core.app.tip.chatNodeSystemPromptTip',
              canEdit: false,
              value: '你是一个测试助手，用于验证团队切换功能。',
              connected: false
            },
            {
              key: 'history',
              renderTypeList: ['numberInput', 'reference'],
              valueType: 'chatHistory',
              label: 'core.module.input.label.chat history',
              debugLabel: '',
              description: 'core.module.input.description.chat history',
              required: true,
              canEdit: false,
              value: 6,
              connected: false
            },
            {
              key: 'userChatInput',
              renderTypeList: ['reference', 'textarea'],
              valueType: 'string',
              label: '用户问题',
              debugLabel: '',
              description: '',
              required: true,
              canEdit: false,
              value: '',
              connected: false
            }
          ],
          outputs: [
            {
              id: 'history',
              key: 'history',
              label: 'core.module.output.label.New context',
              description: 'core.module.output.description.New context',
              valueType: 'chatHistory',
              type: 'static'
            },
            {
              id: 'answerText',
              key: 'answerText',
              label: 'core.module.output.label.Ai response content',
              description: 'core.module.output.description.Ai response content',
              valueType: 'string',
              type: 'static'
            }
          ]
        }
      ],
      edges: [],
      chatConfig: {
        welcomeText: '你好，我是测试助手！',
        variables: [],
        questionGuide: false,
        ttsConfig: {
          type: 'web'
        },
        whisperConfig: {
          open: false,
          autoSend: false,
          autoTTSResponse: false
        },
        scheduledTriggerConfig: {
          cronString: '',
          timezone: 'Asia/Shanghai',
          defaultPrompt: ''
        }
      }
    });

    console.log('Test app created:', testApp._id);

    return jsonRes(res, {
      data: {
        message: 'Test app created successfully',
        app: {
          _id: testApp._id,
          name: testApp.name,
          teamId: testApp.teamId,
          tmbId: testApp.tmbId,
          type: testApp.type
        }
      }
    });
  } catch (err: any) {
    console.error('Create test app error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error',
      error: {
        stack: err.stack,
        name: err.name
      }
    });
  }
}

export default handler;
