# 工作流基础运行与 PR-7992 回归夹具

这些 JSON 使用真实节点模板、StoreNode/StoreEdge Schema 和生产端口格式。它们是可绑定的测试图，不是执行成功记录；禁止把 `variableContext`、`fileContext`、sink、函数或 HTTP res 写入导入 JSON。工作流仍由生产运行内核执行，外部 gate 可以受控模拟。

## 生成与校验

在仓库根目录运行：

```bash
node .agents/test/app/workflow/execution/workflow-fixtures.mjs
```

该命令逐份比较生成源和落盘 JSON，校验节点 Schema、重复 ID 与连线端点。需要更新时，`--patch` 输出供 apply_patch 使用的补丁；不自动改动应用或环境。静态校验不能代替导入、发布、真实运行与持久化检查。

## 模板与业务场景

| JSON | 使用场景 | 需要绑定或变更 |
| --- | --- | --- |
| root-variables | WORKFLOW-060/C1、068/C4 | 普通变量更新、Debug 单步与 memory 续跑 |
| special-variables | WORKFLOW-060/C1 | 本轮上传的 PRIVATE_FILE_KEY 与 FILE_URL；测试密码仅为无敏感价值夹具，不保存明文取证 |
| input-precedence | WORKFLOW-068/C1、C5 | 请求 variables 的默认、0、false、空串与不同 RUN；标签别名可按用例变体配置 |
| child-leaf + child-parent | WORKFLOW-060/C6、067/C5 | 先创建发布 leaf，再把真实 App ID 绑定 CHILD_APP_ID；父输出禁止直接共享子变量实例 |
| tool-concurrent | WORKFLOW-060/C2、C3、067/C1、C4 | MODEL_ID 为真实目录 ID，写入 canonical modelId 而非旧 model；工具边 source/targetHandle 均为 selectedTools。C2 从真实 provider 服务入口并发驱动，聊天外壳 batchToolSize=1 不改；C3 则走真实模型 HTTP/聊天链路。错误/暂停变体在工具尾部接 HTTP 失败/Form |
| loop-container | WORKFLOW-068/C3 | 输入数组分别为空和 `[0,false,""]`；容器内外边显式分开 |
| loop-break | WORKFLOW-068/C3 | 三项数组首次即 break；核对只执行一个迭代 |
| parallel-container | WORKFLOW-068/C3、C4 | 空数组/假值数组，零重试；任务结果按索引比对 |
| parallel-retry | WORKFLOW-060/C5 | GATE_URL；按任务索引配置第一次失败/第二次成功，任务 0/1 分别写 a/b，不让所有任务写同一个常量来替代差量断言 |
| loop-checkpoint | WORKFLOW-060/C4、067/C2 | body 前接本轮计数 gate；按用例设 a=checkpoint；恢复携带真实交互，不复制虚假节点快照 |
| interactive-checkpoint | WORKFLOW-060/C3 的暂停对照、Agent 子应用暂停准备 | GATE_URL；按业务将该图发布为对应工具/子应用，不能以普通根表单证明 ToolCall 的暂停提交语义 |
| file-reader | WORKFLOW-066/C1、C2、C5 | FILE_URL 为本轮私有 URL 或受控公网源；分别构造 L/L+1/chunked 内容，不访问真实他人文件 |
| file-form | WORKFLOW-066/C3 | 发布为子应用，父传 A 后两字段提交不同合法文件；同一子登记表额度为 2 |
| model-resource | PERMISSION-RESOURCE-004/C1–C5 | MODEL_ID、真实团队/版本资源快照和角色权限；知识库变体使用正式检索模板替换 Model，不能仅改 modelId 假装知识库测试 |
| agent-child | AGENTV2-001/C1、C2、C4 | MODEL_ID、通过真实工具选择器生成的子应用 id 及 config；A/B 克隆与后代 K 需独立创建，不能只替换展示名 |
| stream-lifecycle | CHAT-CONVERSATION-003、004、WORKFLOW-068/C5 | GATE_URL；流分页变体在 gate 前扩展为 55 个确定回复；跨实例停止另需第二实例共享本轮库 |
| error-routing | WORKFLOW-067/C4、068/C2 | GATE_URL；catchError 开/关与正常端点对照；错误端口使用 source_catch，不是普通 source-catch |
| empty-input | WORKFLOW-068/C1 | 不依赖文件、模型或外部服务的入口对照 |
| basic-dataflow | WORKFLOW-070/C1、C6 | 无外部依赖；V1/V2 前缀区分请求临时图和发布图；串行解析、变量更新与最终消费 |
| basic-parameters | WORKFLOW-069/C1～C3、071/C2 | 真实代码沙箱；字面量/引用/插值、混合数组、动态输入、不同 output.id/key；Python 与抛错为同图变体 |
| basic-http | WORKFLOW-069/C3、C4、071/C1 | GATE_URL + 真实代码沙箱；`/echo` 回显 method/query/安全头/body；Observe 消费 JSONPath、required 默认值和显式 null/假值 |
| basic-fan-in | WORKFLOW-070/C2 | GATE_URL；分别 release `<问题>-Fast` / `<问题>-Slow`；两种完成顺序，Merge 计数、无入口节点不运行 |
| basic-branch | WORKFLOW-070/C3、C4 | GATE_URL；n/flag 变体验证 IF/ELSE IF/ELSE、AND/OR、首个命中、嵌套跳过后汇合 |
| basic-cycle | WORKFLOW-070/C5 | GATE_URL；n 默认 0，每轮 +1，n=3 走出口；不能用无限循环加停止代替正常有界回环 |
| basic-model-chain | WORKFLOW-071/C3 | MODEL_ID 为 dev 已授权模型；Prompt → AI → Reply，直接回复开关不删除 answerText 输出，历史参数独立对照 |
| basic-dataset-chain | WORKFLOW-071/C4 | DATASET_ID / MODEL_ID；真实本轮知识库先训练并预检，Search.quoteQA → AI → Reply；不以伪造数组证明检索正确 |
| basic-tool-child + basic-tool-parent | WORKFLOW-069/C5、071/C5 | 先以工作流工具类型发布 child，绑定 CHILD_TOOL_ID；Plugin Input/Output、缺省与显式空/假值、父输出 ID/key 映射 |
| basic-interactive | WORKFLOW-071/C6 | GATE_URL；真实选择 A/B 后继续表单，沿原 chatId 恢复；动态模式只留 ref_default 出口，移除 SelectedB 及其入出边 |

JSON 是拓扑基线；表中列明的权限矩阵、大小/并发/失败变体由本轮配置绑定生成，执行时应把最终实际 JSON 另存报告 evidence。只有完成对应 Markdown 所有必需变体与断言才能将整行标为通过；拓扑预检或部分 API 结果不能代替 UI、对象存储或权限证据。

## 基础运行覆盖与去重边界

| 验收目标 | 唯一维护位置 |
| --- | --- |
| 字面量/引用/插值、类型、动态输入、输出 ID/key、默认值 | WORKFLOW-069，5 个子场景 |
| 串行、分叉汇合、分支首个命中/AND/OR、嵌套 skip、有界回环、测试/发布入口 | WORKFLOW-070，6 个子场景 |
| HTTP、JS/Python 沙箱、AI、检索及引用合并、个人工具/子应用、选择与表单 | WORKFLOW-071，7 个子场景 |
| 变量提交/回滚、父子与并发隔离、循环 checkpoint、并行 retry | WORKFLOW-060；基础运行只消费其结论，不复制上下文矩阵 |
| 文件登记、权限、配额、读取限制 | WORKFLOW-066 |
| 响应树、汇总、输出隐藏策略 | WORKFLOW-067 |
| v1/v2 与 stream、错误路由、循环/并行空数组与假值/break、Debug、预算/深度 | WORKFLOW-068 |
| 子应用→工作流工具多层错误传播、捕获、循环失败及并行恢复摘要 | WORKFLOW-062 |
| 分类、结构化提取与同节点记忆 | WORKFLOW-063 |
| 旧 runApp/loop/queryExtension 的真实历史图兼容 | WORKFLOW-064；缺历史导出前保持 draft |
| 画布直接工具与模型工具调用、stopTool 和自定义反馈 | WORKFLOW-065 |
| SSE、断连恢复、停止和竞争 | CHAT-CONVERSATION-003/004 |
| Agent 子应用与模型/知识库鉴权 | AGENTV2-001、PERMISSION-RESOURCE-004 |

这里覆盖通用运行链路和代表性常用节点，不声明每个 callback、外部供应商及所有参数组合已穷举。不同系统工具的专有业务规则仍需对应专项验收；不能从通用参数和队列用例推断其已经通过。

## Dev 环境与执行

- 用例定义在同目录 WORKFLOW-060、062～071，以及 AgentV2、权限和会话业务目录；不复制第二份用例库。
- `workflow-fixture-server.mjs` 仅模拟声明的外部空目录、HTTP gate/错误和文件源；未知路由 404，不返回假的 Workflow、变量、权限、模型 usage 或代码执行结果。
- 复用已授权的本地 Dev 主站、Pro 和配置；每轮创建并记录专用 `FG-TEST` 团队、应用及数据，清理严格限定本轮资源清单。数据库专项测试使用 Mac Mini（100.96.142.32）的独立测试库、schema 或 Redis DB，本机不得新建数据库、容器或存储卷。凭据不写入用例和报告。
- 已验证的完整子场景在对应 Markdown 的 `automation` 中声明；其他子场景仍须由执行方逐项运行，不能因同用例其他场景通过而推断通过。辅助脚本不会创建本地数据库；不得对共享 dev 安装临时模型或执行原始数据库清理。
- 报告由 integration-test-runner 初始化；执行前逐项写 running，完成后保存真实响应、绑定图与数据库差集。缺少模型目录/Pro/沙箱/第二实例时只阻塞受影响场景，不把其他分支的成功外推。
- 不自动提交、部署、修改全站配置或连接生产环境。清理只针对本轮 FG-TEST 应用和专用依赖。

确认本地 Dev 主站、Pro、模型和沙盒可用后，为本轮准备测试团队（不启动新数据库或 Redis）：

```bash
node .agents/test/support/environment.mjs \
  --source-env /本地/dev/projects/app/.env.local \
  --base-url http://localhost:3000
```

准备器输出的临时目录含 `fixture.json` 和仅限本机读取的 `secrets.json`，不得提交或粘贴凭据；退出时只回收登记的测试应用、会话、团队和账号。共享 Dev 不安装临时系统模型；需要可控模型的场景应准备有权限的团队模型，无法完整观测时如实阻塞。Pro 功能需要有效授权，不能复制或伪造授权来绕过检查。

报告初始化后，先用 `report.mjs context` 填写实际测试环境及主站 `--base-url`；否则调度器无法构造请求地址。再把该目录内的凭据安全传给正式调度器（不会打印环境变量）：

```bash
node -e 'const fs=require("fs"),{spawnSync}=require("child_process");const secrets=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const result=spawnSync("pnpm",["test:cases","--report",process.argv[2]],{env:{...process.env,...secrets},stdio:"inherit"});process.exit(result.status??1)' \
  /实际临时目录/secrets.json /实际报告目录/report.html
```
