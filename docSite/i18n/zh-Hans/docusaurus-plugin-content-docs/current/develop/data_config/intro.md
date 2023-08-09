---
sidebar_position: 1
---

# 快速介绍

由于环境变量不利于配置复杂的内容，新版 FastGPT 采用了 ConfigMap 的形式挂载配置文件，你可以在 client/data/config.json 看到默认的配置文件。

开发环境下，你需要复制一份 config.json 成 config.local.json 文件才会生效。

这个配置文件中包含了前端页面定制、系统级参数、AI 对话的模型等……

## 基础字段粗略说明

这里会介绍一些基础的配置字段。

```json
// 这个配置会控制前端的一些样式
"FeConfig": {
    "show_emptyChat": true, // 对话页面，空内容时，是否展示介绍页
    "show_register": false, // 是否展示注册按键（包括忘记密码，注册账号和三方登录）
    "show_appStore": false, // 是否展示应用市场（不过目前权限还没做好，放开也没用）
    "show_userDetail": false, // 是否展示用户详情（账号余额、OpenAI 绑定）
    "show_git": true, // 是否展示 Git
    "systemTitle": "FastAI", // 系统的 title
    "authorText": "Made by FastAI Team.", // 签名
    "gitLoginKey": "" // Git 登录凭证
}
```

```json
// 这个配置文件是系统级参数
"SystemParams": {
    "gitLoginSecret": "", //  Git 登录凭证
    "vectorMaxProcess": 15, // 向量生成最大进程，结合数据库性能和 key 来设置
    "qaMaxProcess": 15,  // QA 生成最大进程，结合数据库性能和 key 来设置
    "pgIvfflatProbe": 20  // pg vector 搜索探针。没有设置索引前可忽略，通常 50w 组以上才需要设置。
  },
```
