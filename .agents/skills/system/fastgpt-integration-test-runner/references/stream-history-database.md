# 流恢复、列表轮询与 Mongo 兼容测试

| 用例 | 脚本执行项 | 真实验证渠道 |
| --- | --- | --- |
| FG-CHAT-CONVERSATION-003 | C1–C6 | 原始/恢复 SSE、两个独立 Chromium 页面、Redis、Mongo |
| FG-CHAT-HISTORY-001 | C2–C5、C7；C1、C6 由 AI 执行 | 实际分页与轮询、权限 HTTP、React Context 只读快照、Redis 命令代理 |
| FG-INFRA-DATABASE-001 | C1 | 历史 BSON、正常续聊、Redis lease 与 Mongo |

三个入口都是 Node 脚本，需要 UI 时在内部启动 Playwright。依赖沿用仓库的 `@playwright/test`、`mongoose`、`ioredis` 和 `tsx`，另需已安装的 Chromium。只手动运行，不加入 CI 或默认测试。

## 使用本地 dev

统一复用现有本地 dev 主站、Pro、Mongo、Redis 和存储配置，不启动独立应用或数据库。按 [应用 Key 配置](app-key-cases.md) 准备可回收团队与登录态，再为所选场景通过实际创建/发布接口补齐 gate 工作流、列表数据和历史兼容夹具。通用准备器只建立回显模板，不自动生成这些额外数据。

每个可回收应用均在 `lifecycle.disposeApps` 中登记，名称以 `FG-TEST-` 开头。历史字段只通过明确 teamId/appId/chatId 写入本轮新记录。列表用例需要分页数据和专用 `history.switchAppId`，不能共用其他用例结束时会删除的应用。

系统迁移和集合索引升级归相应代码的专项测试，不纳入业务用例。共享 dev 不执行 Redis 全局内存设置或命令故障注入；需要全局故障的旧场景保留其边界说明，执行前应拆到相应底层专项测试，不为其另起一套环境，也不以普通请求冒充故障覆盖。只读 Redis 观测及本轮 gate 不受影响。

配置、登录态和连接值保存在仓库外权限受控目录，`resources.json` 记录回收 ID；不使用数据库前缀、marker 或 nonce 作为连接本地 dev 的前提。

## 执行

先按执行 skill 创建包含上述用例的临时报告，BASE_URL 和版本必须与本轮 dev 主站一致。然后将仓库外的 JSON 作为子进程环境传入，不在命令行拼接凭证：

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

`FASTGPT_TEST_HEADED=1` 可以显示脚本浏览器。列表 C1、C6 不声明脚本覆盖；C1 的执行说明见下文。C6 由 AI 在真实桌面浏览器中延迟请求、切换其他标签页/最小化，再恢复可见，核对 Network 时间线与实际 `document.visibilityState`；若浏览器驱动开启了 focus emulation，先关闭驱动焦点模拟后再切换真实标签页，并用原生 Runtime 读取可见性；完成后恢复驱动原设置。不覆盖页面属性或冻结计时器。AI 完成前不判通过。一个脚本子场景失败后先释放 gate、关闭连接并等待 lease 结束，才进入下一项，避免串联失败。

流夹具在 gate 前生成 55 段确定文本，完成后再生成尾段；逐字比较真实 SSE、数据库文本和可见 UI 的完整顺序及唯一性。镜像 TTL 使用 dev 中实际生效的值，并在夹具中记录；不得为了缩短测试修改共享配置。全局内存故障不在此入口执行。

## C1 的本地 dev + Pro 执行

C1 由 AI 执行整个场景，不声明普通工作流 gate 对 Pro 入口的脚本覆盖。启动本地 dev 主站与 Pro，沿用实际登录态和模型，新建本轮独立测试 App/Skill；Skill 调试需要 sandbox ready。

- 普通 App：使用正常工作流生成，检查侧栏忙闲、已读、元数据保留及轮询停止。
- Skill 调试：使用真实 debugChat 入口和 `{skillId, chatIds}` 查询列表/状态，核对调试面板的运行与完成状态。
- ChatAgentHelper、WorkflowBuilder：从真实编辑面板发起生成，分别用 `{appId, sourceType, chatIds}` 查询，核对来源隔离和面板状态。

这些辅助生成入口使用独立 Agent 运行流程，面板没有统一的 ChatContext 会话侧栏；不要配置一个 HTTP gate 或虚构通用 selector 来冒充实际操作。AI 记录真实请求、lease、接口结果和可见面板证据；优先检查本地 dev 真实入口，缺少模型或 sandbox 时说明实际依赖。

## 证据与收尾

报告保存原始尝试、AI 复核和显式复测历史。SSE 事件、限定 Mongo 快照、MGET 键集合/时序、索引管理器结果及截图均写入仓库外的本轮证据目录。React Context 只读检查用于断言页面未展示的已读和时间字段，不写状态，不以后台数据代替 UI。

执行结束调用准备器的 `dispose()` 回收本轮资源和凭证，不停止已有 dev 服务或删除共享数据库。报告和脱敏证据按用户要求保留，不提交。局部自检可运行 `node --test .agents/test/support/runtime.selftest.mjs .agents/test/support/stream.selftest.mjs`；自检结果不能替代这些真实业务测试。
