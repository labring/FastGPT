# 应用 Key 脚本配置

第三阶段复用临时报告及 `pnpm test:cases`，仅按需手动执行，不接入 CI 或默认测试。完整 D1–D16 包含 CSV 限流等待与真实沙盒，执行时指定 `--timeout-ms 1800000`，该上限作用于整个 Node 任务。

| 用例 | Node 完整执行项 | 验证渠道 |
| --- | --- | --- |
| FG-PERMISSION-RESOURCE-002 | A1–A6 | 真实 HTTP；A3 在服务子进程核验鉴权开关 |
| FG-INTEGRATION-OPENAPI-002 | M1–M7 | HTTP、Mongo；M1/M5 操作真实页面 |
| FG-CHAT-HISTORY-FEEDBACK-003 | D1–D16 | HTTP、SSE、日志库、Pro、S3、Sandbox |
| FG-INTEGRATION-OPENAPI-003 | U1–U5 | Scalar 实际交互、双语文档 dev、教程 HTTP/数据库主链路 |
| FG-PERMISSION-TEAM-001 | T1–T7 | 实际移出/离开/转让/删除 API，事务、同步与注销清理服务 |

## 本地 dev 准备

使用现有本地 dev 主站、Pro 和已配置的 Mongo、Redis、S3、插件及 Sandbox。不要启动另一套应用或专用数据库，不要求数据库名称前缀或私有 marker。记录实际服务版本，不能用脚本所在 checkout 的 HEAD 代替被测版本。

`support/environment.mjs` 的 `prepareDevEnvironment` 只创建本轮 `FG-TEST-*` 团队、六个测试账号、登录态、个人 Key 和已发布的固定回显模板，不启动服务、不复制原库。显式指定 dev 环境文件，连接值仅保存于仓库外权限为 600 的夹具文件。推荐在同一 Node 进程中准备、执行并收尾：

```js
import { prepareDevEnvironment } from '/实际路径/FastGPT/.agents/test/support/environment.mjs';
import { spawn } from 'node:child_process';
const prepared = await prepareDevEnvironment({
  sourceEnv: '/实际路径/FastGPT/projects/app/.env.local',
  baseUrl: 'http://localhost:3000'
});
try {
  const child = spawn('pnpm', ['test:cases', '--report', '/本轮报告/report.html', '--timeout-ms', '1800000'], {
    cwd: '/实际路径/FastGPT',
    env: { ...process.env, ...prepared.secrets },
    stdio: 'inherit'
  });
  const code = await new Promise(resolve => child.once('exit', resolve));
  if (code !== 0) process.exitCode = 1;
} finally {
  await prepared.dispose();
}
```

先按执行 skill 初始化报告，再运行上述脚本。`fixtures.example.json` 可供手动准备时参考；未选项的配置可省略。不要打印 secrets 或将其作为证据提交。

角色 owner/A/B/N/C/M 都属于本轮团队。A/B 是普通 active 成员，不依赖 owner 身份通过管理员断言。每项创建新的 W/X，通过真实创建和发布入口准备；本轮自建团队的 maxApp 调整为 100 以容纳独立副本和异步清理中的资源，不改变应用 Key 或个人 Key 的额度；权限夹具只修改这些资源的 ACL，需跨团队时再创建第二团队及真实登录态。T1–T7 每个破坏性变体重新创建团队资源，仍复用同一个 dev 和数据库。

补充配置：

- `appKeys.templateAppId`：本轮已发布回显模板；`echoTemplate` 同时包含问题和系统 userId，开启真实文件上传。
- `appKeys.maxKeyCount`：dev 中实际生效的 `OPENAPI_KEY_MAX_COUNT`，不改共享配置。M4 验证每应用固定 100 个；M6 分开验证个人配置与应用额度。T2 仅填满本轮接收人的个人额度。
- A6 从被测 dev 的 `getInitData.feConfigs.isPlus` 确认商业版能力，不依赖夹具里的静态 commercial 标记；License 与 instanceId 必须配套并由真实 Pro 验签。
- `appKeys.datasetId/skillId`：可选同团队资源；缺省时 A4 在本轮团队创建最小资源和 ACL，先验证正向对照，结束精确回收。
- `redis`：D4/D8/D14/D16 自动在本轮新应用中发布 HTTP gate 工作流，复用单轮服务凭证并等待真实 SSE/租约终态，不再要求手工配置 apps.historySwitch。
- `docsBaseUrl`：U4 使用已有文档 dev，缺省 http://localhost:3005，不另启动环境。
- `serviceEnvFileEnv/devSourceEnv`：服务子进程配置及明确的本地 dev 环境文件路径。T1–T7 需要可读的 Pro 源码及依赖。

D8–D11 的逐接口矩阵、引用与音频夹具由脚本在本轮资源内准备。D11 需要 dev 已启用真实 TTS/STT 模型；不通过新增模拟上游或改动共享模型配置代替验证。

D2 必须有真实日志库和 Pro 图表；D5/D6 必须有实际 S3 上传下载，D5 还需 App Sandbox。文件逐字节比较 SHA-256，签名 URL 与 Key 不进入公开证据。

## 生命周期与清理

T1–T4 通过真实业务 HTTP 入口执行；T5 的故障只发生于本轮事务，团队锁冲突只针对本轮 teamId；T6 的转资源开关和 sync 模式只在服务子进程设置，不改 dev 配置；T7 验证真实注销清理及残留检查服务，不宣称已覆盖登录验证、等待期或完整注销端到端。

服务子进程复用现有 Mongo/Redis，并确认目标是本轮 `FG-TEST-*` 团队。凭证从 stdin 或权限受控文件进入，不放在命令行、日志或报告。系统迁移不通过此入口执行。

每项在 finally 中按 ID 清单删除应用和 Key，等待消息、统计及存储回收；再回收测试账号和团队。跨团队资源经该团队真实登录态删除。原签名 URL 应不可读取。共享 dev 有跨分支 Worker 时，本轮 Sandbox 应用经当前代码的真实删除处理器清理，再只读验证实例、远端 provider 及对象消失，不将此结果冒充共享队列分发链路的验收。清理失败不能判通过，保留证据交 AI 复核；不自动重试写请求。UI 必须验证真实可见交互，服务和 HTTP 结果不能替代 UI 断言。
