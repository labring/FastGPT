import type { SessionCoordinator } from './sessionCoordinator';
import { getSessionContextHeaders } from './sessionCoordinator';

/**
 * fetch / SSE 共用认证恢复。只识别 HTTP JSON 拒绝或 SSE 首事件的明确 Access 错误，
 * 已经交给调用方的流永远不重新提交。保留原始请求模板，最多重试一次。
 */
export const createSessionFetch =
  ({
    coordinator,
    fetchImpl = (...args) => fetch(...args)
  }: {
    coordinator: SessionCoordinator;
    fetchImpl?: typeof fetch;
  }): typeof fetch =>
  async (input, init) => {
    const template = new Request(input, init);
    const headers = new Headers(template.headers);
    if (headers.has('authorization') || headers.has('token') || headers.has('rootkey'))
      return fetchImpl(template);
    const snapshot = await coordinator.beforeRequest({ signal: template.signal });
    for (const [key, value] of Object.entries(getSessionContextHeaders(snapshot)))
      template.headers.set(key, value);

    /** 只检查首帧，遇到正常业务事件或注释即交还流，避免等待模型输出而阻塞 onopen。 */
    const inspectResponse = async (
      response: Response
    ): Promise<{ response: Response; error?: unknown }> => {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const data = await response
          .clone()
          .json()
          .catch(() => undefined);
        return { response, error: data };
      }
      if (!contentType.startsWith('text/event-stream') || !response.body) return { response };
      const reader = response.body.getReader();
      const prefix: Uint8Array[] = [];
      const decoder = new TextDecoder();
      let text = '';
      let bytes = 0;
      let complete = false;
      let error: unknown;
      while (bytes < 65_536) {
        const chunk = await reader.read();
        if (chunk.done) {
          complete = true;
          break;
        }
        prefix.push(chunk.value);
        bytes += chunk.value.byteLength;
        text += decoder.decode(chunk.value, { stream: true });
        const boundary = /\r?\n\r?\n/.exec(text);
        if (!boundary) continue;
        const frame = text.slice(0, boundary.index);
        if (/^event:\s*error\s*$/m.test(frame)) {
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          try {
            error = JSON.parse(data);
          } catch {
            /* 非结构化错误由原有流解析器处理。 */
          }
        }
        break;
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of prefix) controller.enqueue(chunk);
          if (complete) controller.close();
        },
        async pull(controller) {
          if (complete) return;
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              complete = true;
              controller.close();
            } else controller.enqueue(chunk.value);
          } catch (cause) {
            complete = true;
            controller.error(cause);
          }
        },
        cancel(reason) {
          complete = true;
          return reader.cancel(reason);
        }
      });
      return {
        response: new Response(stream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        }),
        error
      };
    };

    /** 丢弃尚未交给业务层的旧响应，并释放其流；已经交出的流保持原有不重发约定。 */
    const validate = (response: Response) => {
      try {
        coordinator.assertResponseContext(snapshot);
        return response;
      } catch (error) {
        void response.body?.cancel().catch(() => {});
        throw error;
      }
    };
    const send = () => {
      coordinator.assertRequestContext(snapshot);
      return fetchImpl(template.clone());
    };
    const first = await inspectResponse(validate(await send()));
    if (!(await coordinator.recover(first.error, { snapshot, signal: template.signal })))
      return validate(first.response);
    void first.response.body?.cancel().catch(() => {});
    template.signal.throwIfAborted();
    return validate(await send());
  };
