import type { NextApiRequest, NextApiResponse } from 'next';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import { getSseErrorResponse } from '../../../common/response';
import { createSseStreamContext } from '../../../common/response/sse';
import { clearCookie } from '../../../support/permission/auth/common';
import { getStreamResumeMirror } from '../../chat/resume';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';

export type AuxiliaryGenerationStreamWriter = (params: {
  id?: string;
  event?: `${AuxiliaryGenerationEventEnum}` | string;
  data: string | object;
}) => void;

type CreateAuxiliaryGenerationStreamParams = {
  req: NextApiRequest;
  res: NextApiResponse;
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
        const heartbeatEvent = streamSseEvent.answerDelta('');
        writer({
          ...heartbeatEvent,
          data: JSON.stringify(heartbeatEvent.data)
        });
      }
    }
  });

  const write: AuxiliaryGenerationStreamWriter = ({ id, event, data }) => {
    const payload =
      typeof data === 'string'
        ? data
        : JSON.stringify({
            ...data,
            ...(id ? { responseValueId: id } : {})
          });
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
      write(streamSseEvent.done(SseResponseEventEnum.answer));
    },
    async flushResume() {
      await sseContext.flushResume();
    }
  };
};
