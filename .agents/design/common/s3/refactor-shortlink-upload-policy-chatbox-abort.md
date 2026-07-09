# S3 重构设计索引

## 0. 文档标识

- 任务前缀：`s3-refactor`
- 文档文件名：`refactor-shortlink-upload-policy-chatbox-abort.md`
- 更新时间：2026-07-03
- 关联问题分析：`.agents/issue/s3-refactor-analysis.md`
- PR 拆分计划：`pr-split-plan.md`
- 文档定位：S3 三个重构需求的阅读入口。详细设计已按需求拆分到独立文档。

## 1. 拆分结论

原文档已经按 3 个需求拆成 3 份独立设计文档：

| 需求 | 独立文档 | 推荐 PR | 优先级 |
|---|---|---|---:|
| 上传/下载链接太长，JWT 容易被模型改写 | `shortlink-access-token.md` | PR 1：S3 短链票据 | P0 |
| 上传文件类型校验依赖文件名后缀，架构混乱 | `upload-policy-validation.md` | PR 2：上传文件类型校验重构 | P1 |
| ChatBox 移除上传占位没有真正 abort | `chatbox-upload-abort.md` | PR 3：ChatBox 上传 Abort | P2 |

推荐执行顺序：

1. 先做 PR 1：短链票据。
2. 再做 PR 2：上传策略与文件类型校验。
3. 最后做 PR 3：ChatBox 上传 Abort。

如果 UX 问题需要优先修，也可以把 PR 3 提前；但 PR 1 和 PR 2 都会触碰 S3 上传链路，建议避免同时大改。

## 2. 阅读顺序

建议先看：

1. `pr-split-plan.md`：看 3 个 PR 的边界、优先级、tasks。
2. `shortlink-access-token.md`：看短链 token 如何实现。
3. `upload-policy-validation.md`：看无后缀文件如何判断类型。
4. `chatbox-upload-abort.md`：看 ChatBox 如何按 `uploadId` 管理上传任务。

## 3. 总体原则

1. 每个需求单独一个 PR，单独 review、测试、回滚。
2. PR 1 只解决短链，不改文件类型校验。
3. PR 2 只解决上传策略，不改短链票据结构。
4. PR 3 只解决前端上传取消，不改服务端 S3 签发和校验策略。
5. 业务授权仍在签发 URL 前完成，通用 S3 代理只消费已签发票据，不从外部请求直接接收 objectKey。

## 4. 待确认问题

1. PR 1 的短链是否只替换 proxy 模式 URL，还是所有模型可见链接都强制走短代理？
2. PR 2 中无后缀纯文本且没有 `contentType` hint 时，如果允许列表同时包含 `.txt/.md/.csv`，默认按 `.txt` 接受是否可以？
3. PR 3 中取消上传后，如果 S3 对象其实已经写入，是否需要立即投递删除任务，还是接受 TTL 自动清理？
