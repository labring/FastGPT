# 代码规范

- 采用 DDD 架构 + 模块划分的代码风格，按业务进行划分，然后再按 controller + service + entity 划分。
- 使用 type 进行类型声明。
- 使用 IIFE 写法来取代 if else 进行变量条件复制。
- function props 数量不能超过 2 个，多参数采用对象传递。