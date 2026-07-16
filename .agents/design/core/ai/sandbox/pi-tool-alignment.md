# Sandbox 工具与 Pi Harness 对齐设计

## 需求

FastGPT Agent Sandbox 的命令行和文件工具参考 Pi coding agent harness：

- 工具能力集合为 `bash/read/write/edit/grep/find/ls`，额外保留 FastGPT 的文件 URL 导出工具。
- `bash/read/grep/find/ls` 对齐 Pi 的输入语义和面向模型的纯文本输出。
- 移除能力重叠且协议较弱的旧 `sandbox_search`。
- 所有可能产生大量文本的工具统一限制为 2000 行或 50KB，并返回可继续操作的提示。

## 工具映射

| Pi | FastGPT | 处理 |
|---|---|---|
| `bash` | `sandbox_shell` | 返回纯文本输出；非零退出附退出码；长输出保留尾部并给出完整输出文件路径 |
| `read` | `sandbox_read_file` | 参数改为 `path/offset/limit`；返回纯文本并提供续读 offset |
| `write` | `sandbox_write_file` | 保留现有实现 |
| `edit` | `sandbox_edit_file` | 保留现有多文件批量替换能力 |
| `grep` | `sandbox_grep` | 新增，支持 pattern/path/glob/ignoreCase/literal/context/limit |
| `find` | `sandbox_find` | 取代旧 `sandbox_search`，支持 pattern/path/limit |
| `ls` | `sandbox_ls` | 新增，支持 path/limit，目录名追加 `/` |
| - | `sandbox_get_file_url` | FastGPT 独有，保留 |

## 技术方案

1. 在 toolCall 目录增加共享文本截断工具，分别支持保留头部和尾部。
2. `sandbox_shell` 使用固定 bash 包装命令把完整合并输出写入 `/tmp`，模型返回保留尾部；非零退出不丢失原始输出。
3. `sandbox_read_file` 继续走 adapter `readFiles`，只调整分页参数、截断和续读提示。当前工具响应契约是字符串，因此图片仍通过 `sandbox_get_file_url` 暴露。
4. `sandbox_grep` 和 `sandbox_find` 使用镜像已预装的 `ripgrep`，所有模型参数通过 shell quote 后拼入命令，避免命令注入。
5. `sandbox_ls` 使用 adapter `listDirectory`，不依赖 shell 输出解析。
6. 删除旧 search schema、执行器和测试，更新工具注册表与 sandbox system prompt。

## 兼容性

- 这是有意的工具协议升级：新模型请求不再看到 `sandbox_search`，改用 `sandbox_find`。
- 历史消息中已经完成的 `sandbox_search` 调用仍保留原 tool result，不需要迁移。
- sandbox 工具仍使用 `sandbox_*` 名称，FastAgent 与 PiAgent 的内部拦截逻辑无需改变。

## TODO

- [x] 增加共享 50KB/2000 行截断工具及单测。
- [x] 调整 `sandbox_shell` 输入输出和长输出处理。
- [x] 调整 `sandbox_read_file` 为 offset/limit 协议。
- [x] 新增 `sandbox_grep`、`sandbox_find`、`sandbox_ls` 及单测。
- [x] 删除 `sandbox_search`，更新注册、prompt 和工具集合断言。
- [x] 运行局部单测、ESLint、Prettier 和 service 测试。

## 验证结果

- 沙盒 toolCall 与 runtime 局部测试：11 个文件、49 个用例通过。
- Agent provider 关联测试：3 个文件、40 个用例通过。
- 变更文件 ESLint、Prettier 与 `git diff --check` 通过。
- 根目录 `pnpm test` 已运行；沙盒相关用例通过，但 7 个本次改动范围外的 app 数据库用例因 20/30 秒超时导致全量命令退出 1。
