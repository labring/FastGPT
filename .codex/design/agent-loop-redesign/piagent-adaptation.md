# PiAgent Workflow Agent 适配 TODO

日期：2026-05-12

## 范围

本次只适配 `AGENT_ENGINE=pi` 与最新 workflow agent 运行详情和工具事件协议的差异。`ask_agent` 暂不接入，plan 也不接入。

## TODO

1. PiAgent 内部运行详情不再使用 `childrenResponses`，主 Agent 调用和工具/子应用调用都平铺写入 `nodeResponses`。
2. 工具执行没有返回 `nodeResponse` 时，PiAgent adapter 生成 fallback 工具运行详情，至少包含 `id`、`nodeId`、`moduleType`、`moduleName`、`toolInput`、`toolRes`、`runningTime`、`totalPoints`。
3. PiAgent 工具调用 SSE 与 `assistantResponses.tools` 补齐参数更新：先发 `toolCall`，再发 `toolParams`，最后发 `toolResponse`。
4. PiAgent 主模型 request record 保留 FastGPT 内部 `requestId`，并额外记录供应商返回的 `providerResponseId`（如果 Pi message 中存在）。
5. 保持现有主模型 usage 和工具 usage 计费路径，不把工具 points 叠加到主 Agent 节点上，避免运行详情重复统计。
6. PiAgent 的 `toolResponse` SSE payload 必须带 `tool.id`，否则客户端无法按 callId 合并工具卡片响应。
7. PiAgent 在 `message_end` 需要归并被 provider streaming 拆散的 toolCall block，避免空工具名和参数错位写入上下文。
8. PiAgent 恢复历史 `piMessages` 与送模前也需要做 toolCall 归一化，兼容已落库的旧脏上下文。
9. PiAgent 需要补齐 `tool_execution_start/end` 的事件映射，确保工具校验失败、工具不存在或执行抛错时也能闭合工具卡片和 fallback 运行详情。
