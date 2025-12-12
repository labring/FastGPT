---
name: term-translation
description: 词条翻译
---
请对以下代码中的中文词条进行翻译，并将词条的 key 改写为新定义的词条 key：

1. 提取代码中的词条，举例如：t('退出')
2. 在 json 文件中新增词条，包含简体中文、繁体中文、英文，三种格式，注意：英文的词条无需翻译，value 使用简体中文即可，所以输出应该是三个 json 文件，json 文件路径在上下文中
3. 以下为 json 文件示例，仅用于命名和格式参考：

   ```json
   {
     "create_dimension": "新建维度",
     "search_dimension": "搜索评测维度",
     "delete_failed": "删除失败",
     "delete_success": "删除成功",
     "builtin": "内置",
     "confirm_delete_dimension": "确认删除该维度？",
     "dimension_name": "维度名",
     "description": "介绍",
     "create_update_time": "创建/更新时间",
     "creator": "创建人"
   }
   ```
4. 新增词条后检查 key 是否存在重复，要求 key 必须唯一
5. 将代码中的词条 key 替换为 json 文件定义的 key，比如 json 文件名为：`test.json`，新增的词条定义为 `"back": "退出"`，那么要将原来的 `t('退出')` 改成 `t('test:back')`，切记不要漏了文件名的前缀！
