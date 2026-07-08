# Workflow SSE 事件类型约束设计

日期：2026-07-08
状态：已实施

## 一句话结论

不要第一步就做一个需要到处 `new`、到处传递的 SSE class 实例。

更简单、风险更低的做法是：保留现有 `workflowStreamResponse` 函数传递链路，新增一组无状态 helper，用 helper 生成类型正确的 SSE event。

也就是：

```ts
workflowStreamResponse?.(workflowSseEvent.answerDelta(text));
workflowStreamResponse?.(workflowSseEvent.toolCall(tool));
```

而不是：

```ts
const sse = new WorkflowSseWriter(...);
sse.answerDelta(text);
```

## 现在的问题

现在 workflow SSE 事件写法大概是：

```ts
workflowStreamResponse?.({
  event: SseResponseEventEnum.answer,
  data: xxx
});
```

但 TypeScript 只知道：

```ts
event?: SseResponseEventEnum;
data: string | object;
```

所以它不知道：

- `answer` 应该传 OpenAI 格式的 chunk。
- `toolCall` 应该传 `{ tool: ... }`。
- `flowNodeStatus` 应该传 `{ status, name }`。
- `flowNodeResponse` 应该传 node response。

结果就是：事件名写对了，但 `data` 结构写错，编译期不会报错，也没有语法提示。

## 不建议第一步做统一 class 的原因

如果做成：

```ts
sse.emit(event, data);
```

那只是把函数换成 class，类型问题还在。

如果做成：

```ts
sse.answer(text);
sse.toolCall(tool);
sse.flowNodeStatus(name);
```

调用体验会更好，但如果它是一个需要沿着 workflow、agent、toolcall、chat API、skill debug 一路传递的实例，迁移成本会明显变高。

所以更稳的顺序是：

1. 保留现有 `workflowStreamResponse?: WorkflowResponseType` 传递方式。
2. 新增无状态 `workflowSseEvent` helper，helper 负责生成类型正确的 `{ event, data }`。
3. 修改 `WorkflowResponseType`，让 helper 和手写 event 都能被类型检查。
4. 一次性迁移现有 workflow SSE 写入点为 helper 调用。

## 推荐方案

新增一个共享类型文件：

```txt
packages/global/core/workflow/runtime/sse.ts
```

里面定义一张事件参数表：

```ts
type WorkflowSsePayloadMap = {
  answer: AnswerChunk;
  fastAnswer: AnswerChunk;
  toolCall: { tool: ToolModuleResponseItemType };
  toolParams: { tool: Partial<ToolModuleResponseItemType> & { id: string } };
  toolResponse: { tool: Partial<ToolModuleResponseItemType> & { id: string } };
  flowNodeStatus: { status: 'running'; name: string };
  flowNodeResponse: ChatHistoryItemResType;
  workflowDuration: { durationSeconds: number };
  chatTitle: { title: string };
  updateVariables: Record<string, any>;
  interactive: WorkflowInteractiveResponseType;
  plan: { plan: AgentPlanType };
  planStatus: { planStatus: AgentPlanStatusType };
  sandboxStatus: SandboxStatusItemType;
  skillCall: { skill: SkillModuleResponseItemType };
};
```

再用这张表生成 writer 入参类型：

```ts
type WorkflowSseEvent<K extends keyof WorkflowSsePayloadMap = keyof WorkflowSsePayloadMap> = {
  event: K;
  data: WorkflowSsePayloadMap[K];
  id?: string;
};

type WorkflowRawSseEvent = {
  event?: SseResponseEventEnum;
  data: string;
  id?: string;
};

type WorkflowResponseType = (event: WorkflowSseEvent | WorkflowRawSseEvent) => void;
```

然后在同一个模块导出无状态 helper：

```ts
export const workflowSseEvent = {
  answerDelta(text: string) {
    return {
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({ text })
    };
  },
  reasoningDelta(text: string) {
    return {
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({ reasoning_content: text })
    };
  },
  done(event?: SseResponseEventEnum) {
    return {
      event,
      data: '[DONE]'
    };
  }
};
```

这样以后写错就会报错：

```ts
workflowStreamResponse?.({
  event: SseResponseEventEnum.toolCall,
  data: textAdaptGptResponse({ text: 'hello' }) // TS 应该报错
});
```

正确写法：

```ts
workflowStreamResponse?.({
  event: SseResponseEventEnum.toolCall,
  data: {
    tool: {
      id: call.id,
      toolName: toolNode.name,
      toolAvatar: toolNode.avatar,
      functionName: call.function.name,
      params: call.function.arguments ?? ''
    }
  }
});
```

## 实例如何初始化和传递

不新增全局 SSE 实例。

现有代码已经有一条传递链路：

```ts
workflowStreamResponse?: WorkflowResponseType
```

它从 API 入口创建，然后传到 workflow、agent、toolcall、child workflow 等模块。这个链路继续保留。

调用处只改写法：

```ts
workflowStreamResponse?.({
  event: SseResponseEventEnum.answer,
  data: textAdaptGptResponse({ text })
});
```

改成：

```ts
workflowStreamResponse?.(workflowSseEvent.answerDelta(text));
```

helper 不持有 `res`，不持有 `detail`，不持有 resume mirror，也不需要初始化。它只是生成一个普通对象。

如果某个局部函数里想要更短的写法，可以临时包一层：

```ts
const emit = (event: WorkflowResponseItemType) => workflowStreamResponse?.(event);

emit(workflowSseEvent.answerDelta(text));
```

但不把这个 `emit` 或 class 实例继续往下传，避免引入第二条 SSE 传递链路。

## 为什么还需要 Raw Event

不是所有 SSE 都是 JSON object。

现有逻辑里还有这些特殊情况：

```ts
workflowStreamResponse({
  event: SseResponseEventEnum.answer,
  data: '[DONE]'
});
```

以及 `detail=false` 时，答案流可能故意不带 event：

```ts
workflowStreamResponse({
  event: undefined,
  data: '[DONE]'
});
```

这些行为不能改，否则可能影响现有客户端和 stream resume。

所以类型里要保留：

```ts
type WorkflowRawSseEvent = {
  event?: SseResponseEventEnum;
  data: string;
};
```

## Reasoning 怎么处理

不建议新增一个 `reason` event。

现在 reasoning 是 `answer` 事件里的一个字段：

```ts
textAdaptGptResponse({
  reasoning_content: text
});
```

前端也是从：

```ts
choices[0].delta.reasoning_content
```

里读 reasoning。

所以本次只需要把 `answer` 的 payload 类型定义清楚，不需要改变协议。

## Helper 覆盖范围

为了让一次性迁移更一致，workflow SSE 写入点优先都改成 helper。helper 覆盖现有常用事件：

```ts
workflowSseEvent.answerDelta(text);
workflowSseEvent.reasoningDelta(text);
workflowSseEvent.answerStop();
workflowSseEvent.done(SseResponseEventEnum.answer);
workflowSseEvent.toolCall(tool);
workflowSseEvent.toolParams(toolDelta);
workflowSseEvent.toolResponse(toolDelta);
workflowSseEvent.flowNodeStatus(name);
workflowSseEvent.flowNodeResponse(nodeResponse);
workflowSseEvent.workflowDuration(durationSeconds);
workflowSseEvent.updateVariables(variables);
workflowSseEvent.interactive(interactive);
workflowSseEvent.plan(plan);
workflowSseEvent.planStatus(planStatus);
workflowSseEvent.sandboxStatus(status);
workflowSseEvent.chatTitle(title);
workflowSseEvent.raw({ event, data });
```

其中 `raw(event, data)` 只用于必须保留字符串 data 的场景，例如 `[DONE]` 或历史兼容的 `JSON.stringify(...)`。

不建议给底层 `responseWrite()` 直接套这些 helper，因为它不理解 workflow 协议，只负责把字符串写成 SSE 格式。

## responseWrite 如何处理

`responseWrite()` 保持低级字符串 writer，不升级成 workflow typed writer。

它当前职责是：

```ts
responseWrite({
  res,
  event,
  data
});
```

继续只接受：

```ts
{
  res?: NextApiResponse;
  event?: string;
  data: string;
}
```

原因：

- `responseWrite()` 位于 `packages/service/common/response`，不是 workflow 专用模块。
- 它也被非 workflow SSE 场景使用，例如 prompt/code 优化、导出进度、错误响应等。
- 它需要处理已经序列化好的字符串，不能强行要求 workflow payload object。

新的分层是：

```txt
workflowSseEvent.* helper
  -> 生成 typed workflow event
  -> workflowStreamResponse(event)
  -> getWorkflowResponseWrite() 过滤、JSON.stringify、注入 responseValueId、写 resume mirror
  -> responseWrite({ res, event, data })
```

也就是说：

- `workflowSseEvent` 负责“事件结构正确”。
- `workflowStreamResponse/getWorkflowResponseWrite` 负责“workflow 规则”。
- `responseWrite` 负责“最终 SSE 字符串写入”。

只有直接使用 `responseWrite()` 的 API 端点需要单独处理：

```ts
responseWrite({
  res,
  event: SseResponseEventEnum.answer,
  data: JSON.stringify(...)
});
```

这些地方不纳入 `WorkflowResponseType`，但可以提供一个小工具减少重复：

```ts
writeSseJson({
  res,
  event: SseResponseEventEnum.answer,
  data: createChatCompletionDeltaResponse({ text })
});
```

`writeSseJson` 仍然只是把 object `JSON.stringify` 后调用 `responseWrite()`，不承担 workflow 类型协议。

## 改动顺序

1. 新增 `packages/global/core/workflow/runtime/sse.ts`。
2. 在里面定义 `WorkflowSsePayloadMap` 和新的 `WorkflowResponseType`。
3. 在里面定义无状态 `workflowSseEvent` helper。
4. 修改现有 `WorkflowResponseType` 引用，让 workflow writer 使用新的类型。
5. 保持 `getWorkflowResponseWrite()` 逻辑不变，只换类型。
6. 一次性迁移 workflow writer 调用点：
   - AI chat 的 `onStreaming/onReasoning`
   - toolcall stream response
   - agent event mapper
   - chat completion API 的 stop 和 done
   - workflow dispatch 中的 node status、node response、interactive、duration
   - skill debug 中的 node response、duration、answer stop、done
7. 前端 SSE parser 也引用这份共享类型，避免服务端和前端事件结构漂移。
8. 直接 `responseWrite()` 的非 workflow 端点先保留，必要时只用 `writeSseJson` 这类低级 helper 去重。

## 这次不改什么

- 不改 SSE 实际输出格式。
- 不改 `SseResponseEventEnum`。
- 不把 reasoning 拆成新 event。
- 不删除 `[DONE]` 字符串事件。
- 不新增必须一路传递的 SSE class 实例。
- 不把底层 `responseWrite()` 改成 workflow 类型 writer。它继续只负责写字符串：

```ts
responseWrite({
  res,
  event,
  data
});
```

## 最终效果

改完后，调用处会有更明确的提示：

```ts
workflowStreamResponse?.({
  event: SseResponseEventEnum.flowNodeStatus,
  data: {
    status: 'running',
    name: node.name
  }
});
```

如果写成：

```ts
workflowStreamResponse?.({
  event: SseResponseEventEnum.flowNodeStatus,
  data: {
    text: 'hello'
  }
});
```

TypeScript 应该直接报错。

## 测试

局部测试：

```bash
pnpm --filter @fastgpt/service test test/core/workflow/dispatch/utils.test.ts test/core/workflow/utils/streamResponseContext.test.ts test/core/workflow/dispatch/ai/toolcall/hooks/useToolStreamResponse.test.ts test/core/workflow/dispatch/ai/agent/adapter/eventMapper.test.ts test/core/workflow/dispatch/ai/agent/piAgent/toolAdapter.test.ts
pnpm --filter @fastgpt/app test test/components/core/chat/ChatContainer/ChatBox/resume.test.ts
```

类型检查：

```bash
pnpm exec tsc -p packages/service/tsconfig.json --noEmit
pnpm exec tsc -p projects/app/tsconfig.json --noEmit
```

## TODO

- [x] 新增共享 SSE 类型文件。
- [x] 定义 `WorkflowSsePayloadMap`。
- [x] 用映射表生成 `WorkflowResponseType`。
- [x] 定义无状态 `workflowSseEvent` helper。
- [x] 替换 service/global 里旧的 writer 类型引用。
- [x] 一次性迁移 workflow SSE 写入点为 helper 调用。
- [x] 保持 `responseWrite()` 低级字符串职责不变。
- [x] 保留直接 `responseWrite()` API 端点，暂不引入 `writeSseJson`。
- [x] 前端 parser 对齐共享类型。
- [x] 跑局部测试和类型检查。
