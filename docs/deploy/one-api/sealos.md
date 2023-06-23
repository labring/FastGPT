# 在 Sealos 1 分钟部署 one-api

## 1. 进入 Sealos 公有云

https://cloud.sealos.io/

## 2. 打开 AppLaunchpad(应用管理) 工具

![step1](./sealosImg/step1.png)

## 3. 点击创建新应用

## 4. 填写对应参数

镜像：ghcr.io/songquanpeng/one-api:latest

![step2](./sealosImg/step2.png)
打开外网访问开关后，Sealos 会自动分配一个可访问的地址，不需要自己配置。

![step3](./sealosImg/step3.png)
填写完参数后，点击右上角部署即可。

## 5. 访问

点击 Sealos 提供的外网访问地址，即可访问 one-api 项目。
![step3](./sealosImg/step4.png)
![step3](./sealosImg/step5.png)

## 6. 替换 FastGpt 的环境变量

```
# 下面的地址是 Sealos 提供的，务必写上 v1
OPENAI_BASE_URL=https://xxxx.cloud.sealos.io/v1
# 下面的 key 由 one-api 提供
OPENAIKEY=sk-xxxxxx
```
