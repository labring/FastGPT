# @fastgpt/sandbox

A unified, high-level abstraction layer for cloud sandbox providers. It offers a consistent, vendor-agnostic interface for creating, managing, and interacting with sandboxed environments like OpenSandbox.

> This package is ESM-only (`"type": "module"`) and requires Node.js **>= 20**.

## 安装

```bash
pnpm add @fastgpt/sandbox
```

## Next.js 集成

如果在 Next.js 项目中使用，需要配置以处理 ESM 依赖。在 `next.config.js` 中添加：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fastgpt-sdk/sandbox-adapter'],
  experimental: {
    esmExternals: 'loose',
  },
};

module.exports = nextConfig;
```

详细说明请参考 [Next.js 集成指南](./docs/NEXTJS_INTEGRATION.md)。

## 用途

### 1. 操作沙盒

1. 执行命令：执行命令并返回结果
   1. Create 接口：成功返回，则认为沙盒已创建成功，可以执行命令。
   2. 执行
2. 下载文件。

### 2. 管理沙盒

1. 定期暂停：每 n 分钟不活跃则暂停
2. 定期销毁：每 n 分钟不活跃则销毁


## 添加新适配器