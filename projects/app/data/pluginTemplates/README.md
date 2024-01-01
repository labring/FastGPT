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
  showStatus?: boolean; // 是否需要展示组件运行状态
  modules: []; //直接从高级编排导出配置复制过来;
};
```

## 额外代码怎么写？

参考 `TFSwitch` 和 `TextEditor`，通过 HTTP 模块将数据转到一个接口中实现。提交到社区的插件，务必将所有代码都放置在 FastGPT 仓库中，可以在 `projects/app/src/pages/api/plugins` 下新建一个与**插件文件名相同**的子目录进行接口编辑。

## 需要装包怎么办？

可以在 `packages/plugins` 下创建一个与**插件文件名相同**的子目录进行编写，可在 plugins 目录下安装相关依赖。然后在 FastGPT 主项目的接口中通过 `@fastgpt/plugins/xxx` 引入。
