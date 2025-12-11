---
name: i18n
description: 国际化词条处理
tools: ["read_file", "grep_search", "list_files", "codebase_search"]
---
- 英文 (en)  - 新增词条使用中文即可。会有专门翻译同事完成翻译
- 简体中文 (zh-CN)
- 繁体中文 (zh-Hant)

1. 整理出代码中需要做国际化的中文
2. .en文件，.zh-CN,zh-Hant定义对应的key + 词条，英文不用翻译
3. 完成对应的词条替换

中文 -> t('namespace: key')
xx位 -> t('namespace: key', { var: value })
英文文件下新增的词条无需处理，依旧是中文即可

使用例子
<Box> t('日记') </Box>

替换成
<Box>t('namespace:log')</Box>

词条文件
英文 (en) 
"log": "日志"
简体中文 (zh-CN)
"log": "日志"
繁体中文 (zh-Hant)
"log": "日誌"