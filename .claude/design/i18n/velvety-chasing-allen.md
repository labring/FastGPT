# 页面 i18n 命名空间完整性检查脚本

## Context

FastGPT 使用 `next-i18next` SSR 模式，每个页面需要在 `getServerSideProps` 中通过 `serviceSideProps(content, ['ns1', 'ns2'])` 声明要加载的命名空间。若某个子组件使用了未在页面声明的命名空间，该词条在运行时会渲染为 key 字符串（如 `account_apikey:key_tips`）。

目标：实现一个静态分析脚本，递归扫描页面组件树（含动态 import），找出使用了但未在 `getServerSideProps` 中声明的命名空间。

---

## 新增文件

**`scripts/i18n/check-page-ns.js`**

---

## 路由过滤规则（全量扫描时内置）

| 条件 | 说明 |
|------|------|
| 排除 `api/` 子目录 | API 路由无需声明 i18n |
| 排除 `_` 开头的文件 | `_app.tsx`、`_document.tsx` 等 Next.js 保留文件 |
| 只扫描含 `serviceSideProps` 的文件 | 无该函数说明不需要 SSR 注入命名空间 |

---

## 路径别名解析规则

| 别名 | 实际路径 |
|------|---------|
| `@/xxx` | `projects/app/src/xxx` |
| `@fastgpt/web/xxx` | `packages/web/xxx` |
| `@fastgpt/global/xxx` | `packages/global/xxx` |
| `@fastgpt/service/xxx` | `packages/service/xxx` |
| `./xxx` / `../xxx` | 相对于当前文件目录解析 |
| 其他（npm 包） | 跳过，不扫描 |

文件扩展名猜测顺序：`.tsx` → `.ts` → `.jsx` → `.js` → `index.tsx` → `index.ts`

---

## 核心提取规则（正则）

### 1. 提取页面声明的命名空间

```js
// serviceSideProps(content, ['ns1', 'ns2'])
/serviceSideProps\s*\([^,)]+,\s*\[([\s\S]*?)\]/
```

`common` 始终为隐式包含，无需声明。

### 2. 提取文件中使用的命名空间

```js
// t('namespace:key')
/\bt\s*\(\s*['"`]([\w-]+):/g

// useTranslation('namespace')
/useTranslation\s*\(\s*['"`]([\w-]+)['"`]\s*\)/g

// useTranslation(['ns1', 'ns2'])
/useTranslation\s*\(\s*\[([\s\S]*?)\]\s*\)/g
```

### 3. 提取静态 import

```js
/^import\s+(?:type\s+)?(?:[\w\s{},*]+)\s+from\s+['"`]([^'"`\n]+)['"`]/gm
```

### 4. 提取动态 import（next/dynamic）

```js
// dynamic(() => import('path'))
/dynamic\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g

// dynamic(() => import('path').then(m => m.X))
/dynamic\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.then/g
```

---

## 脚本结构

```
scripts/i18n/check-page-ns.js
├── resolveFilePath(importPath, from)       // 别名解析 + 扩展名猜测
├── extractImports(filePath)                // 提取静态 + 动态 import（带缓存）
├── extractOwnNamespaces(filePath)          // 提取单文件自身使用的命名空间（带缓存）
├── extractDeclaredNamespaces(content)      // 提取页面 SSR 声明的命名空间
├── scanComponentTree(filePath, visited)    // 递归扫描，返回整棵树的命名空间
├── checkPage(pagePath)                     // 单页面检查，返回结构化结果
├── collectPages(dir, excludePatterns)      // 收集所有待检查页面文件
├── printSingleResult(pagePath, result)     // 单页面输出
├── printBatchResults(results)              // 全量扫描汇总输出
├── parseArgs(argv)                         // 命令行参数解析
└── main()                                  // 入口
```

**性能优化**：文件内容、import 列表、命名空间均有缓存（`Map`），全量模式下共享文件（如 `AccountContainer`）只解析一次。

**递归保护**：维护 `visited Set<string>`，最大深度 15 层。

---

## 命令行接口

```bash
# 全量扫描（默认，扫描 projects/app/src/pages 下所有有效页面）
node scripts/i18n/check-page-ns.js

# 排除符合正则的页面（路径相对于 pages 目录）
node scripts/i18n/check-page-ns.js --exclude "login|price"

# 多个排除规则
node scripts/i18n/check-page-ns.js --exclude "account" --exclude "login"

# 仅检查单个页面
node scripts/i18n/check-page-ns.js projects/app/src/pages/account/apikey.tsx
```

---

## 输出格式

**全量扫描概览：**
```
🔍 全量扫描 projects/app/src/pages
  排除规则: /account/, /login/
   共 21 个页面

────────────────────────────────────────────────────────────
✅  index.tsx
❌  dashboard/create/index.tsx  (缺少 1 个: account_info)
❌  dashboard/tool/index.tsx  (缺少 4 个: file, account_info, skill, workflow)
...
────────────────────────────────────────────────────────────

详情：

  [dashboard/tool/index.tsx]
    已声明: common, app, user, account
    ❌ file  (使用于: projects/app/src/web/common/file/hooks/useSelectFile.tsx)
    💡 建议: ['app', 'user', 'account', 'file', 'account_info', 'skill', 'workflow']

❌ 扫描完成：共 21 个页面，1 个通过，20 个有问题
```

**退出码**：有缺失命名空间时 `exit(1)`，便于集成到 CI。

---

## 已知局限

静态分析无法感知运行时的条件渲染，因此可能出现轻微误报（某个组件在当前页面路由下不会被实际渲染，但被静态 import 引用）。属于可接受的保守检测策略。
