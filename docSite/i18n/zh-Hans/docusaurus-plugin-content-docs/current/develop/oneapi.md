# 部署 OneAPI，实现多模型

无需魔法，部署即可使用

## SqlLite 版本

sqllite 版本适合个人，少并发

## 一、[点击打开 Sealos 公有云](https://cloud.sealos.io/)

## 二、打开 AppLaunchpad(应用管理) 工具

![step1](./imgs/step1.png)

## 三、点击创建新应用

## 四、填写对应参数

镜像：ghcr.io/songquanpeng/one-api:latest

![step2](./imgs/step2.png)
打开外网访问开关后，Sealos 会自动分配一个可访问的地址，不需要自己配置。

![step3](./imgs/step3.png)
填写完参数后，点击右上角部署即可。

## 5. 访问

点击 Sealos 提供的外网访问地址，即可访问 OneAPI 项目。
![step3](./imgs/step4.png)
![step3](./imgs/step5.png)

## 6. 替换 FastGpt 的环境变量

```
# 下面的地址是 Sealos 提供的，务必写上 v1
OPENAI_BASE_URL=https://xxxx.cloud.sealos.io/v1
# 下面的 key 由 one-api 提供
CHAT_API_KEY=sk-xxxxxx
```

## MySQL 版本

高流量推荐使用 MySQL 版本，支持多实例扩展。

点击下方按键一键部署 👇

[![](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Done-api)

部署完后会跳转【应用管理】，数据库在另一个应用里。需要等待 1~3 分钟数据库运行后才能访问成功。
