# FastGPT Markdown 受控 HTML 渲染与多媒体增强技术设计文档

## 1. 背景与现状分析

### 1.1 问题现状
FastGPT 目前在 Markdown 渲染多媒体与富文本时存在两个核心限制：

1. **外部视频/音频播放失效（CORS 拦截与内存瓶颈）**：
   - 现有的 `VideoBlock`（[Video.tsx](/Volumes/code/FastGPT/projects/app/src/components/Markdown/codeBlock/Video.tsx)）和 `AudioBlock`（[Audio.tsx](/Volumes/code/FastGPT/projects/app/src/components/Markdown/codeBlock/Audio.tsx)）使用前端 JavaScript `fetch(videoUrl, { mode: 'cors' }).then(res => res.blob())` 加载媒体资源。
   - 外部媒体服务器（第三方对象存储、CDN、公网视频直链）绝大多数未配置 `Access-Control-Allow-Origin: *`，导致浏览器直接拦截请求（CORS Error），播放器无播放源导致黑屏。
   - `response.blob()` 强制一次性全量下载完整文件到内存，大文件易导致长时间无画面、高内存占用甚至崩溃，且破坏了浏览器原生的 HTTP Range 分段流式加载机制。
2. **缺乏原生 HTML 标签支持**：
   - 当前渲染流水线基于 `react-markdown` + Remark 插件（[index.tsx](/Volumes/code/FastGPT/projects/app/src/components/Markdown/index.tsx)），未开启 HTML 节点解析。
   - 当大语言模型自然生成常见的排版标签（如 `<video src="..." controls></video>`、`<details><summary>思考过程</summary>...</details>`、`<font color="red">`、`<mark>`、`<sub>`、`<progress>`）时，标签会被直接转义为纯文本字符串或被丢弃，无法呈现结构化富交互。

### 1.2 核心安全边界澄清
在放开 HTML 渲染的考量中，必须坚持第一性原理厘清安全攻击面：
- **CSRF 防御无效性**：服务端的 CSRF Token、SameSite Cookie 等防护仅面向跨站伪造请求；一旦不可信 HTML 在 FastGPT 主域上下文中执行脚本（XSS），恶意代码拥有同源最高执行权限，可直接读取前端内存中持有的 Token、知识库数据并冒充用户发起同源合法请求。**API 层的 CSRF 防御对同源 XSS 毫无抵抗力**。
- **唯一可行防线是严格的 AST 级白名单净化（Sanitization）**：必须确保进入 React DOM 树的 HTML 节点在语法树阶段剔除所有可执行载荷（`<script>`、所有 `on*` 事件、`javascript:` / `data:` 伪协议、高危通用样式与内联属性）。

---

## 2. 目标与非目标

### 2.1 目标
1. **对齐并超越 Dify 的受控 HTML 渲染能力**：
   - 完整支持多媒体（`<video>`、`<audio>`、`<source>`、`<track>`）；
   - 支持结构化折叠（`<details>`、`<summary>`，兼容模型推理 `data-think` 属性）；
   - 支持高频文本排版（`<mark>`、`<sub>`、`<sup>`、`<kbd>`、`<font>`、`<abbr>`、`<ruby>` 等）；
   - 支持数据可视化与度量标签（`<progress>`、`<meter>`、`<figure>`、`<figcaption>`）；
   - 支持复杂表格排版扩展（`rowspan`、`colspan`、`align`、`<colgroup>`、`<col>`、`<caption>`）。
2. **彻底修复外部媒体流式加载与跨域播放**：
   - 废弃前端 `fetch` 转 Blob 逻辑，回归 HTML 原生跨源媒体嵌入机制；
   - 支持 HTTP Range 分段流式缓冲，支持外部大文件边下边播与拖动进度条。
3. **保障企业级流式大模型输出的平滑度与性能**：
   - 兼容 FastGPT 现有的 `splitMarkdownBlocks` 分块缓存引擎与 `rehypeStreamAnimated` 打字淡入动画；
   - 增加未闭合流式 HTML 标签保护，杜绝打字过程中的频繁 AST 突变、重复媒体请求与闪烁。
4. **共享模块抽离**：
   - 将安全净化 Schema 与 URL 校验规则抽离至共享库（`packages/global`），统一主对话组件与 Web 公共 Markdown 的安全基线。

### 2.2 非目标
1. 不放开任意无限制的 HTML 渲染，禁止任何可执行脚本环境与外联 CSS 注入；
2. 不替换 FastGPT 现有的 Markdown 分块与动画运行时核心（不全量迁移到 `streamdown` 等重型外部库，避免破坏现有的打字机、知识库引用与长文本性能）；
3. 自由度过高的任意网页内嵌依旧通过专属受限沙箱（`iframe` 代码块）承载，不通过正文原生开放未受控的 `<iframe>`。

---

## 3. 详细架构设计与代码组织结构

### 3.0 模块目录划分
为解决 Markdown 模块历史文件堆叠、职责混杂问题，代码被清晰拆分为三个专注子目录：

1. **`components/`（自定义与受控渲染组件）**
   - 基础与富媒体组件：`Video.tsx`、`Audio.tsx`、`Image.tsx`、`A.tsx`
   - 代码块与预览：`Code.tsx`（分发路由）、`CodeLight.tsx`、`Iframe.tsx`、`IframeHtml.tsx`、`MermaidCodeBlock.tsx`、`EChartsCodeBlock.tsx`
   - 交互与排版扩展：`Details.tsx`、`Summary.tsx`、`Mark.tsx`、`Kbd.tsx`、`Font.tsx`、`Progress.tsx`、`RewritePre.tsx`
   - 聊天交互：`Guide.tsx`、`QuestionGuide.tsx`、`QuickReplies.tsx`
   - 统一入口：`index.tsx`（集中导出 `markdownComponents` 映射表与动态按需加载）

2. **`stream/`（流式输出与增量动画）**
   - `streamMarkdownBlocks.ts`（基于 lexer 的块级切分）
   - `streamAnimationRuntime.ts`（动画时间线与 block runtime 调度）
   - `rehypeStreamAnimated.ts`（流式打字末尾字符淡入插件）
   - `CachedMarkdown.tsx`（已完成块的 React 子树 memo 缓存）
   - `index.ts`（统一导出流管理能力）

3. **`utils/`（工具与安全规范）**
   - `index.ts`（格式化、尾部防抖、代码块枚举）
   - `plugins.ts`（Unified 插件流水线配置与 URL 转换安全函数）
   - `hooks.ts`（`useMarkdownWidth` 等）
   - `runtimeContext.ts`（`MarkdownRendererRuntimeContext` 状态上下文）
   - `sanitizeSchema.ts`（独立存放的 `fastgptMarkdownSanitizeSchema` 安全白名单，不被隐式 re-export）
   - `rehypeImageCitations.ts`（引用标签清洗与识别）

4. **`type.ts`（独立类型定义）**
   - 包含 `MarkdownProps`、`Props` 以及 `MarkdownStreamBlockProps`，统一各模块类型约定。
   - `index.ts`（格式化、尾部防抖、代码块枚举）
   - `hooks.ts`（`useMarkdownWidth` 等）
   - `runtimeContext.ts`（`MarkdownRendererRuntimeContext` 状态上下文）
   - `sanitizeSchema.ts`（`fastgptMarkdownSanitizeSchema` 安全白名单配置）
   - `rehypeImageCitations.ts`（引用标签清洗与识别）

4. **主入口 `index.tsx`**
   - 专注渲染调度与 Context 注入，消除内联组件定义，代码规模收敛至 300 行以内。与代码组织结构

### 3.0 模块目录划分
为解决 Markdown 模块历史文件堆叠、职责混杂问题，代码被清晰拆分为三个专注子目录：

1. **`components/`（自定义与受控渲染组件）**
   - 基础与富媒体组件：`Video.tsx`、`Audio.tsx`、`Image.tsx`、`A.tsx`
   - 代码块与预览：`Code.tsx`（分发路由）、`CodeLight.tsx`、`Iframe.tsx`、`IframeHtml.tsx`、`MermaidCodeBlock.tsx`、`EChartsCodeBlock.tsx`
   - 交互与排版扩展：`Details.tsx`、`Summary.tsx`、`Mark.tsx`、`Kbd.tsx`、`Font.tsx`、`Progress.tsx`、`RewritePre.tsx`
   - 聊天交互：`Guide.tsx`、`QuestionGuide.tsx`、`QuickReplies.tsx`
   - 统一入口：`index.tsx`（集中导出 `markdownComponents` 映射表与动态按需加载）

2. **`stream/`（流式输出与增量动画）**
   - `streamMarkdownBlocks.ts`（基于 lexer 的块级切分）
   - `streamAnimationRuntime.ts`（动画时间线与 block runtime 调度）
   - `rehypeStreamAnimated.ts`（流式打字末尾字符淡入插件）
   - `CachedMarkdown.tsx`（已完成块的 React 子树 memo 缓存）
   - `index.ts`（统一导出流管理能力）

3. **`utils/`（工具与安全规范）**
   - `index.ts`（格式化、尾部防抖、代码块枚举）
   - `plugins.ts`（Unified 插件流水线配置与 URL 转换安全函数）
   - `hooks.ts`（`useMarkdownWidth` 等）
   - `runtimeContext.ts`（`MarkdownRendererRuntimeContext` 状态上下文）
   - `sanitizeSchema.ts`（独立存放的 `fastgptMarkdownSanitizeSchema` 安全白名单，不被隐式 re-export）
   - `rehypeImageCitations.ts`（引用标签清洗与识别）

4. **`type.ts`（独立类型定义）**
   - 包含 `MarkdownProps`、`Props` 以及 `MarkdownStreamBlockProps`，统一各模块类型约定。
   - `index.ts`（格式化、尾部防抖、代码块枚举）
   - `hooks.ts`（`useMarkdownWidth` 等）
   - `runtimeContext.ts`（`MarkdownRendererRuntimeContext` 状态上下文）
   - `sanitizeSchema.ts`（`fastgptMarkdownSanitizeSchema` 安全白名单配置）
   - `rehypeImageCitations.ts`（引用标签清洗与识别）

4. **主入口 `index.tsx`**
   - 专注渲染调度与 Context 注入，消除内联组件定义，代码规模收敛至 300 行以内。

### 3.1 渲染流水线（Unified AST Pipeline）

Markdown 文本从原始输入到挂载 React 真实 DOM 的完整处理链条如下：

```
                       Markdown 文本（混排受控 HTML）
                                     ↓
        阶段 1：流式预处理 (prepareStreamingMarkdown / utils.ts)
           - 延迟未闭合的 HTML 标签尾巴（防止对半截 URL 发起多媒体网络请求）
           - Windows 路径与数学公式格式化
                                     ↓
        阶段 2：Markdown AST 转换 (Remark Plugins)
           - RemarkMath (数学公式解析)
           - RemarkGfm (GFM 表格、删除线)
           - RemarkBreaks (换行处理)
                                     ↓
        阶段 3：HAST HTML 转换与受控净化 (Rehype Plugins)
           - RehypeKatex (公式排版)
           - rehype-raw (将正文 HTML 字符还原为标准 HAST 节点)
           - rehype-sanitize (基于 Custom Schema 严格过滤非法标签与属性)
           - RehypeExternalLinks (外部链接安全跳转 _blank / noopener)
           - rehypeImageCitations (知识库引用增强)
           - rehypeStreamAnimated (流式末尾文本滑动窗口淡入动画)
                                     ↓
        阶段 4：受控 React 组件分发 (components Mapping)
           - video / audio → 原生跨源流式播放器
           - details / summary → 具备暗黑模式与状态控制的折叠容器
           - mark / kbd / progress → Chakra UI 主题化行内样式
           - a / img / code / table → 现有 FastGPT 定制组件
```

---

## 4. 核心安全策略设计（Sanitize Schema）

白名单定义作为全局安全基准，维护在 `packages/global/common/string/markdownSanitize.ts` 中，严防策略分化。

### 4.1 允许标签与属性矩阵

| 类别 | 允许标签 (TagNames) | 允许属性 (Attributes) | 安全约束与默认行为 |
| :--- | :--- | :--- | :--- |
| **多媒体** | `video`, `audio`, `source`, `track` | `src`, `controls`, `poster`, `width`, `height`, `preload`, `loop`, `muted`, `type`, `kind`, `srclang`, `label` | 协议仅限 `http`, `https`；必须经过 `isSafeHref` 校验；禁止自动播放音频扰民 |
| **折叠交互** | `details`, `summary` | `open`, `dataThink` | 样式跟随 Chakra UI 主题；`dataThink` 标识模型思考过程 |
| **排版高亮** | `mark`, `kbd`, `sub`, `sup`, `abbr`, `ruby`, `rt`, `rp`, `font` | `abbr: ['title']`<br>`font: ['color', 'size', 'face']` | `font` 仅限传统排版属性，严禁注入任意内联 `style` |
| **数据指标** | `progress`, `meter`, `figure`, `figcaption` | `progress: ['value', 'max']`<br>`meter: ['value', 'min', 'max', 'low', 'high', 'optimum']` | 数值型属性严格校验，映射至轻量主题化组件 |
| **表格增强** | `caption`, `colgroup`, `col`, `thead`, `tbody`, `tr`, `th`, `td` | `th/td: ['rowspan', 'colspan', 'align']`<br>`col: ['span', 'width']` | 修复复杂业务表格排版丢失 |
| **受限控件** | `button`, `input`, `textarea`, `label` | `button: ['dataVariant', 'dataMessage', 'dataLink']`<br>`input: [['type', 'checkbox', 'radio', 'text'], 'name', 'value', 'checked', 'disabled', 'readOnly']` | **严格封死 `type="file"` 与 `type="password"`**；仅供静态收集/展示，无外部提交权限 |

### 4.2 强安全红线（绝对拦截项）
1. **全局禁止内联 `style` 属性**：不开放通用 `style` 属性，彻底根除基于 CSS 的钓鱼覆盖（如全屏劫持蒙层）与低版本 CSS 表达式利用；
2. **全局禁止任何 `on*` 事件处理函数**：如 `onload`, `onerror`, `onclick`, `onmouseover` 等；
3. **严格协议白名单**：URL 属性（`src`, `href`, `poster`, `dataLink`）仅允许 `http`, `https`, `mailto`, `tel`, `cite`, `quote`；绝对阻断 `javascript:`, `vbscript:`, `data:text/html`, `file:`, `blob:`。

---

## 5. 组件与流式适配改造

### 5.1 媒体组件重构（VideoBlock / AudioBlock）
彻底废除 `fetch` 转 Blob 逻辑，改为原生嵌入与安全审查：

```tsx
// VideoBlock 重构示意
const VideoBlock = ({
  src,
  poster,
  children,
  ...props
}: React.VideoHTMLAttributes<HTMLVideoElement>) => {
  const { width, Ref } = useMarkdownWidth();

  // 若存在直接 src，执行协议与安全校验
  const safeSrc = src && isSafeHref(src) ? src : undefined;
  const safePoster = poster && isSafeHref(poster) ? poster : undefined;

  return (
    <Box w={width} ref={Ref} my={3} borderRadius="md" overflow="hidden" maxW="100%">
      <video
        src={safeSrc}
        poster={safePoster}
        controls
        preload="metadata"
        style={{
          width: '100%',
          maxHeight: '520px',
          display: 'block',
          backgroundColor: '#000'
        }}
        {...props}
      >
        {children}
      </video>
    </Box>
  );
};
```

### 5.2 流式尾部未闭合标签保护（Streaming Guard）
在大模型逐字吐出 HTML 时，未闭合的标签如果提前进入解析器，不仅会导致 DOM 频繁重构，还会让 `<video src="https://example.com/chunk...` 提前触发无效的网络请求。

在 `projects/app/src/components/Markdown/utils.ts` 的 `hideStreamingIncompleteMarkdownTail` 中新增针对 HTML 标签的防抖规则：

```ts
// 匹配尾部正在生长的未闭合 HTML 标签（如 <video src="... 或 <details ）
const streamingIncompleteHtmlTagPattern = /<[a-zA-Z][^>]*$/;

export const hideStreamingIncompleteMarkdownTail = (
  text: string,
  options?: { hideTextFormatting?: boolean }
) => {
  // ...已有规则保持不变...

  // 检查是否以未闭合的 HTML 标签结尾
  const htmlMatch = text.match(streamingIncompleteHtmlTagPattern);
  if (htmlMatch?.index !== undefined && !isInsideOpenCodeFence(text)) {
    return text.slice(0, htmlMatch.index);
  }

  return text;
};
```

### 5.3 打字动画跳过集合扩展
在 `projects/app/src/components/Markdown/rehypeStreamAnimated.ts` 中，扩展忽略标签集合，防止动画运行时向特定容器或空元素内部注入 `<span class="stream-tail">`：

```ts
const STREAM_ANIMATED_SKIP_TAGS = new Set([
  'pre', 'code', 'table', 'svg',
  // 新增：多媒体、图表与交互组件不注入打字动画 span
  'video', 'audio', 'source', 'track',
  'details', 'summary',
  'progress', 'meter',
  'button', 'input', 'textarea', 'select', 'option'
]);
```

---

## 6. 验证逻辑与测试用例设计

针对本次改动，在 `projects/app/test/components/Markdown/` 增加完整的测试套件：

### 6.1 安全攻防测试用例
1. **基础 XSS 拦截验证**：
   - 输入 `<script>alert(1)</script>`，验证渲染结果不包含 `<script>`，内容被剥离或转义；
   - 输入 `<img src=x onerror=alert(1)>`，验证 `onerror` 属性被剔除；
   - 输入 `<video src="javascript:alert(1)"></video>`，验证 `src` 属性被清空。
2. **嵌套与变异 XSS 验证**：
   - 输入 `<details ontoggle=alert(1) open>test</details>`，验证 `ontoggle` 被剔除，`<details>` 正常渲染；
   - 输入 `<a href="vbscript:msgbox(1)">link</a>`，验证链接被剥离为安全文本。
3. **样式污染隔离验证**：
   - 输入 `<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:red;"></div>`，验证全局 `style` 被完全丢弃。

### 6.2 媒体与排版功能验证
1. **多媒体嵌套渲染**：
   - 验证 `<video><source src="test.mp4" type="video/mp4" /></video>` 能够正确生成带 `<source>` 子节点的播放器；
   - 验证跨域视频链接不再产生 fetch CORS 异常，`<video src="...">` 属性正确透传。
2. **富文本排版渲染**：
   - 验证 `<mark>高亮</mark>`、`<kbd>Ctrl+C</kbd>`、`<font color="red">警告</font>` 正常应用样式。
3. **流式打字稳定性验证**：
   - 模拟逐 Token 输入 `<video src="https://test.mp4" controls>`，验证中间状态不抛出语法错误，闭合后平滑展现播放器。

---

## 7. 任务清单 (Todo)

- [x] **依赖配置**
  - [x] 在根目录 `pnpm-workspace.yaml` catalog 及 `projects/app/package.json` 中引入 `rehype-raw` 与 `rehype-sanitize`。
- [x] **安全基准抽取**
  - [x] 在 `projects/app/src/components/Markdown/sanitizeSchema.ts` 定义并导出 `fastgptMarkdownSanitizeSchema`。
- [x] **多媒体组件重构**
  - [x] 重构 `projects/app/src/components/Markdown/codeBlock/Video.tsx`，移除 `fetch-blob`，接入原生受控流式渲染与流式骨架占位。
  - [x] 重构 `projects/app/src/components/Markdown/codeBlock/Audio.tsx`，移除 `fetch-blob`。
- [x] **流水线与组件映射**
  - [x] 在 `projects/app/src/components/Markdown/index.tsx` 的 rehype 管道中集成 `rehype-raw` 和 `rehype-sanitize`。
  - [x] 在 `markdownComponents` 中注册 `video`, `audio`, `details`, `summary`, `mark`, `kbd`, `font`, `progress` 等受控组件。
- [x] **流式保护与动画适配**
  - [x] 在 `projects/app/src/components/Markdown/utils.ts` 中增加未闭合 HTML 标签防抖拦截规则。
  - [x] 在 `projects/app/src/components/Markdown/rehypeStreamAnimated.ts` 中添加媒体与交互标签至 `STREAM_ANIMATED_SKIP_TAGS`。
- [x] **测试与验收**
  - [x] 编写 `projects/app/test/components/Markdown/htmlSanitize.test.ts` 单元测试，覆盖 XSS 攻防与功能渲染。
  - [x] 运行局部单元测试全部通过。

