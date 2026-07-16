# S3 代理下载流生命周期修复

## 1. 背景与问题

FastGPT 在 `short-proxy` 和旧文件下载接口中通过 Node.js 流转发 S3/MinIO 对象。当前 `stream.pipe(res)` 实现没有在客户端取消时关闭上游；`HEAD` 也会先创建无人消费的 `GetObject` 流。未消费的响应会持续占用 HTTP Agent socket，并可能导致同一 origin 的后续上传和下载等待连接。

## 2. 目标

1. 客户端在建流前断开时，取消底层对象下载请求。
2. 传输中断时销毁完整流管道并释放上游 socket。
3. `HEAD` 只查询 metadata，不执行对象下载。
4. metadata、上游流或下游响应任一失败时清理其他资源。
5. 新短链、旧 JWT 和 dataset 文件读取入口均具备一致的释放能力。
6. 保持现有响应头、鉴权和公开错误语义。

## 3. 非目标

1. 不新增固定总下载超时，避免误杀合法的大文件或慢速下载。
2. 不改变下载 URL 模式的配置默认值。
3. 不新增 Range 下载能力。

## 4. 技术设计

### 4.1 Storage SDK

`DownloadObjectParams` 增加可选 `abortSignal`：AWS S3/MinIO 透传给 `S3Client.send`；COS、OSS 和测试 adapter 在 signal 触发时销毁返回流。调用方仍负责正常消费流，signal 负责异常取消。

### 4.2 HTTP 生命周期

每次代理下载创建独立 `AbortController`：

1. `req.aborted` 或响应完成前 `close` 时 abort。
2. `HEAD` 只读取 metadata、设置响应头并结束。
3. `GET` 把 signal 传入 `getFileStream`。
4. 使用 `node:stream/promises.pipeline` 转发，任一端失败时销毁整条管道。
5. 非客户端取消导致的失败会 abort 其他并行工作并交给现有错误映射。
6. `finally` 移除请求级监听器。

正常响应的 `finish/close` 不应误判为取消。

### 4.3 兼容入口

- 旧 `/api/system/file/[jwt]` 复用统一 S3 代理下载函数。
- `/api/common/file/read/[filename]` 保留编码探测和 disposition 规则，但复用 abort 生命周期并使用 `pipeline`。

## 5. 测试设计

1. AWS adapter 将 signal 传给 `client.send`。
2. GET 正常传输完整内容并清理监听器。
3. 客户端在建流前断开会触发 signal。
4. 客户端在传输中关闭会销毁上游流。
5. HEAD 不调用 `getFileStream`。
6. metadata 失败会取消并清理已启动下载。

## 6. TODO

- [x] 扩展下载取消合约及各 adapter。
- [x] 新增 HTTP 下载 abort 生命周期 helper。
- [x] 使用 `pipeline` 重构代理下载并修复 HEAD。
- [x] 修复旧 JWT 和 dataset 文件读取入口。
- [x] 补充 SDK 与 app 层测试。
- [x] 运行局部测试和类型检查。
- [ ] 全量测试通过（当前被既有 admin Vitest storage subpath alias 解析错误阻断）。
