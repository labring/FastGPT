---
title: "接入微信和企业微信 "
description: "FastGPT 接入微信和企业微信 "
icon: "chat"
draft: false
toc: true
weight: 510
---

# FastGPT 三分钟接入微信/企业微信
私人微信和企业微信接入的方式基本一样，不同的地方会刻意指出。   
[查看视频教程](https://www.bilibili.com/video/BV1rJ4m1w7xk/)
## 创建APIKey
首先找到我们需要接入的应用，然后点击「外部使用」->「API访问」创建一个APIKey并保存。

![](/imgs/wechat1.png)

## 配置微秘书

打开[微秘书](https://wechat.aibotk.com?r=zWLnZK) 注册登录后找到菜单栏「基础配置」->「智能配置」，按照下图配置。

![](/imgs/wechat2.png)

继续往下看到 `apikey` 和`服务器根地址`，这里`apikey`填写我们在 FastGPT 应用外部访问中创建的 APIkey，服务器根地址填写官方地址或者私有化部署的地址，这里用官方地址示例，注意要添加`/v1`后缀,填写完毕后保存。

![](/imgs/wechat3.png)

## sealos部署服务

[访问sealos](https://cloud.sealos.run/) 登录进来之后打开「应用管理」-> 「新建应用」。
- 应用名：称随便填写
- 镜像名：私人微信填写 aibotk/wechat-assistant 企业微信填写 aibotk/worker-assistant
- cpu和内存建议 1c1g

![](/imgs/wechat4.png)

往下翻页找到「高级配置」-> 「编辑环境变量」

![](/imgs/wechat5.png)

这里需要填写三个环境变量：   
```
AIBOTK_KEY=微秘书 APIKEY   
AIBOTK_SECRET=微秘书 APISECRET   
WORK_PRO_TOKEN=你申请的企微 token   （企业微信需要填写，私人微信不需要）
```

这里最后的企业微信 Token 在微秘书的->会员开通栏目中自行购买。

![](/imgs/wechat6.png)

这里环境变量我们介绍下如何填写：

`AIBOTK_KEY` 和 `AIBOTK_SECRET` 我们需要回到[微秘书](https://wechat.aibotk.com?r=zWLnZK)找到「个人中心」,这里的 APIKEY 对应 AIBOTK_KEY ，APISECRET 对应 `AIBOTK_SECRET`。

![](/imgs/wechat7.png)

`WORK_PRO_TOKEN` 微秘书的会员中心中自行购买即可。

填写完毕后点右上角「部署」，等待应用状态变为运行中。  

![](/imgs/wechat8.png)

返回[微秘书](https://wechat.aibotk.com?r=zWLnZK) 找到「首页」，扫码登录需要接入的微信号。

![](/imgs/wechat9.png)

## 测试
只需要发送信息，或者拉入群聊@登录的微信就会回复信息啦。
![](/imgs/wechat10.png)





