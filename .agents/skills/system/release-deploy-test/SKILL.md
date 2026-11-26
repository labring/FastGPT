---
name: release-deploy-test
description: FastGPT 版本发布或部署模板变更后的端到端部署与 UI 验收测试。当用户指定部署模板（如 pg/milvus/oceanbase/seekdb/opengauss/zilliz、cn/global）、版本号或镜像 tag，要求在测试主机部署并完成登录激活、模型配置、知识库、应用对话、分享链接验证及生成带截图的 HTML 测试报告时触发。测试完成后默认保留环境供用户复核，仅在用户确认后彻底清理容器、卷与数据。
---

# FastGPT 发布部署验收 (`release-deploy-test`)

用于版本发布后或部署模板升级后的端到端部署验收：从目标 Docker Compose 模板拉起全新隔离实例，校验底层容器与数据库健康，通过浏览器执行简体中文全链路 UI 测试并留存关键截图，基于内置模板生成离线可打开的 HTML 测试报告清单；**验收完成后保留环境供用户自测，待用户明确确认后再清理全部环境与数据**。

## 核心铁律

1. **绝不自动清理测试环境**：验收完成后必须保持容器、数据卷与分享链接持续运行，向用户交付访问信息与报告，**仅在用户明确回复确认后**才执行清理。
2. **宿主机强隔离**：部署前先检查宿主机已有容器、端口与卷，全程使用独立 Compose 项目名（`-p fg_rel_<tag>_<ts>`）与独立远程目录（`/tmp/fastgpt-rel-<tag>-<ts>`）；清理时严格限定在该项目名与临时目录内，严禁波及宿主机原有服务。
3. **测试报告与截图零泄密、零入仓**：上游 AIProxy / 模型渠道的真实 API Key 严禁写入报告 JSON、HTML、聊天回复或截图；测试产物统一放在仓库外临时目录或会话 artifact 目录，不得提交到 Git 仓库。
4. **中文界面与真实链路**：浏览器优先使用 `ego-browser`（EGO Lite），在登录页即切换为**简体中文**后再执行全链路操作与截图；保持模板内置 `fastgpt-aiproxy` 链路不变，由内置 AIProxy 转发至上游模型渠道（如 dev AIProxy），确保模板中的 AIProxy 与其 PostgreSQL 库一并得到验证。
5. **不修改仓库部署模板**：若需调整 `x-fe-domain`、镜像 tag 或宿主机端口映射，仅修改拷贝到临时部署目录的副本，绝不改动仓库内 `document/public/deploy/` 或 `deploy/` 源文件。

## Phase 0：确认测试输入与初始化报告骨架

先从用户输入提取并补齐以下参数；若缺失且无法合理推断（如未指定模板或目标主机），先简短向用户确认：

| 参数 | 说明 / 默认约定 |
| --- | --- |
| 目标模板 | 仓库路径 `document/public/deploy/docker/<version>/<cn\|global>/docker-compose.<vector>.yml`（`<version>` 如 `main`、`v4.16`；`<vector>` 支持 `pg`、`milvus`、`oceanbase`、`seekdb`、`opengauss`、`zilliz`），或用户提供的外部 URL / 文件路径 |
| 目标版本 / 镜像 tag | 默认使用模板内镜像 tag；用户指定发布版本（如 `v4.18.0`）时，仅在临时 compose 副本中替换 `fastgpt`（及按需 `fastgpt-sandbox` / `fastgpt-aiproxy`）镜像 tag |
| 目标宿主机 | 用户指定的 SSH 主机或本机 Docker（例如 `unbuntu26-dev`），获取宿主机可达 IP 用于 `x-fe-domain` |
| 模型上游来源 | 默认接入 dev 环境 AIProxy（可从本地环境配置读取端点与 token，**禁止打印或写入报告**），或使用用户指定的模型渠道；至少覆盖 **LLM + Embedding**，有条件时一并接入 **Rerank / TTS / STT** |

初始化本次验收的工作目录与报告 JSON（统一放在仓库外，如 `/tmp/fastgpt-release-test-<ts>/` 或会话 artifact 目录）：

```bash
node .agents/skills/system/release-deploy-test/scripts/render-report.mjs init \
  --out "<report-dir>/report.json" \
  --title "FastGPT 发布部署验收报告" \
  --template "<template-path>" \
  --version "<target-version>" \
  --region "<cn|global>" \
  --vector-db "<pg|milvus|oceanbase|seekdb|opengauss|zilliz>" \
  --host "<ssh-host-or-local>" \
  --project "<compose-project-name>" \
  --workdir "<remote-workdir>" \
  --base-url "http://<host-ip>:<port>"
```

## Phase 1：隔离部署与基础设施验证 (`D01`–`D03`)

按以下顺序执行，并同步用 `scripts/render-report.mjs update` 记录每项实际结果：

1. **`D01` 宿主机前置检查与模板准备**
   - 检查目标主机当前运行容器、卷与常用端口占用（`3000`、`3006`、`9000`、`9001` 等）；若默认端口被非本次服务占用，仅在临时 compose 副本中调整宿主机端口映射，绝不停掉无关容器。
   - 在目标主机创建独立目录 `/tmp/fastgpt-rel-<tag>-<ts>` 并上传/写入模板副本：
     - 填入 `x-fe-domain: http://<host-ip>:<port>`（以及需要时填入 `x-agent-sandbox-proxy-url`、`x-agent-sandbox-preview-proxy-url`），保证生成的分享链接与文件预览地址可直接访问。
     - 如用户指定发布版本 tag，仅替换临时副本中对应镜像 tag，并记录最终实际镜像列表。
   - 执行 `docker compose -p <project> -f <workdir>/docker-compose.yml config -q` 校验语法无误。
2. **`D02` 容器拉起与服务健康检查**
   - 执行 `docker compose -p <project> -f <workdir>/docker-compose.yml up -d --wait`。
   - 检查 `docker compose -p <project> ps` 全部服务为 `running` / `healthy`；检查 `fastgpt`、`fastgpt-aiproxy` 启动日志，确认自动迁移、索引初始化和 HTTP 监听无异常报错。
   - 记录所有服务实际运行的镜像名与版本（用于填入报告元信息）。
3. **`D03` 数据库版本与持久化目录核验**
   - 核验 MongoDB 版本及副本集状态（`rs.status()` 主节点 `PRIMARY`）、向量库版本与存储目录（例如 PG 18 校验 `SELECT version(); SHOW data_directory;` 与 `vector` 扩展）、AIProxy PG 表结构已自动初始化、Redis 与对象存储（RustFS / MinIO）可正常读写。
   - 将核验到的精确版本号与存储状态写入 `D03` 的 `actual` 字段。

## Phase 2：浏览器中文全链路 UI 验收 (`U01`–`U13`)

优先按 `ego-browser` 技能使用 EGO Lite 操作（新建独立任务空间，完成后关闭自己创建的标签页；严禁触碰用户已有空间）。关键结果截图保存到 `<report-dir>/screenshots/`，命名清晰有序（如 `01-model-config.png` ~ `07-share-link-chat.png`）。

### 必测清单与截图点

| 编号 | 测试项 | 关键动作与通过标准 | 建议截图 |
| --- | --- | --- | --- |
| `U01` | 切换中文与 Root 首次登录 | 打开 `http://<host-ip>:<port>/login`，**先切换语言为简体中文**；使用 `root` + 默认初始密码（v4.17+ 默认为 `123456`，旧模板按其默认值）登录成功 | 可选 |
| `U02` | 管理员首次激活改密 | 触发首次激活弹窗时设置合规测试密码（>=8 位、含大小写/数字/符号，如 `Fastgpt@2026`），确认激活成功进入主界面 | 可选 |
| `U03` | 模型添加与内置 AIProxy 渠道配置 | 进入「模型配置」添加至少 **LLM + Embedding**（可用时补齐 **Rerank / TTS / STT**）；在「模型渠道」新增渠道指向 dev AIProxy（如 `<DEV_AIPROXY>/v1`，**严禁截到明文 Key**）；回到模型列表**逐一打开「启用」开关** | — |
| `U04` | 模型连通性、默认模型与调用日志 | 对已启用模型逐一点击「测试」确认全部通过；设置系统「默认模型」（LLM / 索引模型 / 重排模型等）；打开 AIProxy「调用日志」确认出现 `200` 成功记录 | `01-model-config.png`、`02-aiproxy-logs.png` |
| `U05` | 创建知识库 | 进入「知识库」，新建通用知识库并绑定已验证的索引模型与文本理解模型，创建成功 | — |
| `U06` | 文件上传解析与索引就绪 | 上传包含唯一测试标记（如 `ZETA-9042` 与唯一数字事实）的文本/Markdown 文件，确认分段预览正常、导入后状态变为「已就绪」且分块数 > 0 | `03a-dataset-collection.png` |
| `U07` | 知识库搜索测试 | 在知识库「搜索测试」中针对唯一标记提问，确认召回目标分段且分数正常 | `03b-dataset-search.png` |
| `U08` | 创建应用并关联知识库 | 在「工作台」新建对话 Agent，选择已验证的 LLM 模型并关联上述知识库 | — |
| `U09` | 调试预览对话与引用校验 | 在右侧「调试预览」提问测试文件唯一标记，等待回答完整结束，确认准确命中标记并显示知识库引用 | `04-app-debug-chat.png` |
| `U10` | 保存并发布应用 | 点击右上角「保存 -> 保存并发布」，确认发布成功提示与版本号更新 | — |
| `U11` | 独立对话验证 | 打开应用独立对话页（`/chat?appId=...`），发送测试问题，确认回答准确并包含知识库引用 | `06-standalone-chat.png` |
| `U12` | 创建发布渠道分享链接 | 进入应用「发布渠道 -> 免登录窗口 -> 创建新链接」，确认生成指向 `x-fe-domain` 的公开分享链接 | `05-publish-channel.png` |
| `U13` | 分享链接免登录对话 | 打开生成的 `/chat/share?shareId=...`（确保无管理员登录态依赖，必要时切换左下角语言为简体中文），发送测试问题，确认匿名对话正常且准确召回知识库 | `07-share-link-chat.png` |

### 实操避坑清单

- **默认密码变化**：v4.17.x 起默认 `root` 初始密码为 `123456`（见 `packages/service/support/user/systemUser.ts`），且首次登录强制激活改密。
- **Chakra UI 控件交互**：复选框（`label.chakra-checkbox`）和开关（`label.chakra-switch`）需使用真实鼠标指针点击其中心坐标，不要用合成 DOM `.click()`，否则 React 状态可能不更新。
- **模型渠道弹窗遮挡**：选择模型下拉列表后先点击弹窗空白标签区域关闭下拉浮层，再点击「确认/新增」。
- **应用编排调试输入框与发布菜单**：调试预览 `<textarea>` 通常无原生 `placeholder` 属性（占位文案在兄弟节点中），按可见区域定位；点击「保存」按钮后通过其 `aria-controls` 精确定位弹出菜单中的「保存并发布」。
- **推理模型等待完成**：启用思考/推理能力的模型响应可能需 15–30 秒，需等待目标关键字与「已处理」状态同时出现后再截图。
- **脱敏要求**：截图前确认页面未展示明文 API Key；若需填写 Key，填完关闭渠道编辑弹窗后再截图模型列表与调用日志。

## Phase 3：渲染与交付 HTML 测试报告

执行过程中或全部完成后，调用内置脚本更新各项结果并渲染独立单文件 HTML 报告（默认自动将本地截图内联为 Base64，便于离线打开或转发）：

```bash
# 更新单项结果（可按需重复调用，或直接编辑 report.json）
node .agents/skills/system/release-deploy-test/scripts/render-report.mjs update \
  --input "<report-dir>/report.json" \
  --id "U04" \
  --status "passed" \
  --actual "LLM/Embedding/Rerank 连通性测试全部通过，默认模型已设置，AIProxy 调用日志均为 200。" \
  --screenshot "<report-dir>/screenshots/01-model-config.png::系统模型配置与启用状态" \
  --screenshot "<report-dir>/screenshots/02-aiproxy-logs.png::AIProxy 调用日志 200 校验"

# 更新运行时元信息（激活密码、分享链接、实际镜像等）
node .agents/skills/system/release-deploy-test/scripts/render-report.mjs meta \
  --input "<report-dir>/report.json" \
  --set "rootPassword=Fastgpt@2026" \
  --set "shareUrl=http://<host-ip>:<port>/chat/share?shareId=<id>" \
  --set "retentionStatus=running"

# 渲染自包含 HTML 报告（自动做密钥防泄露检查并内联截图）
node .agents/skills/system/release-deploy-test/scripts/render-report.mjs render \
  --input "<report-dir>/report.json" \
  --out "<report-dir>/release-deploy-report.html"
```

报告内自带以下能力，无需手写 HTML：
- 顶部总览：目标版本/模板/镜像源/主机信息、总体通过率、**环境保留状态横幅**。
- 可人工自测卡片：入口 URL、已激活管理员密码、免登录分享链接、以及用户确认后可执行的精确清理命令。
- 完整验收清单：按阶段分组列出每项的**执行步骤、预期结果、实际结果、状态标签与可点击放大（Lightbox）的截图缩略图**，支持按状态筛选与一键展开/收起步骤。

## Phase 4：保留环境待用户验证 -> 确认后彻底清理

1. **测试完成后（保留阶段）**：
   - **严禁主动执行 `down` 或删除容器/数据卷**。
   - 向用户汇报精简验收结论，并提供：
     - HTML 报告文件链接（可直接在浏览器打开查看清单与截图）
     - 测试环境访问地址、管理员账号与已激活测试密码、公开分享链接
     - 明确提示：**测试环境与数据已保留，可自行登录验证；确认无需保留后回复“清理环境”即可一键移除**。
2. **收到用户明确清理指令后（清理阶段）**：
   - 仅清理本次部署对应的隔离项目与临时目录：
     ```bash
     docker compose -p "<compose-project-name>" -f "<remote-workdir>/docker-compose.yml" down -v --remove-orphans
     rm -rf "<remote-workdir>"
     ```
   - 二次复核：`docker ps -a`、`docker volume ls`、`docker network ls` 确认无本次项目残留，且宿主机原有无关容器仍正常运行。
   - 可选更新报告状态为已清理并重新渲染：
     ```bash
     node .agents/skills/system/release-deploy-test/scripts/render-report.mjs meta \
       --input "<report-dir>/report.json" \
       --set "retentionStatus=cleaned" \
       --set "cleanupNote=用户确认后已移除全部容器、数据卷、网络与远程临时目录，未影响宿主机原有服务。"
     node .agents/skills/system/release-deploy-test/scripts/render-report.mjs render \
       --input "<report-dir>/report.json" \
       --out "<report-dir>/release-deploy-report.html"
     ```
