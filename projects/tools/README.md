# fastgpt-tools

FastGPT 系统工具服务

## 架构说明

- `dev` 调试工具时可以使用的 Web 工具
- `runtime` 工具的运行时
- `scripts` 脚本
- `test` 测试配置
- `tools` 系统工具目录

系统工具可以分为两种：
1. 系统工具
2. 工具集，工具集内包括功能相似的多个工具

## 部署

### 编译
1. `bun i`
2. `bun run build`

### 通过 docker 部署

<!-- TODO -->

## 贡献指南

### 贡献社区插件

1. 安装依赖: `bun i`
2. 创建新的工具/工具集 `bun run new tool <name>` 或 `bun run new folder <name>`
3. `cd tools/<name>`
4. 修改配置文件 `config.ts`
5. 在 `src` 目录下实现工具逻辑
6. 编写测试样例并通过测试
7. 提交代码并发起 PR 到 labring/FastGPT

### 私有化插件

按照上述步骤开发完毕后，执行 `bun run build` 将构建执行工具构建。
请参考**部署**中的步骤进行部署。
