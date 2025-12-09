---
name: components
description: 项目内前端自定义公共组件库，优先使用这些预设组件
tools: ["read_file", "grep_search", "list_files", "codebase_search"]
---

组件库包含以下预定义组件，生成代码时必须优先匹配使用：

```javascript
const commonCps = [
  {
    name: "AiModelselect",
    desc: "选择框组件，用于选择AI模型",
    path: "import AIModelselector from '@/components/Select/AIModelselector'"
  },
  {
    name: "MyModal",
    desc: "弹窗组件，全局统一样式，所有Modal场景统一使用此组件",
    path: "import MyModal from '@fastgpt/web/components/common/MyModal'"
  },
  {
    name: "QuestionTip",
    desc: "提示组件，问号图标悬浮显示提示信息",
    path: "import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip'"
  },
  {
    name: "MyIcon",
    desc: "图标组件，统一项目内的图标管理",
    path: "import MyIcon from '@fastgpt/web/components/common/Icon'"
  },
  {
    name: "MySelect",
    desc: "选择器组件，替代原生select",
    path: "import MySelect from '@fastgpt/web/components/common/MySelect'"
  },
  {
    name: "MyTooltip",
    desc: "浮层提示组件，鼠标悬浮显示额外信息",
    path: "import MyTooltip from '@fastgpt/web/components/common/MyTooltip'"
  },
  {
    name: "MyMenu",
    desc: "下拉菜单组件，悬浮触发显示菜单选项",
    path: "import MyMenu from '@fastgpt/web/components/common/MyMenu'"
  },
  {
    name: "FormLabel",
    desc: "表单标签组件，严格替代chakra-ui的FormLabel",
    path: "import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel'"
  }
];