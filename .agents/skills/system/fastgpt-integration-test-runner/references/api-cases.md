# 接口与租约用例的测试配置

三个脚本复用现有报告协议，仅手动运行，不加入 CI 或默认 `pnpm test`：

| 用例 | 完整脚本执行项 | 其他项 |
| --- | --- | --- |
| FG-INTEGRATION-OPENAPI-001 | C1–C8 | 无 |
| FG-CHAT-HISTORY-FEEDBACK-001 | C3、C4、C6 | C1、C2、C5 仍需实际 UI、hover、刷新与页面 CSV 下载 |
| FG-CHAT-CONVERSATION-001 | C1-API、C2 | C1-ENTRY 及 C3–C5 按原用例执行；不将普通 API 的结果覆盖 Pro/Skill/MCP/定时入口 |

## 配置与凭证

复制 `.agents/test/support/fixtures.example.json` 到仓库外，填入真实测试资源，将路径设为 `FASTGPT_TEST_FIXTURE`。配置只保存环境变量名，不保存 Key、Cookie、数据库 URI。未选场景的额外配置可省略；选中行缺少必要配置时记录 blocked。配置的 BASE_URL 必须与报告一致，teamId 必须是实际团队 ID。

- `actors.A/B`：原用例的鉴权成员；C7 需要两者真实用户名。`proxy` 是 owner 创建且开启代理的团队级 Key，tmbId 为 Key 创建者。普通 A Key 不开启代理。
- `actors.owner.stateEnv` 指向已登录 owner 的 Playwright storage state 文件路径。owner 必须能清理所有测试应用内的运行记录。脚本不读取默认浏览器 Cookie 或自动发现环境凭证。
- `apps.identity/deniedForA/deniedForB`：W/X/Y 三个独立应用，固定回复按 `echoTemplate` 输出。X 需 B 可读、A 不可读；Y 需代理 Key 创建者可读、B 不可读。C6/C8 先做真实正向访问，不能靠不存在应用或参数错误验证权限。
- 默认固定回复节点会在回复前添加换行，示例 echoTemplate 因此包含 `\n`。按实际节点输出声明格式，脚本逐字比较，不用 trim 掩盖 UID 两侧空格或其他差异。
- `members.foreign/departed`：分别是其他团队的成员、同测试团队内已离职的成员。不要用同一个跨团队成员同时冒充离职分支。
- `mongo.uriEnv/logUriEnv`：对应主库与真实日志库的只读连接；脚本仅按 teamId、appId、精确 chatId 白名单查询。日志库未单独配置时可与主库使用相同 URI。
- `logs`：按原用例准备完成的 D1 真实数据及旧分享夹具。records 要登记原始身份、来源、反馈和搜索用到的 title/customTitle，dateStart/dateEnd 包含全部记录。logViewer 用有 AppReadChatLogPer 权限的 Key，N 用没有此权限的有效 Key；跨团队应用也必须真实存在。C6 的导出接口仅支持登录态，两个角色另需 `stateEnv` 指向各自的 Playwright storage state；脚本先核对登录身份有效，再验证日志权限，不将无效 Cookie 当成权限拒绝。

身份权限不能由 root 全局权限代替；所有 Key/成员/应用关系先实际核验。产生对话的应用必须在 `lifecycle.disposeApps` 显式登记，并在主库核验属于测试团队、名称以 `FG-TEST-` 开头。脚本结束后先按本轮 chatId 白名单删除消息，再经正常应用删除 API 回收该独立应用及统计；不能指向共享应用。配置中的独立应用每轮重新准备。只读日志脚本不改变静态 D1 数据，D1 应用、Key、分享等准备资源由本轮准备方统一回收。

## HTTP gate 与租约

在独立 gate 工作流中放一个 HTTP 请求节点，再接固定回复。HTTP 节点 POST 到可从被测服务访问的 `http://<测试机>:4711/wait`：

- 请求头 `x-fastgpt-test-token` 为 `FASTGPT_TEST_GATE_TOKEN` 的测试专用值。
- JSON body 为 `{ "runId": "<通过真实变量选择器引用当前用户问题>" }`，原值传入问题字符串。
- 将 HTTP 节点超时显式设为 100 秒，覆盖 65 秒无输出等待；默认 30 秒会在续租观察结束前失败。
- 回复节点按相同 echoTemplate 输出问题与系统 userId；不调用不确定的模型输出代替 gate。

脚本在该端口启动真实 HTTP 服务，只有本进程内的 barrier 能放行；未知 RUN/错误 token 拒绝访问。地址和 token 属于本轮测试配置，使用私有网络，避免代理改变协议。端口被占用时记录 blocked，不停止别人的服务。

C1-API 对 v1/v2 各观察完整 65 秒，采样 owner/PTTL，确认续租后放行并验证下一轮。C2 必须提供两个独立 FastGPT 服务实例的地址，它们共享本例 Mongo/Redis；缺失时整行不执行。Redis 使用真实 DAL key helper 生成物理 key，只执行 GET/PTTL，不修改租约。

## 运行与验证

```bash
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs init \
  --ids FG-INTEGRATION-OPENAPI-001 --reason "customUid 真实回归" \
  --environment "实际测试环境" --base-url http://127.0.0.1:3000 --target-version "已核实部署版本"

# 各凭证/连接环境变量提前在本机安全设置，不将它们写入命令历史或报告。
FASTGPT_TEST_FIXTURE=/仓库外/fixtures.json pnpm test:cases --report /实际临时目录/report.html
```

按子场景执行时用原有 selection JSON 或显式复测 `--case ... --items ...`。租约 C1-API 是约 130 秒的必要观察，不缩短 TTL 或替换成 sleep 后假通过。所有实际响应、SSE、限定快照、采样与清理结果写入本轮证据目录；失败仍由 AI 查证。

维护这些脚本时，局部运行 `node --test .agents/test/support/runtime.selftest.mjs`。自检使用临时 HTTP/控制场景验证脚本协议，不作为 FastGPT 业务通过证据；真实用例仍需上述环境。
