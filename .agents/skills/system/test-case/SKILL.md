---
name: test-case
description: 为 FastGPT 编写或修改 Vitest 单元测试，定位所属 workspace 的测试、选择回归场景并运行局部验证。
---

# FastGPT 单元测试

## 放置测试

优先扩展所属 workspace 中已有的相关测试，按业务模块组织。例如：

- [S3 上传错误处理](../../../../packages/global/common/error/s3.ts)对应 [packages/global/test/common/error/s3.test.ts](../../../../packages/global/test/common/error/s3.test.ts)。
- [创建数据集集合的 API](../../../../projects/app/src/pages/api/core/dataset/collection/create.ts)对应 [projects/app/test/api/core/dataset/collection/create.test.ts](../../../../projects/app/test/api/core/dataset/collection/create.test.ts)。

## 选择用例与依赖

- 从调用方可观察的行为出发，覆盖本次改动的正常路径、可能改变结果的边界和失败分支。修复回归时，用能重现原问题的输入断言预期结果。
- 负例必须走到被测分支：以合法输入为基础只改被测字段，并断言具体错误码或分支结果，不以“抛出任意错误”判定通过。正例同样要构造能触发目标行为的输入。
- 生产代码不得为测试桩新增旁路或特判；依赖真实外部资源（K8s、共享数据库集合等）的测试限定在独占环境或 fixture 范围内，避免误删或互相干扰。
- 纯函数直接执行。涉及外部请求、密钥或不稳定依赖时，在依赖边界 mock。先检查所属 workspace 的 Vitest 配置和[共享 mock](../../../../test/mocks/index.ts)，复用已有初始化。
- 测试从定义模块或原依赖导入类型和实现。业务模块的导出遵循[代码规范](../../../code/syntax.md#禁止-re-export)。
- 类型声明或静态常量通常无需独立用例。Schema 若包含运行时转换、历史数据兼容或请求校验，应验证相关行为。用覆盖率定位遗漏的分支，避免为相同结果重复写用例。

## 验证

在仓库根目录运行 `pnpm test <测试文件或目录>`。按用例名筛选、测试数据库配置及各模式的范围见[开发命令](../../../code/commands.md#测试)。
