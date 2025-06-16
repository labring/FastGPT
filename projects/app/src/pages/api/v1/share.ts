import type { NextApiRequest, NextApiResponse } from 'next';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { authOutLinkReq } from '@fastgpt/service/support/permission/publish/authLink';
import { outLinkChatCB } from '@/service/support/permission/auth/outLink';
import { sseErrRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { checkKeys } from '@/service/core/app/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { ChatRoleEnum, ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import type {
  RuntimeNodeItemType,
  RuntimeEdgeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { responseWrite } from '@fastgpt/service/common/response';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';

// 简化鉴权响应接口，只关注验证结果
interface AuthResponse {
  success: boolean;
  message?: string;
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { shareId, chatId } = req.query as { shareId?: string; chatId?: string };
  const { prompt } = req.body as { prompt: string };
  const { token } = req.query as { token?: string };

  try {
    // 检查数据库连接
    if (!connectionMongo.connection.readyState) {
      throw new Error('Database connection not ready');
    }

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // auth link and get appId
    const { appId, outLinkModel, teamId, tmbId, responseDetail } = await authOutLinkReq({
      shareId,
      query: req.query,
      req
    });

    // 如果需要鉴权，先进行权限验证
    if (outLinkModel.auth?.requireAuth) {
      if (!token) {
        throw new Error('Token is required');
      }

      if (!outLinkModel.auth.authUrl) {
        throw new Error('Auth URL is not configured');
      }

      // 调用鉴权服务
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // 如果配置了鉴权密钥，添加到请求头
      if (outLinkModel.auth.authKey) {
        headers['Authorization'] = outLinkModel.auth.authKey;
      }

      // 发送鉴权请求
      const authRes = await fetch(`${outLinkModel.auth.authUrl}?token=${token}`, { headers });

      if (!authRes.ok) {
        return res.status(401).json({
          success: false,
          message: '鉴权服务请求失败'
        });
      }

      const authData: AuthResponse = await authRes.json();

      // 只检查鉴权结果，如果失败则返回错误
      if (!authData.success) {
        return res.status(401).json({
          success: false,
          message: authData.message || '鉴权失败'
        });
      }
    }

    // 鉴权通过后，继续 FastGPT 原有的功能处理
    const app = await MongoApp.findById(appId).lean();
    if (!app) {
      throw new Error('App not found');
    }

    // get latest version
    const { nodes, edges } = await getAppLatestVersion(appId, app);

    // check if model key is valid
    const models = getChatModelNameListByModules(nodes);
    await checkKeys({
      models: models.map((model) => ({ model })),
      teamId,
      chatId
    });

    // get runtime nodes and edges
    const entryNodeIds = nodes
      .filter((node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart)
      .map((node) => node.nodeId);
    const runtimeNodes = nodes.map((node) => ({
      nodeId: node.nodeId,
      name: node.name,
      avatar: node.avatar || '/favicon.ico', // provide a default avatar
      intro: node.intro,
      flowNodeType: node.flowNodeType,
      showStatus: node.showStatus,
      isEntry: entryNodeIds.includes(node.nodeId),
      inputs: node.inputs || [],
      outputs: node.outputs || [],
      pluginId: node.pluginId,
      version: node.version || '1.0'
    }));
    const runtimeEdges = edges.map((edge) => ({
      ...edge,
      target: edge.target || '',
      source: edge.source || '',
      status: 'waiting' as const
    }));

    // create user question
    const userQuestion: ChatItemType = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: prompt
          }
        }
      ],
      dataId: getNanoid()
    };

    // create response chat item id
    const responseChatItemId = getNanoid();

    // dispatch workflow
    const { flowResponses, assistantResponses } = await dispatchWorkFlow({
      res,
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      externalProvider: {},
      runningAppInfo: {
        id: appId,
        teamId,
        tmbId
      },
      runningUserInfo: {
        teamId,
        tmbId
      },
      uid: `${shareId}_${Date.now()}`,
      chatId,
      responseChatItemId,
      variables: {},
      query: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: prompt
          }
        }
      ],
      histories: [userQuestion],
      chatConfig: app.chatConfig || {},
      stream: true,
      maxRunTimes: 10,
      runtimeNodes,
      runtimeEdges,
      workflowStreamResponse: (e: { event: SseResponseEventEnum; data: any }) => {
        responseWrite({
          res,
          event: e.event,
          data: JSON.stringify(e.data)
        });
      },
      version: 'v2',
      responseDetail: true
    });

    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: JSON.stringify(
        textAdaptGptResponse({
          text: null,
          finish_reason: 'stop'
        })
      )
    });
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: JSON.stringify('[DONE]')
    });

    // create AI response
    const aiResponse = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      responseData: flowResponses
    };

    const { responseData: finalResponse } = outLinkChatCB({
      res,
      responseData: aiResponse,
      detail: responseDetail,
      messages: [userQuestion, aiResponse]
    });

    res.json(finalResponse);
  } catch (err: any) {
    res.status(500);
    if (err?.message === 'Token is required') {
      sseErrRes(res, 'Authentication token is required');
    } else if (err?.source === 'model') {
      sseErrRes(res, err?.message || 'Model error');
    } else if (err?.code === OutLinkErrEnum.outLinkOverFrequency) {
      sseErrRes(res, `请求太频繁了，请稍后再试. [${outLinkChatCB.name}]: ${err?.message ?? err}`);
    } else if (err?.code === OutLinkErrEnum.unAuthUser) {
      sseErrRes(res, `需要鉴权. [${outLinkChatCB.name}]: ${err?.message ?? err}`);
    } else {
      sseErrRes(res, `[${outLinkChatCB.name}]: ${err?.message ?? err}`);
    }
  }
};

import { NextAPI } from '@/service/middleware/entry';

export default NextAPI(handler);
