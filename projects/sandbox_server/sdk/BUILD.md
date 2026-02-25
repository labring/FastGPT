# SDK 构建说明

## 构建步骤

### 1. 安装依赖

```bash
cd /Volumes/code/fastgpt-pro/FastGPT/projects/sandbox_server/sdk
pnpm install
```

### 2. 构建 SDK

```bash
pnpm run build
```

这将生成以下文件到 `dist` 目录：
- `index.js` - ESM 格式
- `index.cjs` - CommonJS 格式
- `index.d.ts` - TypeScript 类型定义
- 对应的 sourcemap 文件

### 3. 开发模式

在开发过程中，可以使用 watch 模式自动重新构建：

```bash
pnpm run dev
```

### 4. 类型检查

```bash
pnpm run typecheck
```

## 发布到 npm

### 1. 登录 npm

```bash
npm login
```

### 2. 发布

```bash
pnpm publish
```

发布前会自动运行 `prepublishOnly` 脚本进行构建。

## 本地测试

### 1. 创建本地链接

```bash
cd /Volumes/code/fastgpt-pro/FastGPT/projects/sandbox_server/sdk
pnpm link --global
```

### 2. 在其他项目中使用

```bash
cd /path/to/your/project
pnpm link --global @fastgpt-sdk/sandbox_server
```

### 3. 测试完成后取消链接

```bash
pnpm unlink --global @fastgpt-sdk/sandbox_server
```

## 目录结构

```
sdk/
├── dist/              # 构建输出目录
├── index.ts           # SDK 入口文件
├── container.ts       # 容器管理 SDK
├── sandbox.ts         # 沙盒执行 SDK
├── package.json       # 包配置
├── tsconfig.json      # TypeScript 配置
├── tsup.config.ts     # 构建配置
├── README.md          # 使用文档
├── BUILD.md           # 构建文档
└── .gitignore         # Git 忽略文件
```

## 配置说明

### package.json

- `name`: @fastgpt-sdk/sandbox_server
- `main`: CommonJS 入口
- `module`: ESM 入口
- `types`: TypeScript 类型定义入口
- `exports`: 导出配置，支持多种模块格式

### tsup.config.ts

- `entry`: 入口文件
- `format`: 输出格式 (esm, cjs)
- `dts`: 生成 TypeScript 类型定义
- `clean`: 构建前清理输出目录
- `sourcemap`: 生成 sourcemap
- `external`: 外部依赖（不打包到 bundle 中）

## 依赖说明

### dependencies
- `axios`: HTTP 客户端
- `zod`: 运行时类型验证

### devDependencies
- `tsup`: TypeScript 打包工具
- `typescript`: TypeScript 编译器
- `@types/node`: Node.js 类型定义

### peerDependencies
确保使用 SDK 的项目也安装了相同版本的 axios 和 zod。
