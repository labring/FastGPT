# share 页面微信内置浏览器兼容问题分析

## 背景

share 页面在微信内打开时报错：

```text
Uncaught SyntaxError: Unexpected token '{'
```

报错位置来自生产 JS chunk，属于浏览器解析阶段错误。页面业务代码尚未执行，因此优先判断为构建产物包含当前微信 WebView 内核不支持的 JavaScript 语法。

## 排查结论

当前项目使用 Next.js 16.2.4。未显式配置 Browserslist 时，Next.js 默认面向现代浏览器构建，默认基线为：

```json
["chrome 111", "edge 111", "firefox 111", "safari 16.4"]
```

本地生产构建后，`/chat/share` 首屏 chunk 中发现如下代码：

```js
class Y{static{this.events=(0,f.default)()}}
```

`static { ... }` 是 class static block 语法。较旧的微信 Android XWeb / X5 内核或 iOS WKWebView 解析到 `static{` 中的 `{` 时，会直接抛出 `Unexpected token '{'`。这与截图中的错误形态一致。

因此，本问题不是 share 页面接口、鉴权或渲染逻辑异常，而是生产构建目标过新，导致 Next.js runtime chunk 保留了老微信内核无法解析的新语法。

## 修复方案

在 `projects/app/package.json` 中为主应用声明更保守的 Browserslist：

```json
"browserslist": [
  "Chrome >= 80",
  "Edge >= 80",
  "Firefox >= 74",
  "Safari >= 13",
  "ios_saf >= 13"
]
```

该配置会让 Next/Turbopack 按更低的浏览器基线降级客户端产物，重点覆盖微信 WebView 中常见的 Chromium 80+ 和 iOS 13+ WKWebView。

## 验证结果

1. 未配置 Browserslist 时，`/chat/share` 产物存在 `class Y{static{...}}`。
2. 添加 Browserslist 后重新执行：

```bash
pnpm --filter @fastgpt/app build
```

构建成功。

3. 重新扫描 `/chat/share` 首屏 JS chunk，未再发现 `static { ... }` / `static{...}` class static block。
4. 扫描 `/chat/share` 首屏与动态 chunk，以及整个 app 客户端 chunk，未发现真实的 `class static block`、私有字段、可选链、空值合并、逻辑赋值、数字分隔符或高版本正则语法节点。

## 风险与边界

1. 该修复会影响整个 `@fastgpt/app` 客户端构建目标，不只影响 `/chat/share`，产物体积可能轻微增加。
2. 如果用户微信内核低于 Chrome 80 或 iOS 13，仍可能遇到其他语言特性或 Web API 兼容问题，需要进一步降低 Browserslist 或按需添加 polyfill。
3. Next.js 文档说明 polyfill 只覆盖部分常用 Web API；若依赖使用了目标浏览器缺失的运行时 API，仍需在 `_app.tsx` 或具体入口单独引入 polyfill。

## TODO

- [x] 定位 `/chat/share` 对应生产 chunk。
- [x] 确认报错与 class static block 语法相关。
- [x] 添加主应用 Browserslist 配置。
- [x] 重新构建并确认 `static { ... }` 已被降级。
- [x] 扫描 share 与全量客户端 chunk 的高版本 JS 语法节点。
- [ ] 使用真实微信内置浏览器回归 share 页面。
