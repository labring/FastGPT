# 非分享页 CSR 与 i18n 按需加载迁移方案

## 1. 背景

FastGPT 主应用当前使用 Next.js Pages Router。`pages/_app.tsx` 通过
`appWithTranslation(App)` 提供 i18n 上下文，各页面再通过
`getServerSideProps -> serviceSideProps -> serverSideTranslations` 注入页面需要的翻译资源。

现状包括：

- `/chat/share` 需要保留 SSR，用于首屏页面内容、分享应用名称、简介、头像和 Head 信息。
- 其他页面目标是逐步迁移到纯客户端渲染（CSR），不再依赖每次请求执行
  `getServerSideProps`。
- 当前共有 36 个页面声明 `getServerSideProps`。绝大多数只返回
  `serviceSideProps`，但 `/chat`、`/dataset/detail`、`/login/fastlogin`、
  `/config/tool/marketplace` 等页面还返回查询参数或服务端业务数据，不能机械删除。
- 历史上 `serviceSideProps` 还从 `NEXT_DEVICE_SIZE` Cookie 读取 `deviceSize`，仅用于给
  `SystemStoreContextProvider` 的 Chakra `useMediaQuery` 提供 SSR fallback；迁移前置改动已删除该链路，
  `useSystem().isPc` 统一由浏览器媒体查询计算；默认 SSR fallback 为 PC。
- 翻译资源位于 `packages/web/i18n/{language}/{namespace}.json`，共 3 种语言、
  25 个 namespace，原始 JSON 总量约 680 KB；一次性把全部语言和 namespace 注入首屏
  会放大 HTML、JS 和内存开销。

本方案采用“小步试点、验证后扩面”：先建立客户端 i18n 基础能力并只迁移
`/account/apikey`，确认行为和指标达标后，再按风险分批迁移其他页面。

## 2. 目标与非目标

### 2.1 目标

1. `/chat/share` 继续 SSR，行为、SEO Head、分享语言 Cookie 和首屏内容保持不变。
2. 非分享页逐步移除 `getServerSideProps`，最终不再生成页面级服务端 HTML。
3. 客户端只加载当前路由所需的翻译 namespace。
4. 同一浏览器会话内，相同 `language + namespace` 不重复解析和注册。
5. 页面刷新和后续访问尽量命中浏览器 HTTP 缓存，不自行维护翻译正文的
   `localStorage` 缓存。
6. namespace 加载完成前不渲染依赖翻译的页面树，避免短暂展示翻译 key。
7. 首个试点失败时可以只恢复一个页面的 SSR，不影响 `/chat/share` 和其他页面。

### 2.2 非目标

1. 本轮不切换到 Next.js App Router。
2. 本轮不修改翻译 key、翻译内容或 namespace 的业务划分。
3. 本轮不一次性迁移所有页面。
4. 本轮不迁移 `projects/marketplace`；它共享翻译源目录，但保持现有 SSR 读取方式。
5. 本轮不把翻译正文写入 IndexedDB 或 `localStorage`。
6. 本轮不移除 Next.js server runtime；API Routes 和 `/chat/share` 仍依赖服务端。
7. 本轮不迁移 `pro/admin` 页面；客户端 i18n 基础能力放入 `packages/web` 并保持参数化，为 admin
   后续迁移复用。

## 3. 核心决策

### 3.1 i18n 实例全局初始化一次

`appWithTranslation` 仍是应用级 Provider，但必须向它传入稳定配置，使没有
`_nextI18Next` pageProps 的 CSR 页面也可以创建 i18n 实例。

当前只写 `appWithTranslation(App)` 时，实例初始化依赖页面通过
`serverSideTranslations` 返回的 `_nextI18Next`。试点页面删除
`serviceSideProps` 后不能继续依赖该隐式前提。

目标形态：

```ts
export default appWithTranslation(App, clientI18nConfig);
```

`clientI18nConfig` 只能包含浏览器可序列化的公共配置，不能把服务端绝对 `localePath` 或 Node.js 模块
打进客户端。公共语言列表、`defaultLocale`、`defaultNS` 和 fallback 配置应抽成单一来源，
`next-i18next.config.js` 在服务端补充文件系统 `localePath`；测试校验两边核心配置一致。

客户端稳定配置显式使用 `localePath: null`，避免 next-i18next 在浏览器或 `_app` 服务端分支自动创建
错误的文件/HTTP backend。`serverSideTranslations` 不使用这份 override 读取文件，仍通过
`next-i18next.config.js` 的绝对 `localePath` 生成 SSR pageProps；`appWithTranslation` 再把这些 pageProps
中的资源合并进全局实例。

配置需要满足：

- `defaultNS: 'common'`
- `fallbackLng: 'en'`，与当前默认行为一致
- `localePath: null`
- `react.useSuspense: false` 作为未迁移组件的全局默认值；已迁移组件显式开启 Suspense
- `partialBundledLanguages: true`，允许 SSR 注入资源与客户端 backend 增量加载并存
- 通过 `use` 注册浏览器安全的 dynamic-import backend
- 不在公共 bundle 中静态注入全部翻译资源
- 服务端继续使用现有文件系统 `localePath`
- SSR 页仍可以把 `serverSideTranslations` 的资源合并到同一个实例

普通 CSR 页面首次进入时，不能沿用当前 `setUserDefaultLng` 的“发现 `NEXT_LOCALE` Cookie 就直接
返回”逻辑。该短路成立的前提是服务端已经按 Cookie 初始化语言；CSR 页面没有这个前提。门禁需要
显式解析 `Cookie -> localStorage -> navigator.language`，加载目标语言资源并调用
`i18n.changeLanguage` 后才允许渲染页面。

混合迁移期间 `appWithTranslation` 在没有 `_nextI18Next.initialLocale` 时会先使用 Next Router 的默认
locale（当前通常为 `en`）。这是 Provider 的稳定启动值，不是 CSR 页最终语言。client-only boundary
不输出业务页面 HTML，客户端门禁在渲染整个应用壳前完成持久化语言加载和 `changeLanguage`，因此
不能让该默认值提前渲染成页面。稳定 config 的另一个作用是避免 SSR/CSR 路由切换时 Provider 在
“存在/不存在”之间切换并导致整棵应用卸载重建。

### 3.2 资源按 `language + namespace` 动态导入

客户端使用显式 loader map：

```ts
const localeResourceLoaders = {
  'zh-CN': {
    common: () => import('@fastgpt/web/i18n/zh-CN/common.json'),
    account: () => import('@fastgpt/web/i18n/zh-CN/account.json')
  },
  // 其他语言和 namespace 由同一个生成脚本维护
};
```

选择动态 import 而不是运行时读取文件系统，原因如下：

- 浏览器不能访问当前 `localePath` 指向的 monorepo 文件系统目录。
- 每个资源成为构建产物中的独立 hashed chunk，可直接使用 Next 静态资源的长期缓存。
- chunk URL 自动包含 `basePath`，无需额外维护 `/fastai/locales`、`/gchat/locales` 等路径。
- 资源随应用构建版本发布，新版本产生新 hash，不需要手工实现缓存失效协议。
- `projects/marketplace` 可以继续通过原有文件系统 `localePath` SSR，不需要复制或移动翻译源。

不使用任意字符串模板直接 import。loader map 必须由受版本控制的生成脚本产生，确保 bundler
可以静态分析所有资源，也确保新增 namespace 或语言时不会漏项。生成结果需要接受
Prettier 格式化，并由测试检查与 `I18N_NAMESPACES`、支持语言和磁盘文件一致。

生成的 loader map 位于 `packages/web`，通过一个很薄的自定义 i18next backend 接入：

```ts
const dynamicImportBackend = {
  type: 'backend' as const,
  read(language: SupportLanguage, namespace: I18nNsType[number], callback: ReadCallback) {
    loadLocaleResource(language, namespace).then(
      (resource) => callback(null, resource),
      (error) => callback(error, false)
    );
  }
};
```

backend 本身不负责业务路由判断，只把 i18next 发出的 `language + namespace` 请求转给生成的 loader。
资源注册、已加载判断和 backend 状态由 i18next 管理。必须设置
`partialBundledLanguages: true`，否则实例中只要存在 SSR 注入的 `resources`，i18next 就可能把尚未加载的
namespace 误判为 ready。

选择 backend 而不是仅在页面门禁里调用 `addResourceBundle`，是因为后者无法让
`useTranslation(namespace)` 自动触发资源加载；注册 backend 后，组件声明 namespace 就能成为实际
加载入口。该 backend 是 `packages/web` 内的小型适配器，不引入新的 HTTP backend 依赖。翻译 JSON
本身已经由 `packages/web` 管理，因此 loader、backend、缓存和失败状态也由同一个包维护，
`projects/app` 与 `pro/admin` 复用时不会互相依赖项目目录。

页面 ready 条件覆盖“当前语言 + i18next 配置要求的 fallback 语言”。当前默认 fallback 为英文：
英文页面只加载英文资源，中文页面加载对应中文资源和仍缺失的英文 fallback 资源。这样在保持按组件
加载的同时，不会因为中文词条偶尔缺失而丢失现有英文回退行为。

如果验证发现当前构建器无法稳定拆出 JSON chunk，再回退到以下备选方案：构建前复制资源到
`projects/app/public/locales`，并以版本化 URL 通过 HTTP backend 加载。试点期间不同时实现两套
资源加载机制。

### 3.3 组件通过 `useTranslation` 显式声明 namespace

namespace 的正确性来源改为实际使用翻译的组件，而不是中央路由配置。迁移组件时，将无参调用改为
显式声明：

```tsx
const { t } = useTranslation(['apikey'] as const, {
  useSuspense: true
});
```

这样共享组件被其他页面复用、弹窗改为懒加载或组件新增翻译依赖时，依赖仍与组件一起维护，不需要同步
猜测并修改所有上层路由清单。类型参数继续受 `I18nNsType` 约束，写错 namespace 在 TypeScript
阶段失败。

规则：

1. 每个已迁移组件必须声明自己直接调用 `t`、`Trans` 所使用的全部 namespace；不能依赖祖先组件
   “碰巧已经加载”。
2. 页面根组件可以再次声明首屏组件需要的 namespace 合集，作为并行预加载提示，减少多个 Suspense
   重试形成的加载瀑布；子组件声明仍是正确性来源，页面合集漏项不影响后续按需加载。
3. 动态弹窗、抽屉和懒加载组件声明自己的 namespace，资源在组件真正挂载时加载，并在功能入口附近
   放局部 Suspense fallback，避免打开弹窗时整个应用退回全页 loading；首屏必须可立即打开的弹窗可以
   同时加入页面根组件的预加载合集。
4. `common` 由 CSR 初始化门禁先加载，保证 `NextHead`、`Layout` 和尚未迁移的公共组件不会展示 key；
   已迁移组件统一使用 `useClientTranslation(namespace)`，hook 内置 `common` 和 Suspense。仅使用
   `common` 的组件调用 `useClientTranslation()`。
5. 原 `serviceSideProps(context, namespaces)` 数组只能作为迁移扫描起点，必须检查页面实际组件树中的
   `useTranslation`、`Trans` 和带 namespace 前缀的 key。
6. 不允许页面自行 `fetch` 或 `import` 翻译文件，所有声明统一经过 i18next backend。

试点页面根组件的首屏预加载声明为：

```tsx
useClientTranslation('apikey');
```

API key 专属文案统一收敛到 `apikey`，`AccountContainer`、`ApiKeyTable`、`TagMultiSelect` 和
`TagManageModal` 等试点可达组件分别显式声明自己的直接依赖。

CSR 路由集合与翻译依赖解耦，只负责渲染模式：

```ts
const clientOnlyRoutes = new Set(['/account/apikey'] as const);
```

页面只有在组件 namespace 改造和验收完成后才加入该集合，但集合本身不再复制 namespace 数据。

### 3.4 缓存与并发去重

缓存键是 `language + namespace`，不能只按 namespace 缓存。例如 `zh-CN/app` 与 `en/app`
是两份独立资源。

两层缓存职责：

| 层级 | 机制 | 作用域 | 失效方式 |
| --- | --- | --- | --- |
| 运行时资源缓存 | i18next resource store | 当前标签页会话 | 页面刷新或应用卸载 |
| 静态资源缓存 | hashed JS/JSON chunk + HTTP cache | 浏览器跨刷新复用 | 新构建产生新 hash |

底层 `loadLocaleResource` 在模块级维护进行中请求：

```ts
const pendingLoads = new Map<string, Promise<void>>();
```

加载过程为：

1. `useTranslation` 把组件声明的 namespace 交给 i18next backend connector。
2. backend connector 对当前语言和 fallback 语言生成 `language + namespace` 任务，并跳过 resource store
   中已有的资源。
3. `pendingLoads` 已存在相同 key 时复用同一个 dynamic import Promise。
4. 否则执行生成的 loader，并把 JSON 返回给 backend connector 注册。
5. Promise 完成后从 `pendingLoads` 删除；成功资源由 i18next store 缓存，失败项允许重试。

同一 i18n 实例内，backend connector 本身也会合并相同资源的并发请求；`pendingLoads` 再保护底层
dynamic import，防止初始化、重试或实例切换边界重复执行。加载失败写入按
`language + namespace` 记录的 failure registry，并触发 `failedLoading`。顶层
`ClientI18nBoundary` 必须读取该状态并展示可重试错误页，不能仅依赖 react-i18next 的 Suspense Promise：
该 Promise 在 backend 回调结束时会 resolve，即使底层加载失败，单独使用它可能继续渲染翻译 key。
重试入口直接重新执行 `loadLocaleResource`，成功后调用 `addResourceBundle` 并清理失败记录；不能依赖
失败后的 `loadNamespaces` 自动重试，因为当前 i18next backend connector 会把最终失败状态记为 `-1`。

不额外把翻译正文存入 `localStorage`，原因是：

- 静态资源缓存已经能覆盖刷新后的重复下载。
- `localStorage` 需要自行处理版本、原子写入、容量、解析异常和多标签同步。
- 同一资源会同时占用 HTTP cache、`localStorage` 和 i18next 内存，收益不足以抵消复杂度。

`localStorage`/Cookie 仅继续存语言偏好，不存翻译正文。

已迁移组件使用 `useClientTranslation('业务 namespace')`。该共享 hook 内部组合
`['common', namespace]` 并启用 Suspense，调用方不重复声明 `common`，同时保留带 namespace 前缀的
翻译 key 类型检查。

### 3.5 页面渲染门禁

`ClientI18nGate` 下沉到 `packages/web`，只负责通用的客户端语言初始化：

```tsx
<ClientI18nGate
  defaultLanguage="en"
  storageKey={LANG_KEY}
  fallback={<PageLoading />}
>
  <ClientI18nBoundary>{children}</ClientI18nBoundary>
</ClientI18nGate>
```

共享组件不能读取 Next Router、`clientOnlyRoutes`、`FASTGPT_SHARE_LOCALE` 或 app/admin 的业务 store。
它只通过 props 接收默认语言、语言偏好 key、loading/error UI，并使用当前
`I18nextProvider` 中的实例。`common` 是内置的基础 namespace，不作为数组 prop 传入，避免调用方
重复声明以及不稳定数组引用导致初始化 effect 重复执行。app 默认语言传 `en`，admin 后续接入时传其配置的 `zh-CN`；两者都可以
复用 `NEXT_LOCALE`，但 admin 现存且未接入 i18next 的 `NEXT_LOCALE_LANG` 需要在 admin 迁移时单独
决定兼容或删除，不能固化进共享 Gate。

客户端路由进入后按以下顺序执行：

```mermaid
flowchart TD
  A["解析 router.pathname"] --> B["确定普通页面或 share"]
  B -->|"/chat/share"| C["使用 SSR 注入资源并直接渲染"]
  B -->|"CSR 页面"| D["解析 Cookie、本地偏好和浏览器语言"]
  D --> E["加载目标语言 common 并切换语言"]
  E --> F["挂载 Suspense 内的应用树"]
  F --> G["useTranslation 声明组件 namespace"]
  G --> H["backend 加载缺失资源"]
  H --> I["资源就绪后渲染组件"]
  H -->|"失败"| J["展示错误态并允许重试"]
```

初始化门禁先加载当前语言和 fallback 所需的 `common`，再挂载整个普通页面树，包括 `_app` 中的
`NextHead`、`Layout` 和页面组件，保证未改造的应用壳不会先显示 `common:*` key。应用树外层再放统一
Suspense fallback；组件通过显式 `useTranslation` 按需加载业务 namespace。页面首次资源加载使用顶层
fallback，交互后挂载的弹窗、抽屉等异步区域优先使用局部 Suspense boundary。

加载状态使用稳定的全页 loading，不渲染尚未取得翻译的组件。路由切换时：

- 如果下一页所需资源全部已经存在，不显示额外 loading。
- 只有新挂载组件声明了缺失 namespace 时才进入 Suspense fallback。
- 已离开页面的请求可以正常写入 resource store，但不能改变当前页面错误状态；失败记录必须绑定
  `language + namespace`，而不是用单个全局 ready 布尔值。
- 加载失败不能标记为成功；提供重试入口并记录 `language`、`namespace`、`pathname`。

### 3.6 语言切换

普通页面语言切换流程调整为：

1. 读取 i18next 已登记的 namespace；它们来自已执行过的显式 `useTranslation` 声明。
2. 预加载目标语言对应的已知 namespace 和 fallback 资源。
3. 全部成功后执行 `i18n.changeLanguage(targetLanguage)`；也可以直接使用
   `changeLanguage` 的 backend 加载阶段，但必须接管错误结果。
4. 持久化 `NEXT_LOCALE`。
5. 不再因为补资源而强制整页 reload。

i18next 的 namespace 集合会包含当前会话访问过的组件，因此切换语言可能顺带加载少量“已访问但当前
未挂载”的 namespace；它仍不会加载从未使用的全部 25 个 namespace，并换取语言切换时页面不会因
子组件逐个发现资源而出现混合语言。若试点指标表明该增量明显，再增加活动 namespace 引用计数，
不在首版维护第二份路由清单。

如果加载失败，保留原语言，不写入新的语言偏好，避免页面进入“语言已切换但资源不完整”的状态。

首次初始化也遵循相同顺序：即使已经存在 `NEXT_LOCALE` Cookie，也必须为 CSR 页面显式加载该语言
并执行 `changeLanguage`。只有没有 Cookie 时才使用旧版 `localStorage` 偏好或浏览器语言，并在加载
成功后写回标准化后的 `NEXT_LOCALE`。

`/chat/share` 本阶段保持现有 `FASTGPT_SHARE_LOCALE`、SSR 资源注入与 reload 行为，不与普通页面的
试点同时修改。

### 3.7 CSR 边界

删除 `getServerSideProps` 只会使 Pages Router 页面变成自动静态优化，并不等于禁用页面 HTML
预渲染。为了验证“除分享页外只在客户端渲染”，应用入口需要设置明确的 client-only boundary：

- `/chat/share` 走原有同步 SSR 渲染路径。
- 已迁移页面走 `{ ssr: false }` 的客户端应用壳。
- 未迁移页面在过渡期继续走现有 SSR 路径。

因此过渡期不能用简单的“pathname 不是 `/chat/share` 就 CSR”开关，否则会一次性改变所有页面。
已迁移路由由独立的 `clientOnlyRoutes` 判定：

```ts
const isClientOnlyRoute = (pathname: string) => clientOnlyRoutes.has(pathname);
```

`_app` 的目标结构如下，现有 `App` 内容抽成 `AppShell`：

```tsx
const ClientOnlyAppShell = dynamic(() => import('@/web/context/ClientOnlyAppShell'), {
  ssr: false
});

function AppRouter(props: AppPropsWithLayout) {
  if (isClientOnlyRoute(props.router.pathname)) {
    return <ClientOnlyAppShell {...props} />;
  }

  return <AppShell {...props} />;
}

export default appWithTranslation(AppRouter, clientI18nConfig);
```

`ClientOnlyAppShell` 本身不调用依赖翻译或浏览器业务状态的初始化 hook，只负责组合
`@fastgpt/web` 的 `ClientI18nGate`；基础语言和 `common` ready 后，再在
`ClientI18nBoundary + Suspense` 内挂载
`AppShell`。因此试点路由在服务端最多输出 Next 的静态应用骨架和
dynamic loading 占位，不输出页面业务 HTML，也不会提前运行 `useInitApp`、Layout 或页面 effect。
未迁移页面和 `/chat/share` 仍直接渲染同一个 `AppShell`，避免维护两份应用布局。

当全部非分享页面迁移完成后，再切换为“除 `/chat/share` 外默认 client-only”，并删除过渡兼容分支。

### 3.8 `deviceSize` 处理

在 i18n 试点前先删除 `deviceSize` 整条链路：

1. `serviceSideProps` 不再读取或返回 `NEXT_DEVICE_SIZE`。
2. app/admin 的 `_app` 不再向 `SystemStoreContextProvider` 传 `pageProps.deviceSize`。
3. `SystemStoreContextProvider` 不再写设备 Cookie/localStorage，只保留
   `useMediaQuery('(min-width: 900px)')`，初始 fallback 使用 PC。
4. client-only 页面通过 `waitForReady` 等待浏览器首次媒体查询结果，在结果确认前只显示全屏 loading，
   不挂载依赖 `isPc` 的页面树。

仍保留 SSR 的 `/chat/share`、admin 和 marketplace 会使用 PC fallback 生成服务端 HTML，客户端 effect
后切换到真实宽度；这不会造成 hydration mismatch，但移动端可能出现一次布局调整。普通页面进入
client-only boundary 后会等待真实宽度确认，不会把这次调整暴露给用户。设备类型不写入 localStorage：
缓存值可能来自旧窗口或旧设备，只能作为提示，不能作为当前布局依据。该取舍消除了有状态设备 Cookie、
过期尺寸和 i18n helper 混入设备职责的问题。

## 4. 试点页面

### 4.1 选择 `/account/apikey`

选择原因：

- 当前 `getServerSideProps` 只调用 `serviceSideProps`，没有服务端业务查询或权限决策。
- 页面已有客户端 API 请求加载 API key 数据，不需要新增数据接口。
- 页面经过登录态 `Auth`、桌面/移动布局、账户侧栏和多个弹窗，能够真实验证应用壳加载。
- 页面直接使用 `common`、`account`、`apikey`，足以验证多个 namespace
  的加载和缓存。
- 回滚只需恢复该页面 `getServerSideProps`，影响范围小。

### 4.2 试点改动范围

1. 建立客户端 i18n 配置与动态资源 loader。
2. 建立生成并校验 locale loader map 的脚本。
3. 接入 dynamic-import backend，并把试点组件改为显式 `useTranslation(namespace)`。
4. 在 `_app` 增加 i18n ready 门禁和仅针对试点路由的 client-only boundary。
5. 从 `/account/apikey` 删除 `serviceSideProps` import 和 `getServerSideProps`。
6. 保持 `/chat/share` 代码和 SSR 输出不变。
7. 增加 loader、缓存、路由门禁和语言切换测试。

### 4.3 预计代码落点

实际文件名可以在编码时按现有目录语义微调，但职责边界保持如下：

| 位置 | 职责 |
| --- | --- |
| `packages/web/i18n/clientConfig.ts` | 创建可由 app/admin 覆盖 `defaultLocale` 的稳定客户端公共配置 |
| `packages/web/i18n/resourceLoaders.generated.ts` | 由脚本生成的 `language + namespace -> dynamic import` 映射 |
| `packages/web/i18n/dynamicImportBackend.ts` | 把 i18next backend `read` 接到生成的 loader map |
| `packages/web/i18n/loadLocaleResource.ts` | dynamic import、pending Promise 去重、失败记录与重试 |
| `packages/web/i18n/ClientI18nGate.tsx` | 参数化解析语言，加载初始 namespace 并完成首次语言切换 |
| `packages/web/i18n/ClientI18nBoundary.tsx` | 提供 Suspense、可注入 loading/error UI 和重试能力 |
| `projects/app/src/web/common/i18n/clientOnlyRoutes.ts` | 只维护已迁移 CSR 路由集合，不记录 namespace |
| `projects/app/src/web/context/AppShell.tsx` | 从 `_app` 抽出的现有应用布局与初始化逻辑，SSR/CSR 共用 |
| `projects/app/src/web/context/ClientOnlyAppShell.tsx` | 无 SSR 动态入口，给共享 Gate 注入 app 参数后挂载 `AppShell` |
| `packages/web/scripts/generate-i18n-resource-loaders.ts` | 扫描共享包支持语言和 namespace，生成 loader map |
| `projects/app/src/pages/_app.tsx` | Provider 配置、SSR/CSR 分流及整个应用壳的翻译门禁 |
| `packages/web/hooks/useI18n.ts` | 组合已登记 namespace 的预加载、语言切换、持久化及 SSR/share 兼容路径 |
| `projects/app/src/pages/account/apikey.tsx` | 删除试点页 `getServerSideProps` |
| `projects/app/test/web/common/i18n/*.test.ts` | backend、loader 缓存、组件声明、失败重试及语言切换测试 |

生成脚本需要接入 app/admin 的开发和构建前置步骤，且 CI 中增加“生成结果没有 diff”的检查，避免开发者
新增 namespace 后只在本地生成但未提交。`resourceLoaders.generated.ts` 只承载机械映射，不写业务逻辑。

共享 i18n 模块不得使用 `@/` 别名或读取 app/admin 路由。各项目负责用自己的 `_app`、动态
client-only boundary 和默认语言配置组合共享能力。admin 本轮不跟随试点迁移，只要求共享 API 的设计
能支持其后续接入，并通过一个最小 Gate 单元测试覆盖 `defaultLanguage="zh-CN"` 的参数化行为。

### 4.4 试点验收条件

功能验收：

- 直接访问 `/account/apikey` 能正常完成登录态校验和页面展示。
- 页面加载过程中不出现 `common:*`、`account:*` 或 `apikey:*` 原始 key。
- API key 列表、创建、编辑、删除、标签管理、复制、排序和搜索可正常使用。
- 桌面与移动布局正确，首次访问不发生明显布局跳变。
- 从其他页面进入 `/account/apikey` 和从试点页返回其他页面均正常。
- 中文、繁体中文、英文切换正确；切换失败时保留原语言。
- `/chat/share` 的 SSR HTML、Head 和独立语言偏好无回归。
- 非根路径部署至少验证 `NEXT_PUBLIC_BASE_URL=/fastai`。

渲染验收：

- 请求 `/account/apikey` 返回的服务端 HTML 中不包含 API key 页面业务文案或表格结构。
- 请求 `/chat/share?shareId=...` 返回的服务端 HTML 仍包含分享页对应 Head 信息。
- `/account/apikey` 不再出现在 `getServerSideProps` 页面清单中。

缓存验收：

- 冷启动只加载试点所需 namespace，不加载 `dataset`、`chat`、`skill` 等无关资源。
- 同一语言下离开再进入 `/account/apikey`，相同 namespace 不产生新的资源请求或动态 import 执行。
- 同一 namespace 被多个组件同时需要时，只发起一次底层加载。
- 切换到新语言时只加载目标语言及其 fallback 中仍缺失的 namespace。
- 刷新后静态翻译 chunk 命中 HTTP cache；发布新构建后使用新的 hashed URL。

质量门槛：

- 试点页没有新增 hydration、missingKey、failedLoading 或未处理 Promise 错误。
- i18n 门禁不会让 API、WebSocket、轮询或业务 effect 在翻译就绪前重复启动。
- TypeScript、lint、相关单元测试和应用构建通过。

### 4.5 观察期

试点上线后至少观察一个完整发布周期，且覆盖三种语言、桌面/移动端和至少一个非根路径部署。
关注：

- 前端错误日志中的翻译加载失败、动态 chunk 404 和 ChunkLoadError。
- `/account/apikey` 首次可交互时间与现有 SSR 基线的差异。
- namespace 请求数量、传输体积和缓存命中情况。
- 语言切换失败率。
- `/chat/share` SSR 请求和页面行为是否保持原有水平。

只有在上述验收全部通过且观察期没有阻断问题后，才开始第二批迁移。

## 5. 分批迁移计划

### 第一阶段：基础能力与单页试点

只迁移 `/account/apikey`，不顺手迁移同目录页面。目标是验证架构假设、构建产物、缓存和回滚链路。

### 第二阶段：纯 i18n 页面

优先迁移 `getServerSideProps` 只调用 `serviceSideProps` 的页面，按业务域小批提交：

1. 账户页面：`/account/bill`、`/account/inform`、`/account/promotion`、
   `/account/setting`、`/account/customDomain`、`/account/thirdParty`。
2. 账户复杂页面：`/account/info`、`/account/team`、`/account/model`、`/account/usage`。
3. Dashboard 列表页：`/dashboard/agent`、`/dashboard/tool`、
   `/dashboard/templateMarket`、`/dashboard/systemTool`、`/dashboard/mcpServer`、
   `/dashboard/evaluation`、`/dashboard/evaluation/create`、`/dashboard/create`、
   `/dashboard/skill`。
4. 数据集、应用和其他页面：`/dataset/list`、`/config/tool`、`/app/detail`、
   `/skill/detail`、`/price`、`/login`、`/login/provider`。

每批都需要：把可达组件改为显式 `useTranslation(namespace)`、删除对应 `getServerSideProps`、验证
冷/热缓存和语言切换，不能只依赖原 `serviceSideProps` 数组。

### 第三阶段：带服务端 props 的页面

单独设计和迁移以下页面：

- `/dataset/detail`：把 `datasetId`、`currentTab` 改为从 `router.query` 读取并处理
  `router.isReady`。
- `/login/fastlogin`：把 `code`、`token`、`callbackUrl`、`lastTmbId` 改为客户端 query，确保
  鉴权 effect 只执行一次且不会在 query 未就绪时误请求。
- `/config/tool/marketplace`：把 `MARKETPLACE_URL` 改为安全的客户端配置来源，禁止暴露其他服务端配置。
- `/chat`：把 query、Cookie 判断和 MongoDB `MongoOutLink` 查询迁移为有鉴权边界的客户端 API；这是
  高风险项，必须单独设计。

### 第四阶段：特殊页面与收尾

- 审查 `_error`、404、根路由和 API 文档页。API 文档页当前用空 `getServerSideProps` 禁止静态生成，
  移除前必须确认 Scalar 组件在 client-only boundary 下正常。
- 将所有已迁移非分享页切换为默认 client-only，仅 `/chat/share` 保留 SSR。
- 删除过渡期 `clientOnlyRoutes` 白名单，改为除 `/chat/share` 外默认 CSR。
- 收缩 `serviceSideProps` 的职责和引用范围。
- 再次扫描所有 `getServerSideProps`，确认除明确豁免页面外没有残留。

## 6. 测试方案

### 6.1 单元测试

1. locale loader map 覆盖所有支持语言和 `I18N_NAMESPACES`。
2. 所有 loader 能返回合法 JSON 对象。
3. backend 对 `useTranslation` 声明的新 namespace 发起加载，已有 resource bundle 不重复加载。
4. 并发请求相同资源复用同一个 Promise，只执行一次 loader。
5. 不同语言的同名 namespace 分别加载。
6. namespace 加载失败时进入可定位、可重试的错误态，不渲染原始 key。
7. 试点组件的 namespace 参数均受类型约束，页面根预加载合集覆盖首屏直接依赖。
8. 语言切换在资源成功后才更新语言和存储；失败时不改变当前语言。

### 6.2 页面测试

1. 模拟首次访问 `/account/apikey`，断言 loading 后再出现已翻译内容。
2. 模拟客户端路由重复进入，断言不重复加载。
3. 模拟加载失败和重试。
4. 模拟在加载过程中切换路由或语言，断言旧页面失败状态不会污染新页面。
5. 断言 `/chat/share` 不经过 CSR i18n 门禁，仍使用 SSR 注入资源。
6. 从中文 SSR 页面导航到试点 CSR 页面，断言门禁完成后保持中文且不闪现英文内容。
7. 从试点 CSR 页面返回 SSR 页面，断言不发生应用状态整体重建。

### 6.3 构建与手工验证

局部开发阶段运行试点相关测试、typecheck 和 lint。试点完成后运行应用 production build，检查：

- locale JSON 被拆为可缓存的独立 chunk。
- root 与 basePath 部署都能加载 chunk。
- 服务端 HTML 符合 CSR/SSR 边界。
- 浏览器 Network 面板中的冷启动、重复导航、语言切换和刷新缓存行为符合验收条件。

全量测试只在本轮实现完成后运行一次。

## 7. 回滚方案

试点回滚按以下顺序：

1. 恢复 `/account/apikey` 的 `serviceSideProps` 与 `getServerSideProps`。
2. 从 `clientOnlyRoutes` 移除 `/account/apikey`，使其不再进入 client-only 分支。
3. 保留未被试点使用的客户端 i18n 基础代码时，必须确认它不改变现有 SSR 页行为；否则整体回滚基础代码。
4. `/chat/share` 始终不参与试点回滚，因为试点不修改其 SSR 方案。

禁止在出现翻译加载问题时静默回退为展示 key；应明确回滚该页面或修复 loader。

## 8. 风险与防护

| 风险 | 防护 |
| --- | --- |
| 删除 `serviceSideProps` 后 Provider 不创建 | 给 `appWithTranslation` 传入稳定客户端配置并测试无 `_nextI18Next` 页面 |
| 有语言 Cookie 时仍停留在默认语言 | CSR 门禁不复用 SSR 的 Cookie 短路，始终显式加载并切换目标语言 |
| SSR/CSR 路由切换时短暂使用 Router 默认语言 | client-only 应用壳在门禁 ready 前不渲染，随后显式切换持久化语言 |
| 组件漏声明 namespace | 类型约束、静态扫描、missingKey/failedLoading 监控和完整页面操作验收 |
| 同时请求导致重复加载 | `pendingLoads` 按 `language + namespace` 复用 Promise，并补并发测试 |
| 语言切换时出现混合语言 | 先加载目标语言全部资源，成功后再 changeLanguage |
| 动态 import 被打入公共首包 | production build 检查 chunks 和首屏资源清单 |
| basePath 下资源 404 | 使用 Next 管理的 hashed chunk，并验证 `/fastai` 部署 |
| 路由快速切换污染错误态 | failure registry 按 `language + namespace` 记录，页面只消费当前挂载依赖 |
| 试点页面仍被静态预渲染 | 使用显式 client-only boundary，并检查返回 HTML |
| SSR 分享页回归 | `/chat/share` 独立路径和回归测试，保持 serverSideTranslations 注入 |
| 翻译发布后旧缓存不失效 | 使用内容 hash 的构建产物 URL，不使用固定 URL + immutable |

## 9. TODO

### 方案确认

- [x] 盘点当前 SSR、i18n、deviceSize 和语言偏好实现
- [x] 删除 `deviceSize` pageProps、`NEXT_DEVICE_SIZE` Cookie 和 Provider SSR fallback 链路
- [x] 选择 `/account/apikey` 作为首个试点页面
- [x] 明确按 `language + namespace` 加载与缓存模型
- [x] 明确 `/chat/share` 保持 SSR
- [x] 评审并确认本方案后开始编码

### 第一阶段：基础能力

- [x] 实现客户端 i18n 稳定配置，使无 `_nextI18Next` pageProps 的页面也有 Provider
- [x] 实现 locale loader map（试点 namespace）和动态 import backend
- [x] 实现动态 import、并发去重、资源注册和重试底层能力
- [x] 在 `packages/web` 实现参数化 `ClientI18nGate`，不依赖 app/admin 路由和业务状态
- [x] 实现类型安全的 `clientOnlyRoutes`，只承担试点 CSR 分流
- [x] 实现 `common` 初始化门禁及应用树 Suspense
- [x] 实现迁移路由限定的 client-only boundary
- [x] 调整试点页面初始化为“先加载、再切换、再持久化”
- [ ] 为上述能力补充自动化单元测试

### 第一阶段：`/account/apikey` 试点

- [x] 将试点可达组件改为显式 `useTranslation(namespace, { useSuspense: true })`
- [x] API key 组件声明 `common`、`apikey`，账户容器声明 `common`、`account`
- [x] 删除试点页面的 `serviceSideProps` 和 `getServerSideProps`
- [ ] 验证试点页直接访问、客户端导航、桌面端和移动端
- [ ] 验证 API key 完整操作路径与登录态跳转
- [ ] 验证三种语言及切换失败行为
- [ ] 验证冷启动、重复进入、切换语言、刷新后的缓存行为

### 第二阶段：`/account/inform`

- [x] 页面与通知详情弹窗显式声明 `common`、`account_inform`
- [x] 删除页面的 `serviceSideProps` 和 `getServerSideProps`
- [x] 将 `/account/inform` 加入 client-only 路由集合
- [ ] 验证通知列表、详情弹窗、已读状态和分页

### 第三阶段：账户设置与第三方账号

- [x] `/account/setting` 显式声明 `common`、`account_setting`
- [x] `/account/thirdParty` 及其弹窗显式声明 `common`、`account_thirdParty`
- [x] 删除两个页面的 `serviceSideProps` 和 `getServerSideProps`
- [x] 将两个页面加入 client-only 路由集合
- [ ] 验证语言切换、时区保存和第三方账号配置弹窗

### 第四阶段：自定义域名

- [x] 页面与域名弹窗显式声明 `common`、`account_custom_domain`
- [x] 删除页面的 `serviceSideProps` 和 `getServerSideProps`
- [x] 将创建域名弹窗明确设置为 `ssr: false`
- [x] 将 `/account/customDomain` 加入 client-only 路由集合
- [ ] 验证域名列表、创建/编辑、删除和 DNS 检查

### 第五阶段：使用记录

- [x] 页面、列表、详情与图表显式声明 `common`、`account_usage`
- [x] 删除页面的 `serviceSideProps` 和 `getServerSideProps`
- [x] 将 `/account/usage` 加入 client-only 路由集合
- [x] 充值弹窗仅在打开时延迟加载 `user` namespace，并使用局部 Suspense
- [x] 补齐繁体 `account_usage` 缺失的翻译 key
- [ ] 验证列表筛选、导出、详情、Dashboard 与充值弹窗

- [x] 验证试点页服务端 HTML 不含业务页面内容
- [x] 验证 `/chat/share` SSR、Head 与语言隔离无回归
- [ ] 验证 root 和 `/fastai` basePath 构建与运行
- [ ] 运行局部测试、typecheck、lint、production build，最后运行全量测试

### 观察与扩面

- [ ] 记录试点发布前后的首屏、错误率、资源体积与缓存命中基线
- [ ] 完成至少一个发布周期观察
- [ ] 根据观察结果确认继续、调整或回滚
- [ ] 按第二阶段列表逐批迁移纯 i18n 页面
- [ ] 为第三阶段带服务端 props 页面分别补充设计
- [ ] 完成特殊页面审查和默认 CSR 收尾
- [ ] 最终扫描并确认仅 `/chat/share` 保留业务页面 SSR；任何新增豁免必须单独评审

## 10. 参考资料

- [next-i18next v15.4.2：增量采用与稳定初始配置](https://github.com/i18next/next-i18next/blob/v15.4.2/README.md#usage-with-fallback-ssg-pages)
- [i18next：新增或按需加载翻译](https://www.i18next.com/how-to/add-or-load-translations)
- [i18next：Namespaces](https://www.i18next.com/principles/namespaces)
- [i18next API：`hasResourceBundle` 与资源加载](https://www.i18next.com/overview/api)
