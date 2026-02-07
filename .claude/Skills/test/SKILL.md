---
name: test-skill
description: 当用户需要编写一个单元测试时，触发该 skill，编写单元测试。
---

## When to Use This Skill

用户需要编写一个单元测试时，触发该 skill，编写单元测试。

## 测试文件位置

### packages 测试

packages 里的测试，写在 FastGPT/test/cases 目录下，子路径对应 packages 的目录结构。例如：

`packages/global/common/error/s3.ts`文件，对应的测例文件路径为 `test/cases/global/common/error/s3.test.ts`。

### projects 测试

projects 里的测试，写在 FastGPT/projects/app/test 目录下，子路径对应 projects 的目录结构。

`projects/app/src/pages/api/core/dataset/collection/create.ts`文件，对应的测例文件路径为 `projects/app/test/api/core/dataset/collection/create.test.ts`。

## 测试文件规则

### 通用规则

1. 每个文件，对应一个测试文件。每个函数对应不同的 describe 块。
2. 需覆盖 100% 行数和分支。
3. 测试文件尽可能不要引入第三方依赖库，使用较为原生的方式进行检查。如果需要引入第三方依赖库，则从对应文件里 export 依赖库给 test 使用。
4. 尽量减少函数 mock，如果是系统上原生可运行的函数，则无需 mock，只需要 mock 那些无法本地直接运行的依赖（比如需要远程服务，API 密钥之类的）
5. 对于 type.ts, constants.ts, schema.ts, *.schema.ts 文件，以及静态数据，直接跳过忽略。
6. 根据 [vitest.config.mts](../../../vitest.config.mts) 文件配置，跳过不需要测试的文件。
7. [Mock.ts](../../../test/mocks/index.ts) 文件里，包含了全局 mock 的内容，在编写测试时，请勿重复 mock。理论上，测试里可以 mock 运行各类 infra。

### 基础函数文件测试

尽量不要 mock，而是完整的运行其逻辑进行测试。

### 带 API 请求的函数

mock 对应的 API 请求进行测试。

## 编写流程

**一、任务准备**

1. 获取所需要编写的测试文件。
2. 创建任务清单，来逐个完成每个文件的测例编写。

**二、测例编写**

不同测例文件，可以并行进行编写。

1. 检查对应的 .test.ts 测试文件，如果没有则创建。
2. 思考和分析代码后编写测试样例。
3. 检查 TS 错误，确保无 ts 报错。
4. 完成所有测试文件编写

**三、结果验证**

1. 调用`pnpm test <file-path> <test-name>`来运行测试并检查覆盖率，确保每个文件的覆盖率达到 90% 以上。
2. 如果测试不通过，则根据错误信息检查代码逻辑或者测试用例。
3. 如需二次修改，则回到”二、测例编写“。

## 常用命令

```shell
# 运行所有测试
pnpm test

# 运行指定测试文件
pnpm test <file-path>

# 运行指定测试文件的指定测试
pnpm test <file-path> <test-name>
```
