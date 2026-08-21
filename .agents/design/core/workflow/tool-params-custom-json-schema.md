# 工具参数自定义 JSON Schema

## 需求分析

- 工具参数的数据类型增加“自定义”选项。
- 自定义模式保留独立参数名输入，只输入该参数的 property JSON Schema。
- 参数描述取参数 Schema 的 `description`，不再单独输入。
- 必填状态只由现有开关决定，不读取输入 Schema 的 `required`。
- 提交时使用专用递归 Zod Schema，严格校验每层 type、properties、items 和 required 关系。

## 开发设计

1. 在节点输入结构中保存 property 级 `customJsonSchema`。
2. 在 global JSON Schema 工具中提供 property Schema 解析函数；保留外部工具使用的宽松 Schema，手工入口使用递归严格 Schema。
3. `nodeInput2JsonSchemaProperty` 优先输出 `customJsonSchema`，外层 `nodeInputs2JsonSchema` 继续根据节点输入的 `required` 开关生成必填数组。
4. 工具参数弹窗使用本地“自定义”选择态，提交后将 Schema 自动提取为标准节点输入字段。

## TODO

- [x] 增加节点输入存储字段和解析/转换逻辑。
- [x] 覆盖正常、边界和异常转换测试。
- [x] 增加自定义类型 UI、JSON 编辑器和国际化文案。
- [x] 完成格式、Lint、测试和类型检查。
