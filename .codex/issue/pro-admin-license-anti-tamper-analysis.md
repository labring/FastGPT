# pro/admin 镜像 License 防篡改问题分析

## 背景

`pro/admin` 当前通过 License 判断商业版后台是否可用。镜像如果公开发布，使用方可以拉取镜像后重新打包，删除或绕过本地 License 拦截逻辑，从而继续启动和调用后台接口。

本分析只讨论技术边界和工程改造，不把法律协议、商务追偿作为主要防线。

## 当前事实

### 本地 License 验签

`pro/admin/src/service/common/license/auth.ts` 中内置 `LICENSE_PUBLIC_KEY`，从 MongoDB 的 `SystemConfigsTypeEnum.license` 读取 License 字符串，拆分签名和 payload，使用 `RSA-SHA256` 验签：

- 未读取到 License 时设置 `global.licenseData = undefined`。
- 验签失败、过期、内容错误时设置 `global.licenseData = undefined`。
- 验签成功后返回 `LicenseDataType`，调用方写入 `global.licenseData`。

### 启动期加载

`pro/admin/src/instrumentation-node.ts` 在 `auth-license` 初始化步骤中执行：

```ts
global.licenseData = await authLicense();
```

该步骤失败后会 `catch(() => undefined)`，服务仍继续启动，后续依赖 API 前置中间件或业务函数判断 License。

### API 前置拦截

`pro/admin/src/service/middleware/entry.ts` 把 `licenseCheck` 注册为 `NextAPI` 的 `beforeCallback`：

```ts
export const NextAPI = NextEntry({
  beforeCallback: [licenseCheck]
});
```

`licenseCheck` 当前只检查进程内的 `global.licenseData`：

```ts
if (!global.licenseData) {
  return Promise.reject('系统未激活');
}
```

因此该拦截是本地进程内判断，不是远端授权。

### 激活接口

`pro/admin/src/pages/api/admin/common/license/active.ts` 接收 `req.body.license`，调用本地 `authLicense(license)` 验签，通过后把原始 License 和解析后的 data 写入 `MongoSystemConfigs`。

### 前端可见性

`pro/admin/src/components/Layout/index.tsx`、`Header.tsx`、`Navbar.tsx` 等组件读取 `useSystemStore().licenseData` 控制 License 输入弹窗和部分菜单可见性。这些判断只能改善用户体验，不能作为安全边界。

### 镜像构建和运行

`pro/admin/Dockerfile` 构建 Next standalone 输出并复制到 runner 镜像。公开镜像会包含可运行的 server bundle、前端静态资源、worker、配置文件和依赖。攻击者一旦能获取镜像并控制运行环境，就可以重新打包修改后的镜像。

## 风险模型

假设攻击者具备以下能力：

1. 可以拉取公开 `pro/admin` 镜像。
2. 可以查看镜像层、Next standalone 输出和前端静态资源。
3. 可以修改镜像内 JS 代码并重新构建镜像。
4. 可以控制容器环境变量、文件系统、MongoDB 数据和网络出口。
5. 不能伪造 FastGPT 官方私钥签名。

在这个模型下：

- RSA 签名可以防止伪造合法 License payload。
- 但只要授权结果只在公开镜像内做本地判断，攻击者可以绕过判断本身。
- 自校验、混淆、隐藏校验点、在镜像内放 secret 都只能提高成本，不能形成强安全边界。

## 根因

当前 License 方案把“授权判定”和“商业能力执行”都放在用户完全控制的公开镜像内。

只要商业能力的完整实现已经随镜像交付，并且执行前只依赖本地 `global.licenseData` 或本地函数判断，攻击者就可以选择修改本地判断而不是伪造 License。

## 结论

如果目标是“公开镜像被 patch 后仍不能使用商业能力”，单纯加强本地 License 校验无法达成。有效方向只有两类：

1. 不再把完整商业能力交付到公开镜像中，改为私有镜像、私有插件、私有 sidecar 或远端商业服务。
2. 把授权结果变成远端可撤销、短时效、关键能力执行必须依赖的凭证，并把高价值能力迁出本地公开镜像边界。

镜像签名、SBOM、运行时自检、代码混淆可以作为“官方镜像证明”和“篡改可见性”补充，但不能作为主要防线。
