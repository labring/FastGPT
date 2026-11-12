import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { success } from '../../../support/scenario.mjs';
import { Blocked } from '../../../support/runtime.mjs';

/** 仅替代外部 LLM HTTP：通过真实模型管理 API 安装临时系统模型，实际鉴权、SDK、工具执行与用量聚合不替换。 */
export async function workflowModel(context, c) {
  if (c.fixture.environment === 'local-dev') {
    throw new Blocked('共享 Dev 不注册临时系统模型；需使用已授权的受控团队模型');
  }
  const calls = [];
  const plannedContent = [];
  const plannedTools = [];
  let failureMode = false;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/chat/completions');
      const parts = [];
      for await (const chunk of req) parts.push(chunk);
      const body = JSON.parse(Buffer.concat(parts));
      if (failureMode) {
        const observation = { at: new Date().toISOString(), path: req.url, body, httpStatus: 503 };
        calls.push(observation);
        c.record('外部模型 HTTP 失败', observation);
        return res
          .writeHead(503, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'FG-TEST model unavailable' } }));
      }
      const last = body.messages.at(-1);
      const tools = (body.tools ?? []).filter(
        (tool) => !['read_files', 'dataset_search'].includes(tool.function.name)
      );
      const forcedContent = plannedContent.shift();
      const requestedNames = plannedTools.shift();
      const invokeTools =
        forcedContent === undefined &&
        (requestedNames ? requestedNames.length > 0 : tools.length > 0 && last.role !== 'tool');
      const prompt = JSON.stringify(body.messages);
      const fastFirst = prompt.includes('FAST-FIRST');
      tools.sort((a, b) => {
        const rank = (item) =>
          /fast/i.test(item.function.description ?? item.function.name)
            ? fastFirst
              ? 0
              : 1
            : fastFirst
              ? 1
              : 0;
        return rank(a) - rank(b);
      });
      const selectedTools = requestedNames
        ? requestedNames.map((name) => {
            const found = tools.find((item) => item.function.name === name);
            assert.ok(found, `模型计划调用的工具不存在: ${name}`);
            return found;
          })
        : tools;
      const toolCalls = invokeTools
        ? selectedTools.map((item, index) => ({
            id: 'call_fgtest_' + calls.length + '_' + index,
            type: 'function',
            function: { name: item.function.name, arguments: '{}' },
            role: /fast/i.test(item.function.description ?? item.function.name) ? 'fast' : 'slow'
          }))
        : [];
      const observation = {
        at: new Date().toISOString(),
        path: req.url,
        body,
        toolCalls,
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 }
      };
      calls.push(observation);
      c.record('外部模型 HTTP 请求', observation);
      const base = {
        id: 'chatcmpl-fgtest-' + calls.length,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model
      };
      const message = invokeTools
        ? {
            role: 'assistant',
            content: null,
            tool_calls: toolCalls.map((item) => ({
              id: item.id,
              type: item.type,
              function: item.function
            }))
          }
        : { role: 'assistant', content: forcedContent ?? 'MODEL-OK' };
      const finish = invokeTools ? 'tool_calls' : 'stop';
      if (!body.stream)
        return res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            ...base,
            choices: [{ index: 0, message, finish_reason: finish }],
            usage: observation.usage
          })
        );
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const emit = (choices, usage) =>
        res.write(
          'data: ' +
            JSON.stringify({
              ...base,
              object: 'chat.completion.chunk',
              choices,
              ...(usage ? { usage } : {})
            }) +
            '\n\n'
        );
      emit([{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]);
      if (invokeTools)
        emit([
          {
            index: 0,
            delta: {
              tool_calls: toolCalls.map((item, index) => ({
                id: item.id,
                type: item.type,
                function: item.function,
                index
              }))
            },
            finish_reason: null
          }
        ]);
      else emit([{ index: 0, delta: { content: message.content }, finish_reason: null }]);
      emit([{ index: 0, delta: {}, finish_reason: finish }]);
      emit([], observation.usage);
      res.end('data: [DONE]\n\n');
    } catch (error) {
      res.writeHead(400).end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const requestUrl = `http://127.0.0.1:${server.address().port}/chat/completions`;
  const { modelId } = success(
    await c.request({
      route: '/api/core/ai/model/create',
      body: {
        channelType: 'system',
        modelData: {
          type: 'llm',
          // 一次调度可连续执行多个子场景；模型清理在用例结束后统一进行，名称必须逐场景唯一。
          model: 'fgtest-' + c.run + '-' + context.itemId,
          name: 'FG-TEST controlled HTTP model',
          provider: 'OpenAI',
          scope: 'system',
          isActive: true,
          requestUrl,
          config: {
            maxContext: 16000,
            maxResponse: 2000,
            quoteMaxToken: 4000,
            functionCall: true,
            toolChoice: true,
            vision: true
          }
        }
      }
    })
  );
  context.cleanups.push(async () => {
    success(
      await c.request({
        route: '/api/core/ai/model/delete',
        body: { modelIds: [modelId], channelType: 'system' }
      })
    );
    return { simulatedExternalLLM: true, modelId, calls, removed: true };
  });
  return {
    modelId,
    calls,
    /** 只控制外部模型下一次返回正文，不替代生产节点、鉴权或调度。 */
    queueContent: (content) => plannedContent.push(content),
    /** 可指定跨模型轮次的工具选择，空数组表示正常结束。 */
    planTools: (...names) => plannedTools.splice(0, plannedTools.length, ...names),
    setFailure: (enabled) => {
      failureMode = enabled;
    }
  };
}
