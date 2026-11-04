# 流恢复、列表轮询与 Mongo 兼容测试

| 用例 | 脚本执行项 | 真实验证渠道 |
| --- | --- | --- |
| FG-CHAT-CONVERSATION-003 | C1–C6 | 原始/恢复 SSE、两个独立 Chromium 页面、Redis、Mongo |
| FG-CHAT-HISTORY-001 | C1–C7 | 实际分页与轮询、权限 HTTP、React Context 只读快照、Redis 命令代理 |
| FG-INFRA-DATABASE-001 | C1–C3 | 历史 BSON、正常续聊、当前 Chat Schema 与 MongoIndexManager、真实索引与日志 |

三个入口都是 Node 脚本，需要 UI 时在内部启动 Playwright。依赖沿用仓库的 `@playwright/test`、`mongoose`、`ioredis` 和 `tsx`，另需已安装的 Chromium。只手动运行，不加入 CI 或默认测试。

## 准备独立环境

这些用例会构造旧字段、删除集合索引、改变 Redis 内存限制并注入命令故障，必须使用专用 Mongo/Redis 和专用 FastGPT 进程。`support/environment.mjs` 可以启动并准备这样的环境，不读取或复制原库业务数据。它从显式指定的环境文件继承插件、模型等服务连接配置，主库、日志库和 Redis 全部替换为本轮新实例。

准备仓库依赖、Docker（Redis `7.2-alpine` 镜像）和可执行的本机 `mongod`。在仓库根目录前台运行：

```bash
node .agents/test/support/environment.mjs \
  --source-env /实际路径/测试环境文件 \
  --mongo-binary /实际路径/mongod \
  --directory /仓库外/本轮私有目录 \
  --port 3100
```

准备完成后打印 `prepared`、目录及入口。首次页面编译、201 次正常会话准备可能耗时数分钟。`--app-root` 可指定已安装完整依赖且业务源码版本一致的另一个 checkout；不要用不同版本服务冒充当前代码。服务、Mongo 及容器由 `ledger.json` 登记，退出只回收本轮进程。端口冲突应更换本轮端口，不终止已有服务。

生成文件均保存在该私有目录：

- `fixture.json`：团队、独立应用、201 个会话、gate 及环境变量名。
- `secrets.json`：变量对应的凭证、连接地址与登录态文件路径；通过进程环境传入执行器，不能打印、提交或写入报告。
- `service-env.json`：索引脚本加载真实服务模块所需的完整环境配置。
- `ledger.json`、进程日志与登录态：本轮排障和回收依据。

写操作同时校验 `fg_it_*` 数据库名称、Mongo marker、Redis marker 和本轮 nonce；普通数据库连接不能替代该证明。应用必须在 `lifecycle.disposeApps` 中登记并以 `FG-TEST-` 命名。运行结束经正常接口删除测试会话和应用；复测已回收的应用需要重新准备环境，不能盲目复用旧 ID。

## 执行

先按执行 skill 创建包含上述用例的临时报告，BASE_URL 和版本必须与本轮私有主站一致。然后将私有 JSON 作为子进程环境传入，不在命令行拼接凭证：

```js
// 保存为仓库外的 .mjs 后用 node 执行；cwd 指向 FastGPT 仓库。
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const directory = '/仓库外/本轮私有目录';
const secrets = JSON.parse(await readFile(directory + '/secrets.json', 'utf8'));
const child = spawn('pnpm', ['test:cases', '--report', '/实际临时目录/report.html'], {
  cwd: '/实际路径/FastGPT',
  env: { ...process.env, ...secrets },
  stdio: 'inherit'
});
child.on('exit', code => { process.exitCode = code ?? 1; });
```

`FASTGPT_TEST_HEADED=1` 可以显示浏览器。隐藏页断言使用 Chromium 真正最小化后的 `document.visibilityState`；平台不支持时明确阻塞，不覆盖属性或停计时器冒充隐藏页。一个子场景失败后先释放 gate、关闭连接并等待 lease 结束，才进入下一项，避免串联失败。

流夹具在 gate 前生成 55 段确定文本，完成后再生成尾段；逐字比较真实 SSE、数据库文本和可见 UI 的完整顺序及唯一性。私有环境完成后镜像 TTL 为 4 秒，运行中 TTL 为 30 秒；这些值随夹具登记，不能仅修改 JSON 而不修改服务配置。C5 使用真实 `CONFIG SET maxmemory` 触发内存保护，并在 finally 恢复原值。

## Skill、Helper 和 Builder 的额外入口

自动准备覆盖普通 App。列表 C1 还需要配置 `fixture.history.entries`，分别提供 `skillEdit`、`chatAgentHelper`、`workflowBuilder` 的实际资源、工作流 gate 与已登录可见页面。每项包含：

```json
{
  "sourceType": "skillEdit",
  "sourceId": "实际资源 ID",
  "role": "A",
  "target": { "skillId": "实际资源 ID" },
  "generation": { "route": "从真实页面 Network 核实的生成路由", "body": {} },
  "url": "真实页面地址"
}
```

`generation.body` 和 `url` 内支持 `$CHAT_ID`、`$QUESTION`、`$RESPONSE_ID` 占位；body 必须是该入口实际接受的完整请求，gate 收到原样 `$QUESTION` 后才能进入忙闲验证。Helper/Builder 的 `target` 使用 `{appId, sourceType}`，Skill 使用 `{skillId}`；不要伪造内部 sourceId 入参或直接写 lease。各入口产生的测试历史通过正常批量删除接口回收，专用资源由准备方回收。

缺少任一入口时 C1 整行记录 blocked，同时保存已经完成的 App 证据。其他 C2–C7 继续独立执行，不能宣称全部来源已通过。

## 证据与收尾

报告保存原始尝试、AI 复核和显式复测历史。SSE 事件、限定 Mongo 快照、MGET 键集合/时序、索引管理器结果及截图均写入仓库外的本轮证据目录。React Context 只读检查用于断言页面未展示的已读和时间字段，不写状态，不以后台数据代替 UI。

退出环境准备进程会停止本轮服务、Mongo 和 Redis 容器；确认 `environment-cleanup.json` 无错误后删除私有目录内凭证、状态及数据库文件。报告和脱敏证据按用户要求保留，不提交。局部自检可运行 `node --test .agents/test/support/runtime.selftest.mjs .agents/test/support/stream.selftest.mjs`；自检结果不能替代这些真实业务测试。
