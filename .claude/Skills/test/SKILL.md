---
name: test-skill
description: 当用户需要编写一个单元测试时，触发该 skill，编写单元测试。
---

## When to Use This Skill

用户需要编写一个单元测试时，触发该 skill，编写单元测试。

## 测试文件位置

### packages 测试

packages 里的测试，写在 FastGPT/test/cases 目录下，子路径对应 packages 的目录结构。

### projects 测试

projects 里的测试，写在 FastGPT/projects/app/test 目录下，子路径对应 projects 的目录结构。

## 测试文件规则

1. 每个文件，对应一个测试文件。每个函数对应不同的 describe 块。
2. 需覆盖 100% 行数和分支。
3. 测试文件尽可能不要引入第三方依赖库，使用较为原生的方式进行检查。如果需要引入第三方依赖库，则从对应文件里 export 依赖库给 test 使用。
4. 尽量减少函数 mock，如果是系统上原生可运行的函数，则无需 mock，只需要 mock 那些无法本地直接运行的依赖（比如需要远程服务，API 密钥之类的）
5. 对于 type.ts, constants.ts, schema.ts, *.schema.ts 文件，以及静态数据，直接跳过忽略。
6. 根据 [vitest.config.mts](../../../vitest.config.mts) 文件配置，跳过不需要测试的文件。

## 编写流程

1. 创建/续写对应的测试文件。
2. 思考和分析代码后编写测试样例。
3. 检查 TS 错误，确保无 ts 报错。
4. 调用`pnpm test <file-path> <test-name>`来运行测试并检查覆盖率。
5. 如果测试不通过，则根据错误信息检查代码逻辑或者测试用例。

## 特殊场景

### 多文件测试

如果用户要求完成某个目录下的单元测试，你可以创建多个子 Agent 去逐一完成每个文件的测试，不同文件之间无需共享上下文（逐一根据测试文件规则，忽略不需要测试的文件）

## 常用命令

```shell
# 运行所有测试
pnpm test

# 运行指定测试文件
pnpm test <file-path>

# 运行指定测试文件的指定测试
pnpm test <file-path> <test-name>
```
