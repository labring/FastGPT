### FastGPT V4.7

1. 新增 - 工具调用模块，可以让LLM模型根据用户意图，动态的选择其他模型或插件执行。
2. 新增 - 分类和内容提取支持 functionCall 模式。部分模型支持 functionCall 不支持 ToolCall，也可以使用了。需要把 LLM 模型配置文件里的 `functionCall` 设置为 `true`， `toolChoice`设置为 `false`。如果 `toolChoice` 为 true，会走 tool 模式。
3. 新增 - HTTP插件，可实现OpenAPI快速生成插件。
4. 优化 - 高级编排性能。
5. 优化 - AI模型选择。
6. 优化 - 手动输入知识库弹窗。
7. 优化 - 变量输入弹窗。
8. 优化 - 浏览器读取文件自动推断编码，减少乱码情况。
9. [点击查看高级编排介绍文档](https://doc.fastgpt.in/docs/workflow/intro)
10. [使用文档](https://doc.fastgpt.in/docs/intro/)
11. [点击查看商业版](https://doc.fastgpt.in/docs/commercial/)