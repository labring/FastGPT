# MCP 协议错误处理改进

## 问题描述

当用户提供的外部 MCP server 返回不符合 JSON-RPC 2.0 规范的响应时（例如包含 `status`, `info`, `infocode` 等额外字段），MCP SDK 内部的 Zod 验证会失败并抛出 `ZodError`。

这个错误被直接传播到顶层，导致：

1. 在日志中显示为系统级错误（severity: error）
2. 错误信息对用户不友好，包含大量 Zod 验证细节
3. 用户无法理解是他们配置的 MCP server 有问题

## 解决方案

### 1. 识别 MCP 协议错误

添加 `isMcpProtocolError` 函数来识别由 MCP SDK 抛出的协议格式错误：

```typescript
function isMcpProtocolError(error: any): boolean {
  if (!error) return false;
  // MCP SDK 的 Zod 错误
  if (error.name === 'ZodError') return true;
  // 检查错误消息中的 Zod 特征
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('invalid input') ||
    message.includes('unrecognized_keys') ||
    message.includes('invalid_union')
  );
}
```

### 2. 转换为用户友好的 UserError

添加 `toMcpProtocolUserError` 函数将协议错误转换为 `UserError`：

```typescript
function toMcpProtocolUserError(error: any): UserError {
  const details = error.message ? `\n\nDetails: ${error.message}` : '';
  return new UserError(
    'MCP server returned invalid response',
    `The MCP server returned a response that does not conform to JSON-RPC 2.0 specification. Please check your MCP server implementation.${details}`
  );
}
```

### 3. 在连接阶段捕获和转换

在 `MCPClient.doConnect()` 方法中：

- 在 Streamable HTTP transport 连接失败时检查是否是协议错误
- 在 SSE fallback 连接失败时也检查协议错误
- 将协议错误转换为 `UserError` 后再抛出

```typescript
try {
  const transport = new StreamableHTTPClientTransport(new URL(this.url), {
    fetch: safeFetch,
    requestInit: { headers: this.headers }
  });
  await this.client.connect(transport);
} catch (streamableError: any) {
  // 协议错误优先处理
  if (isMcpProtocolError(streamableError)) {
    await this.closeSafeFetch();
    logger.info('MCP protocol error from external server', {
      url: this.url,
      error: streamableError
    });
    throw toMcpProtocolUserError(streamableError);
  }
  // ... 其他错误处理
}
```

## 效果

### 修复前

- 错误日志：`severity: error`（系统错误）
- 错误信息：大量 Zod 验证细节，包含 `invalid_union`、`unrecognized_keys` 等技术术语
- 用户体验：用户不知道问题出在哪里

### 修复后

- 错误类型：`UserError`（业务错误/用户配置问题）
- 错误信息：清晰的提示 - "MCP server 返回的响应不符合 JSON-RPC 2.0 规范"
- 日志级别：`info`（记录但不作为系统故障上报）
- 用户体验：用户明确知道需要检查他们配置的 MCP server

## 测试覆盖

添加了两个测试用例：

1. `should convert ZodError to UserError when MCP server returns invalid JSON-RPC response`
   - 验证 Streamable HTTP 阶段的协议错误转换

2. `should convert protocol error in SSE fallback to UserError`
   - 验证 SSE fallback 阶段的协议错误转换

## 相关文件

- `packages/service/core/app/mcp.ts` - 主要修改
- `packages/service/test/core/app/mcp.test.ts` - 测试覆盖
