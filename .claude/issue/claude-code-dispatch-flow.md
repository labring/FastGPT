# Claude Code 调度逻辑分析图

> 基于 claude-code-source-code v2.1.88 源码分析

---

## 图 1：宏观启动流程

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#E8F0FB', 'primaryTextColor': '#37352F', 'primaryBorderColor': '#A5C0E8', 'lineColor': '#9099A6', 'fontSize': '14px'}}}%%
flowchart TD
    A([▶ 用户执行 claude 命令]) --> B

    subgraph BOOT ["  初始化阶段  "]
        B["main.tsx 入口"]
        B1["并行预取\nKeychain / MDM 配置"]
        I["init · entrypoints/init.ts"]
        I1["加载 config.json"]
        I2["检查 OAuth / API Key"]
        I3["初始化 MCP 客户端"]
        I4["加载所有工具 getAllBaseTools"]
        I5["初始化 feature flags GrowthBook"]
        B --> B1
        B --> I
        I --> I1 & I2 & I3 & I4 & I5
    end

    B --> C["Commander 解析 CLI 参数"]
    C --> D{{"模式判断"}}

    D -->|交互式 REPL| E["launchRepl · replLauncher.tsx"]
    D -->|非交互 -p 参数| F["QueryEngine.submitMessage"]
    D -->|--resume 恢复会话| G["加载历史会话\n构建 messages[]"]

    E --> H["React / ink 渲染 UI\nREPL.tsx"]
    G --> F

    H -->|用户输入| J["processUserInput"]
    F --> J
    J --> K(["⚙ query · query.ts\nAgent Loop 入口"])

    classDef entry    fill:#EAE4F2,stroke:#9065B0,stroke-width:1.5px,color:#37352F
    classDef boot     fill:#E8F0FB,stroke:#A5C0E8,stroke-width:1px,color:#37352F
    classDef decision fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#37352F
    classDef terminal fill:#D1FAE5,stroke:#059669,stroke-width:2px,color:#1A3A2A

    class A entry
    class K terminal
    class D decision
    class B,B1,I,I1,I2,I3,I4,I5,C,E,F,G,H,J boot
```

---

## 图 2：Agent Loop 主循环（核心）

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#E8F0FB', 'primaryTextColor': '#37352F', 'primaryBorderColor': '#A5C0E8', 'lineColor': '#9099A6', 'fontSize': '14px'}}}%%
flowchart TD
    START(["⚙ 进入 queryLoop"]) --> PREP

    PREP[/"预处理 · Context 管理\n① snipCompactIfNeeded\n② microcompactMessages\n③ applyCollapsesIfNeeded\n④ autoCompactIfNeeded"/]
    PREP --> API

    API["🌐 queryModelWithStreaming\n调用 Anthropic API · 流式接收响应"]
    API --> STREAM

    STREAM{{"包含\ntool_use block?"}}
    STREAM -->|否 · 纯文本| HOOK
    STREAM -->|是 · 有工具调用| TOOLS

    HOOK["handleStopHooks\n运行 Stop Hooks"]
    HOOK --> HOOK_DEC{{"Hook\n决定?"}}
    HOOK_DEC -->|阻止继续| X_HOOK(["退出\nstop_hook_prevented"])
    HOOK_DEC -->|继续| BUDGET

    BUDGET{{"Token Budget\n超出?"}}
    BUDGET -->|否| X_OK(["✓ 退出\ncompleted"])
    BUDGET -->|是 · 注入收尾提示| PREP

    TOOLS["runTools 或 StreamingToolExecutor\n工具调度 → 见图 3"]
    TOOLS --> COLLECT

    COLLECT["收集 tool_results\ngetAttachmentMessages 获取附件"]
    COLLECT --> REBUILD

    REBUILD["构建下一轮 State\nmessages = 上轮 + assistant + results + attachments\nturnCount++"]
    REBUILD --> PREP

    API -->|"Ctrl+C · 流式阶段"| X_AS(["退出\naborted_streaming"])
    TOOLS -->|"Ctrl+C · 工具阶段"| X_AT(["退出\naborted_tools"])
    API -->|"max_output_tokens\n连续 3 次"| X_MT(["退出\nmax_output_tokens"])
    API -->|"context 超限\n压缩无效"| X_TL(["退出\nprompt_too_long"])
    TOOLS -->|"pre-hook 中止"| X_HS(["退出\nhook_stopped"])

    classDef entry   fill:#EAE4F2,stroke:#9065B0,stroke-width:2px,color:#37352F
    classDef process fill:#E8F0FB,stroke:#A5C0E8,stroke-width:1px,color:#37352F
    classDef prep    fill:#F0F4FF,stroke:#8BA4D4,stroke-width:1px,color:#37352F,font-style:italic
    classDef api     fill:#E0E7FF,stroke:#4F46E5,stroke-width:1.5px,color:#2D2B6B
    classDef tool    fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#37352F
    classDef ok      fill:#D1FAE5,stroke:#059669,stroke-width:2px,color:#1A3A2A
    classDef err     fill:#FEE2E2,stroke:#DC2626,stroke-width:1.5px,color:#7F1D1D
    classDef warn    fill:#FED7AA,stroke:#EA580C,stroke-width:1.5px,color:#431407
    classDef dec     fill:#FFFBEB,stroke:#D97706,stroke-width:1.5px,color:#37352F

    class START entry
    class PREP prep
    class API api
    class TOOLS tool
    class COLLECT,REBUILD,HOOK process
    class X_OK ok
    class X_AS,X_AT,X_HS err
    class X_MT,X_TL,X_HOOK warn
    class STREAM,HOOK_DEC,BUDGET dec
```

---

## 图 3：工具调度与执行

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#E8F0FB', 'primaryTextColor': '#37352F', 'primaryBorderColor': '#A5C0E8', 'lineColor': '#9099A6', 'fontSize': '14px'}}}%%
flowchart TD
    IN(["收到 toolUseBlocks[]"]) --> PART

    PART["partitionToolCalls\n按 isConcurrencySafe 分批"]

    PART --> SAFE["只读工具批次\nFileRead · Glob · Grep …"]
    PART --> UNSAFE["写入工具批次\nFileEdit · FileWrite · Bash …"]

    SAFE --> CON["runToolsConcurrently\n并行执行 · 最多 10 个\nCLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY"]
    UNSAFE --> SER["runToolsSerially\n严格串行执行"]

    CON --> RUN
    SER --> RUN

    RUN["runToolUse\n单个工具执行入口"]

    RUN --> V["① 输入验证\nZod schema · validateInput"]
    V  --> PH["② Pre-tool Hooks\nrunPreToolUseHooks"]
    PH --> PC["③ 权限检查\ncanUseTool  →  见图 4"]

    PC --> DEC{{"权限\n决定"}}
    DEC -->|allow| EX["④ 执行工具\ntool.call(input, ctx, onProgress)"]
    DEC -->|deny|  DR(["返回 ToolResult\n拒绝原因"])
    DEC -->|abort| AB(["⛔ 中止整个会话"])

    EX --> POH["⑤ Post-tool Hooks\nrunPostToolUseHooks"]
    POH --> RES(["返回 ToolResult ✓"])

    STREAM_NOTE["🚀 StreamingToolExecutor\n流中出现完整 tool_use block\n立即启动，与后续流并行执行"]
    STREAM_NOTE -.->|提前触发| RUN

    classDef entry   fill:#EAE4F2,stroke:#9065B0,stroke-width:2px,color:#37352F
    classDef process fill:#E8F0FB,stroke:#A5C0E8,stroke-width:1px,color:#37352F
    classDef blue    fill:#E0E7FF,stroke:#4F46E5,stroke-width:1.5px,color:#2D2B6B
    classDef green   fill:#D1FAE5,stroke:#059669,stroke-width:1.5px,color:#1A3A2A
    classDef red     fill:#FEE2E2,stroke:#DC2626,stroke-width:1.5px,color:#7F1D1D
    classDef amber   fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#37352F
    classDef stream  fill:#FFF7ED,stroke:#EA580C,stroke-width:1.5px,stroke-dasharray:5 3,color:#431407
    classDef dec     fill:#FFFBEB,stroke:#D97706,stroke-width:1.5px,color:#37352F

    class IN entry
    class CON blue
    class SER blue
    class RES green
    class DR,AB red
    class PART,RUN,V,PH,EX,POH process
    class PC amber
    class STREAM_NOTE stream
    class DEC dec
```

---

## 图 4：权限决策树

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#E8F0FB', 'primaryTextColor': '#37352F', 'primaryBorderColor': '#A5C0E8', 'lineColor': '#9099A6', 'fontSize': '14px'}}}%%
flowchart TD
    START(["canUseTool 被调用"]) --> P1

    P1{{"① alwaysDenyRules\n命中黑名单?"}}
    P1 -->|是| DENY1(["🚫 deny"])
    P1 -->|否| P2

    P2{{"② alwaysAskRules\n命中需询问规则?"}}
    P2 -->|是 · 非沙箱| ASK
    P2 -->|否| P3

    P3{{"③ tool.checkPermissions\n工具自身检查"}}
    P3 -->|deny|              DENY2(["🚫 deny"])
    P3 -->|ask · 非safetyCheck| ASK
    P3 -->|ask · safetyCheck|  ASK_S
    P3 -->|allow|              P4

    P4{{"④ requiresUserInteraction\n强制用户交互?"}}
    P4 -->|是| ASK
    P4 -->|否| P5

    P5{{"⑤ 内容级 ask 规则\n如 npm publish:*"}}
    P5 -->|命中| ASK_S
    P5 -->|未命中| P6

    P6{{"⑥ safetyCheck\n.git · .claude · shell 配置"}}
    P6 -->|命中| ASK_S
    P6 -->|未命中| P7

    P7{{"⑦ bypassPermissions\n模式开启?"}}
    P7 -->|是| ALLOW1(["✅ allow"])
    P7 -->|否| P8

    P8{{"⑧ alwaysAllowRules\n命中白名单?"}}
    P8 -->|是| ALLOW2(["✅ allow"])
    P8 -->|否| ASK

    ASK["behavior = ask\n进入模式路由"]
    ASK_S["behavior = ask  🔒\nbypass 也无法豁免"]
    ASK   --> ROUTER
    ASK_S --> ROUTER

    ROUTER{{"当前权限模式?"}}
    ROUTER -->|dontAsk|         AD1(["🚫 自动拒绝"])
    ROUTER -->|auto / plan+auto| CLS
    ROUTER -->|shouldAvoidPrompts| HKP
    ROUTER -->|default 交互式|   UI

    CLS["🤖 AI 分类器\nclassifyYoloAction"]
    CLS --> CDEC{{"分类\n结果"}}
    CDEC -->|allow|               ALLOW3(["✅ allow"])
    CDEC -->|deny · 未超拒绝上限| AD2(["🚫 自动拒绝"])
    CDEC -->|deny · 超过拒绝上限| UI

    HKP["外部 PermissionRequest Hooks"]
    HKP --> HDEC{{"Hook\n决定"}}
    HDEC -->|allow|  ALLOW4(["✅ allow"])
    HDEC -->|无决定| AD3(["🚫 自动拒绝"])

    UI["💬 交互式弹窗\nhandleInteractivePermission\n推送到 REPL UI 队列"]
    UI --> UDEC{{"用户\n操作"}}
    UDEC -->|onAllow| ALLOW5(["✅ allow"])
    UDEC -->|onReject| DENY3(["🚫 deny"])
    UDEC -->|onAbort|  ABORT(["⛔ 中止会话"])

    classDef entry   fill:#EAE4F2,stroke:#9065B0,stroke-width:2px,color:#37352F
    classDef dec     fill:#FFFBEB,stroke:#D97706,stroke-width:1.5px,color:#37352F
    classDef route   fill:#F0F4FF,stroke:#8BA4D4,stroke-width:1px,color:#37352F
    classDef allow   fill:#D1FAE5,stroke:#059669,stroke-width:1.5px,color:#1A3A2A
    classDef deny    fill:#FEE2E2,stroke:#DC2626,stroke-width:1.5px,color:#7F1D1D
    classDef abort   fill:#1C1917,stroke:#1C1917,stroke-width:1px,color:#F5F5F4
    classDef ai      fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#37352F
    classDef ui      fill:#E0E7FF,stroke:#4F46E5,stroke-width:1.5px,color:#2D2B6B

    class START entry
    class P1,P2,P3,P4,P5,P6,P7,P8,ROUTER,CDEC,HDEC,UDEC dec
    class ASK,ASK_S route
    class ALLOW1,ALLOW2,ALLOW3,ALLOW4,ALLOW5 allow
    class DENY1,DENY2,DENY3,AD1,AD2,AD3 deny
    class ABORT abort
    class CLS ai
    class UI,HKP ui
```

---

## 图 5：数据流与 AsyncGenerator 链

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#E8F0FB', 'primaryTextColor': '#37352F', 'primaryBorderColor': '#A5C0E8', 'lineColor': '#9099A6', 'fontSize': '14px'}}}%%
flowchart LR
    USER(["👤 用户输入"])

    subgraph SDK ["QueryEngine.ts · SDK 层"]
        direction TB
        QE1["submitMessage"]
        QE2["processUserInput\nslash commands · 附件"]
        QE3["fetchSystemPromptParts\n构建 system prompt"]
    end

    subgraph LOOP ["query.ts · Agent Loop"]
        direction TB
        Q1["query(params)\nAsyncGenerator"]
        Q2["queryLoop()\nwhile(true) 主循环"]
        Q1 -->|yield*| Q2
    end

    subgraph APILAYER ["claude.ts · API 层"]
        direction TB
        A1["queryModelWithStreaming\nAnthropic SDK stream"]
    end

    subgraph TOOLLAYER ["toolOrchestration.ts · 工具层"]
        direction TB
        T1["runTools\n批次划分 + 调度"]
        T2["runToolUse\n单工具执行"]
        T3["tool.call\n实际执行"]
        T1 --> T2 --> T3
    end

    subgraph PERMLAYER ["permissions.ts · 权限层"]
        direction TB
        P1["hasPermissionsToUseTool"]
        P2["canUseTool 回调"]
    end

    subgraph UILAYER ["REPL.tsx · UI 层"]
        direction TB
        U1["useQueueProcessor\n消息队列处理"]
        U2["ToolUseConfirm\n权限确认弹窗"]
    end

    STREAM[("📡 消息流\n实时 yield")]

    USER -->|"Message[]"| QE1
    QE1  --> Q1
    Q2  <-->|"for await"| A1
    A1   -->|"yield assistant message"| STREAM
    STREAM -->|"stream 消息"| U1

    Q2   -->|"toolUseBlocks"| T1
    T3   -->|"ToolResult → yield 回"| Q2
    T2  <-->|"权限查询"| P1
    P2  <-->|"ask 时推送确认"| U2

    classDef user    fill:#EAE4F2,stroke:#9065B0,stroke-width:2px,color:#37352F
    classDef stream  fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#37352F
    classDef sdk     fill:#E8F0FB,stroke:#A5C0E8,color:#37352F
    classDef loop    fill:#E0E7FF,stroke:#4F46E5,color:#2D2B6B
    classDef apil    fill:#F0F4FF,stroke:#8BA4D4,color:#37352F
    classDef tool    fill:#FEF9EC,stroke:#D97706,color:#37352F
    classDef perm    fill:#FFF0F0,stroke:#DC2626,color:#37352F
    classDef ui      fill:#F0FDF4,stroke:#059669,color:#37352F

    class USER user
    class STREAM stream
    class SDK sdk
    class LOOP loop
    class APILAYER apil
    class TOOLLAYER tool
    class PERMLAYER perm
    class UILAYER ui
```

---

## 关键设计要点

| 特性 | 实现方式 | 源文件 |
|------|---------|--------|
| **全链路流式** | 每层均为 `AsyncGenerator`，`yield` 链式传递 | `query.ts` · `claude.ts` |
| **流式工具提前启动** | 流中出现完整 `tool_use` block 即立即执行，与后续流并行 | `StreamingToolExecutor.ts` |
| **工具并发控制** | `isConcurrencySafe` 分批，最多 10 并发 | `toolOrchestration.ts` |
| **Context 自动管理** | 超 token 时自动压缩/裁剪，对上层透明 | `query.ts` |
| **Token Budget** | 工具返回内容累计超限时注入收尾提示，防止无限循环 | `query.ts` |
| **多级权限** | 8 级判断规则 + 5 种模式路由（含 AI 分类器） | `permissions.ts` |
| **AbortController 层次** | 会话级 + 工具批次级，兄弟工具失败可互相取消 | `toolExecution.ts` |
| **启动并行优化** | Keychain / MDM 在 `main.tsx` 顶部并行预取 | `main.tsx` |
