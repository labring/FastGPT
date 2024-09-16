---
title: '升级说明'
description: 'FastGPT 升级说明'
icon: 'upgrade'
draft: false
toc: true
weight: 751
---

FastGPT 升级包括两个步骤：

1. 镜像升级
2. 执行升级初始化脚本



## 镜像名

**git版**
- FastGPT 主镜像：ghcr.io/labring/fastgpt:latest
- 商业版镜像：ghcr.io/c121914yu/fastgpt-pro:latest
- Admin 镜像：ghcr.io/c121914yu/fastgpt-admin:latest

**阿里云**
- FastGPT 主镜像: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt
- 商业版镜像：ghcr:registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-pro
- Admin 镜像: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin

镜像由镜像名和`Tag`组成，例如: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.6.1 代表`4.6.3`版本镜像，具体可以看 docker hub, github 仓库。

## Sealos 修改镜像

1. 打开 [Sealos Cloud](https://cloud.sealos.io/)， 找到桌面上的应用管理
   
![](/imgs/updateImageSealos1.jpg)

2. 选择对应的应用 - 点击右边三个点 - 变更

![](/imgs/updateImageSealos2.png)

3. 修改镜像 - 确认变更

    如果要修改配置文件，可以拉到下面的`配置文件`进行修改。

![](/imgs/updateImageSealos3.png)

## Docker-Compose 修改镜像

直接修改`yml`文件中的`image: `即可。随后执行:

```bash
docker-compose pull
docker-compose up -d
```

## 执行升级初始化脚本

镜像更新完后，可以查看文档中的`版本介绍`，通常需要执行升级脚本的版本都会标明`需要初始化`，打开对应的文档，参考说明执行初始化脚本即可，大部分时候都是需要发送一个`POST`请求。


## QA

### 为什么需要初始化

数据表出现大幅度变更，无法通过设置默认值，或复杂度较高时，会通过初始化来更新部分数据表字段。
严格按初始化步骤进行操作，不会造成旧数据丢失。但在初始化过程中，如果数据量大，需要初始化的时间较长，这段时间可能会造成服务无法正常使用。

### {{host}} 是什么

{{}} 代表变量， {{host}}代表一个名为 host 的变量。指的是你服务器的域名或 IP。

Sealos 中，你可以在下图中找到你的域名：

![](/imgs/updateImageSealos4.png)


### 如何获取 rootkey

从`docker-compose.yml`中的`environment`中获取，对应的是`ROOT_KEY`的值。

sealos 中可以从上图左侧的环境变量中获取。

### 如何跨版本升级！！

建议逐一版本升级，防止脏数据。例如，当前版本是4.4.7，需要升级到4.6。

1. 修改镜像到4.5，执行初始化
2. 修改镜像到4.5.1，执行初始化
3. 修改镜像到4.5.2，执行初始化
4. 修改镜像到4.6，执行初始化
5. .....

逐一升级
