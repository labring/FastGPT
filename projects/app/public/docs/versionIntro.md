### Fast GPT V4.6.4

1. 重写 - 分享链接身份逻辑，采用 localID 记录用户的ID。
2. 商业版新增 - 分享链接 SSO 方案，通过`身份鉴权`地址，仅需`3个接口`即可完全接入已有用户系统。具体参考[分享链接身份鉴权](https://doc.fastgpt.in/docs/development/openapi/share/)
3. 新增 - 分享链接更多嵌入方式提示，更多DIY方式。
4. 优化 - 历史记录模块。弃用旧的历史记录模块，直接在对应地方填写数值即可。
5. 调整 - 知识库搜索模块 topk 逻辑，采用 MaxToken 计算，兼容不同长度的文本块
6. 链接读取支持多选择器。参考[Web 站点同步用法](https://doc.fastgpt.in/docs/course/webSync)
7. [知识库结构详解](https://doc.fastgpt.in/docs/use-cases/datasetengine/)
8. [知识库提示词详解](https://doc.fastgpt.in/docs/use-cases/ai_settings/#引用模板--引用提示词)
9. [使用文档](https://doc.fastgpt.in/docs/intro/)
10. [点击查看高级编排介绍文档](https://doc.fastgpt.in/docs/workflow)
11. [点击查看商业版](https://doc.fastgpt.in/docs/commercial/)
