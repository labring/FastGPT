import type { NodeHttpRequest, NodeHttpResponse } from '../../../types/http';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import { getSseErrorResponse } from '../../../common/response';
import { createSseStreamContext } from '../../../common/response/sse';
import { clearCookie } from '../../../support/permission/auth/common';
import { getStreamResumeMirror } from '../../chat/resume';
import { createChatCompletionDeltaResponse } from '@fastgpt/global/core/ai/llm/utils';

export type AuxiliaryGenerationStreamWriter = (params: {
  event?: `${AuxiliaryGenerationEventEnum}` | string;
  data: string | object;
}) => void;

type CreateAuxiliaryGenerationStreamParams = {
  req: NodeHttpRequest;
  res: NodeHttpResponse;
  teamId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

export type AuxiliaryGenerationStreamContext = {
  write: AuxiliaryGenerationStreamWriter;
  writeError: (error: unknown) => void;
  writeDone: () => void;
  flushResume: () => Promise<void>;
};

/**
 * 初始化辅助生成 SSE 响应。
 *
 * 这里只处理通用 SSE 协议、心跳和 chat stream resume mirror，不引入 workflow writer。
 * 调用方需要显式写入 answer/interactive/config 等业务事件。
 */
export const createAuxiliaryGenerationStream = async ({
  req,
  res,
  teamId,
  sourceType,
  sourceId,
  chatId
}: CreateAuxiliaryGenerationStreamParams): Promise<AuxiliaryGenerationStreamContext> => {
  const mirror = await getStreamResumeMirror({
    resumeRequestHeaderValue: req.headers?.[STREAM_RESUME_REQUEST_HEADER],
    teamId,
    sourceType,
    sourceId,
    chatId
  });

  const sseContext = createSseStreamContext({
    res,
    streamResumeMirror: mirror,
    heartbeat: {
      write: (writer) => {
        writer({
          event: AuxiliaryGenerationEventEnum.answer,
          data: JSON.stringify(createChatCompletionDeltaResponse({ text: '' }))
        });
      }
    }
  });

  const write: AuxiliaryGenerationStreamWriter = ({ event, data }) => {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    sseContext.write({ event, data: payload });
  };

  return {
    write,
    writeError(error) {
      const { data, shouldClearCookie } = getSseErrorResponse(error);
      if (shouldClearCookie) {
        clearCookie(res);
      }
      write({
        event: AuxiliaryGenerationEventEnum.error,
        data
      });
    },
    writeDone() {
      write({
        event: AuxiliaryGenerationEventEnum.answer,
        data: createChatCompletionDeltaResponse({
          text: null,
          finishReason: 'stop'
        })
      });
      write({
        event: AuxiliaryGenerationEventEnum.answer,
        data: '[DONE]'
      });
    },
    async flushResume() {
      await sseContext.flushResume();
    }
  };
};
