## 插件类型

xxx.json 文件

```ts
type TemplateType =
  | 'userGuide'
  | 'systemInput'
  | 'tools'
  | 'textAnswer'
  | 'functionCall'
  | 'externalCall'
  | 'other';

type pluginType = {
  author: string; // 填写作者信息
  templateType: FlowModuleTemplateType['templateType'];
  name: string;
  avatar: string;
  intro: string;
  modules: 直接从高级编排导出配置复制过来;
};
```
