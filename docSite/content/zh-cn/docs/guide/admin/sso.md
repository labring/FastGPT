---
title: 'SSO & 外部成员同步'
description: 'FastGPT 外部成员系统接入设计与配置'
icon: ''
draft: false
toc: true
weight: 707
---

如果你不需要用到 SSO/成员同步功能，或者是只需要用 Github、google、microsoft、公众号的快速登录，可以跳过本章节。本章适合需要接入自己的成员系统或主流 办公IM 的用户。

## 介绍

为了方便地接入**外部成员系统**，FastGPT 提供一套接入外部系统的**标准接口**，以及一个 FastGPT-SSO-Service 镜像作为**适配器**。

通过这套标注接口，你可以可以实现：

1. SSO 登录。从外部系统回调后，在  FastGPT 中创建一个用户。
2. 成员和组织架构同步（下面都简称成员同步）。

**原理**

FastGPT-pro 中，有一套标准的SSO 和成员同步接口，系统会根据这套接口进行 SSO 和成员同步操作。

FastGPT-SSO-Service 是为了聚合不同来源的 SSO 和成员同步接口，将他们转成 fastgpt-pro 可识别的接口。

   ![](/imgs/sso2.png)

## 系统配置教程

### 1. 部署 SSO-service 镜像

使用 docker-compose 部署：

```yaml
  fastgpt-sso:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.9.0
    container_name: fastgpt-sso
    restart: always
    networks:
      - fastgpt
    environment:
      - SSO_PROVIDER=example
      - AUTH_TOKEN=xxxxx # 鉴权信息，fastgpt-pro 会用到。
      # 具体对接提供商的环境变量。
```

根据不同的提供商，你需要配置不同的环境变量，下面是内置的通用协议/IM：

{{< table "table-hover table-striped-columns" >}}
| 协议/功能      | SSO | 成员同步支持 |
|----------------|----------|--------------|
| 飞书           | 是       | 是           |
| 企业微信 | 是       | 是           |
| 钉钉           | 是       | 否           |
| Saml2.0        | 是       | 否           |
| Oauth2.0       | 是       | 否           |
{{< /table >}}

### 2. 配置 fastgpt-pro

#### 1. 配置环境变量

环境变量中的 `EXTERNAL_USER_SYSTEM_BASE_URL` 为内网地址，例如上述例子中的配置，环境变量应该设置为

```yaml
env:
   - EXTERNAL_USER_SYSTEM_BASE_URL=http://fastgpt-sso:3000
   - EXTERNAL_USER_SYSTEM_AUTH_TOKEN=xxxxx
```

#### 2. 在商业版后台配置按钮文字，图标等。

{{< table "table-hover table-striped-columns" >}}
| <div style="text-align:center">企业微信</div> | <div style="text-align:center">钉钉</div> | <div style="text-align:center">飞书</div> |
|-----------|-----------------|--------------|
| ![企业微信](/imgs/sso15.png)  |  ![钉钉](/imgs/sso16.png)       | ![飞书](/imgs/sso17.png)     |
{{< /table >}}

#### 3. 开启成员同步（可选）

如果需要同步外部系统的成员，可以选择开启成员同步。团队模式具体可参考：[团队模式说明文档](/docs/guide/admin/teamMode)

![](/imgs/sso1.png)

#### 4. 可选配置

1. 自动定时成员同步

设置 fastgpt-pro 环境变量则可开启自动成员同步

```bash
env:
   - "SYNC_MEMBER_CRON=0 0 * * *" # Cron 表达式，每天 0 点执行
```

## 内置的通用协议/IM 配置示例

### 飞书

#### 1. 参数获取

   App ID和App Secret

   进入开发者后台，点击企业自建应用，在凭证与基础信息页面查看应用凭证。

   ![](/imgs/sso3.png)

#### 2. 权限配置

   进入开发者后台，点击企业自建应用，在开发配置的权限管理页面开通权限。

   ![](/imgs/sso4.png)

   对于开通用户SSO登录而言，开启用户身份权限的以下内容

   1. ***获取通讯录基本信息***
   2. ***获取用户基本信息***
   3. ***获取用户邮箱信息***
   4. ***获取用户 user ID***

   对于开启企业同步相关内容而言，开启身份权限的内容与上面一致，但要注意是开启应用权限

#### 3. 重定向URL

   进入开发者后台，点击企业自建应用，在开发配置的安全设置中设置重定向URL
   ![](/imgs/sso5.png)

#### 4. yml 配置示例

```bash
fastgpt-sso:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.9.0
    container_name: fastgpt-sso
    restart: always
    networks:
      - fastgpt
    environment:
      # 飞书 - feishu -如果是私有化部署，这里的配置前缀可能会有变化
      - SSO_PROVIDER=feishu
      - AUTH_TOKEN=xxxxx
      # oauth 接口（公开的飞书不用改）
      - SSO_TARGET_URL=https://accounts.feishu.cn/open-apis/authen/v1/authorize
      # 获取token 接口（公开的飞书不用改）
      - FEISHU_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v2/oauth/token
      # 获取用户信息接口（公开的飞书不用改）
      - FEISHU_GET_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
      # 重定向地址，因为飞书获取用户信息要校验所以需要填
      - FEISHU_REDIRECT_URI=xxx
      #飞书APP的应用ID，一般以cli开头
      - FEISHU_APP_ID=xxx
      #飞书APP的应用密钥
      - FEISHU_APP_SECRET=xxx
```

### 钉钉

#### 1. 参数获取

   CLIENT_ID 与 CLIENT_SECRET

   进入钉钉开放平台，点击应用开发，选择自己的应用进入，记录在凭证与基础信息页面下的Client ID与Client secret。
   ![](/imgs/sso6.png)

#### 2. 权限配置

   进入钉钉开放平台，点击应用开发，选择自己的应用进入，在开发配置的权限管理页面操作，需要开通的权限包括：

   1. ***个人手机号信息***
   2. ***通讯录个人信息读权限***
   3. ***获取钉钉开放接口用户访问凭证的基础权限***

#### 3. 重定向URL

   进入钉钉开放平台，点击应用开发，选择自己的应用进入，在开发配置的安全设置页面操作
   需要填写的内容有两个：

   1. 服务器出口IP （调用钉钉服务端API的服务器IP列表）
   2. 重定向URL（回调域名）

#### 4. yml 配置示例

```bash
fastgpt-sso:
   image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.9.0
   container_name: fastgpt-sso
   restart: always
   networks:
      - fastgpt
   environment:
      - SSO_PROVIDER=dingtalk
      - AUTH_TOKEN=xxxxx
      #oauth 接口
      - SSO_TARGET_URL=https://login.dingtalk.com/oauth2/auth
      #获取token 接口
      - DINGTALK_TOKEN_URL=https://api.dingtalk.com/v1.0/oauth2/userAccessToken
      #获取用户信息接口
      - DINGTALK_GET_USER_INFO_URL=https://oapi.dingtalk.com/v1.0/contact/users/me
      #钉钉APP的应用ID
      - DINGTALK_CLIENT_ID=xxx
      #钉钉APP的应用密钥
      - DINGTALK_CLIENT_SECRET=xxx
```

### 企业微信

#### 1. 参数获取

   1. 企业的 CorpID

      a. 使用管理员账号登陆企业微信管理后台 `https://work.weixin.qq.com/wework_admin/loginpage_wx`

      b. 点击 【我的企业】 页面，查看企业的 **企业ID**

      ![](/imgs/sso7.png)

   2. 创建一个供 FastGPT 使用的内部应用：

      a. 获取应用的 AgentID 和 Secret

      b. 保证这个应用的可见范围为全部（也就是根部门）

      ![](/imgs/sso8.png)


      ![](/imgs/sso9.png)

   3. 一个域名。并且要求：

      a. 解析到可公网访问的服务器上

      b. 可以在该服务的根目录地址上挂载静态文件（以便进行域名归属认证 ，按照配置处的提示进行操作，只需要挂载一个静态文件，认证后可以删除）

      c. 配置网页授权，JS-SDK以及企业微信授权登陆

      d. 可以在【企业微信授权登陆】页面下方设置“在工作台隐藏应用”

      ![](/imgs/sso10.png)

      ![](/imgs/sso11.png)

      ![](/imgs/sso12.png)

   4. 获取 “通讯录同步助手” secret

      获取通讯录，组织成员 ID 需要使用 “通讯录同步助手” secret

      【安全与管理】-- 【管理工具】 -- 【通讯录同步】

      ![](/imgs/sso13.png)

   5. 开启接口同步

   6. 获取 Secret

   7. 配置企业可信 IP

      ![](/imgs/sso14.png)

#### 2. yml 配置示例

```bash
fastgpt-sso:
   image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.9.0
   container_name: fastgpt-sso
   restart: always
   networks:
      - fastgpt
   environment:
      - SSO_PROVIDER=wecom
      - AUTH_TOKEN=xxxxx
      # oauth 接口，在企微终端使用
      - WECOM_TARGET_URL_OAUTH=https://open.weixin.qq.com/connect/oauth2/authorize
      # sso 接口，扫码
      - WECOM_TARGET_URL_SSO=https://login.work.weixin.qq.com/wwlogin/sso/login
      # 获取用户id（只能拿id)
      - WECOM_GET_USER_ID_URL=https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo
      # 获取用户详细信息（除了名字都有）
      - WECOM_GET_USER_INFO_URL=https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail
      # 获取用户信息（有名字，没其他信息）
      - WECOM_GET_USER_NAME_URL=https://qyapi.weixin.qq.com/cgi-bin/user/get
      # 获取组织 id 列表
      - WECOM_GET_DEPARTMENT_LIST_URL=https://qyapi.weixin.qq.com/cgi-bin/department/list
      # 获取用户 id 列表
      - WECOM_GET_USER_LIST_URL=https://qyapi.weixin.qq.com/cgi-bin/user/list_id
      # 企微 CorpId
      - WECOM_CORPID=
      # 企微 App 的 AgentId 一般是 1000xxx
      - WECOM_AGENTID=
      # 企微 App 的 Secret
      - WECOM_APP_SECRET=
      # 通讯录同步助手的 Secret
      - WECOM_SYNC_SECRET=
```

### 标准 OAuth2.0

我们提供一套 RFC 6749 中鉴权码模式的 OAuth2.0 接入支持。
参考：
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) 文档。
- [阮一峰的网络日志](https://www.ruanyifeng.com/blog/2014/05/oauth_2_0.html)

#### 参数需求

##### 三个地址
我们提供一套标准的 OAuth2.0 接入流程。需要三个地址：

1. 登陆鉴权地址（用户点击 SSO 按钮后将携带参数直接跳转到该地址）, 例如：`http://example.com/oauth/authorize`
    ```bash
    curl -X GET\
    "http://example.com/oauth/authorize?response_type=code&client_id=s6BhdRkqt3&state=xyz&redirect_uri=https%3A%2F%2Ffastgpt.cn%2Flogin%2Fprovider"
    ```
      用户输入账号密码后，会跳转到 redirect_uri 中，并携带 code 参数：
      `https://fastgpt.cn/login/provider?code=4/P7qD2qAz4&state=xyz`
2. 获取 access_token 的地址，获取到 code 后，通过*服务器请求*该地址获取 access_token 例如：`http://example.com/oauth/access_token`
    ```bash
    curl -X POST\
        -H "Content-Type: application/x-www-form-urlencoded"\
    "http://example.com/oauth/access_token?grant_type=authorization_code&client_id=s6BhdRkqt3&client_secret=xxx&code=4/P7qD2qAz4&redirect_uri=https%3A%2F%2Ffastgpt.cn%2Flogin%2Fprovider"
    ```
    注意：Content-Type 必须是 application/x-www-form-urlencoded, 而不是 application/json
3. 获取用户信息的地址，需要传入 access_token 例如：`http://example.com/oauth/user_info`
    ```bash
    curl -X GET\
        -H "Authorization: Bearer 4/P7qD2qAz4"\
        "http://example.com/oauth/user_info"
    ```
    注意： access_token 作为 Authorization 头部传入, 格式为 Bearer xxxx

##### 参数配置
- CLIENT_ID: 必须
- CLIENT_SECRET: 非必须，如果没有可以不配置
- SCOPE: 非必须，如果没有可以不配置

> redirect_uri 参数会根据运行环境自动补全
>
> 其他固定参数如 grant_type, response_type 等会自动补全

#### 配置示例

```bash
fastgpt-sso:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.9.0
    container_name: fastgpt-sso
    restart: always
    networks:
        - fastgpt
    environment:
        - SSO_PROVIDER=oauth2
        - AUTH_TOKEN=xxxxx
        # OAuth2.0
        # === 请求地址 ===
        # 1. OAuth2 登陆鉴权地址 (必填)
        - OAUTH2_AUTHORIZE_URL=
        # 2. OAuth2 获取 AccessToken 地址 (必填)
        - OAUTH2_TOKEN_URL=
        # 3. OAuth2 获取用户信息地址 (必填)
        - OAUTH2_USER_INFO_URL=
        # === 参数 ===
        # 1. client_id （必填）
        - OAUTH2_CLIENT_ID=
        # 2. client_secret (选填，如果没有则不传)
        - OAUTH2_CLIENT_SECRET=
        # 3. scope （选填）
        - OAUTH2_SCOPE=
        # === 字段映射 ===
        # OAuth2 用户名字段映射（必填）
        - OAUTH2_USERNAME_MAP=
        # OAuth2 头像字段映射（选填）
        - OAUTH2_AVATAR_MAP=
        # OAuth2 成员名字段映射(选填)
        - OAUTH2_MEMBER_NAME_MAP=
        # OAuth2 联系方式字段映射(选填)
        - OAUTH2_CONTACT_MAP=
```

## 标准接口文档

以下是 FastGPT-pro 中，SSO 和成员同步的标准接口文档，如果需要对接非标准系统，可以参考该章节进行开发。

![](/imgs/sso18.png)

FastGPT 提供如下标准接口支持：

1. https://example.com/login/oauth/getAuthURL 获取鉴权重定向地址
2. https://example.com/login/oauth/getUserInfo?code=xxxxx 消费 code，换取用户信息
3. https://example.com/org/list 获取组织列表
4. https://example.com/user/list 获取成员列表

### 获取 SSO 登录重定向地址

返回一个重定向登录地址，fastgpt 会自动重定向到该地址。redirect_uri  会自动拼接到该地址的 query中。

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl -X GET "https://redict.example/login/oauth/getAuthURL?redirect_uri=xxx&state=xxxx" \
-H "Authorization: Bearer your_token_here" \
-H "Content-Type: application/json"
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

成功：

```JSON
{
  "success": true,
  "message": "",
  "authURL": "https://example.com/somepath/login/oauth?redirect_uri=https%3A%2F%2Ffastgpt.cn%2Flogin%2Fprovider%0A"
}
```

失败：

```JSON
{
   "success": false,
   "message": "错误信息",
   "authURL": ""
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


### SSO 获取用户信息

该接口接受一个 code 参数作为鉴权，消费 code 返回用户信息。

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl -X GET "https://oauth.example/login/oauth/getUserInfo?code=xxxxxx" \
-H "Authorization: Bearer your_token_here" \
-H "Content-Type: application/json"
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

成功：
```JSON
{
  "success": true,
  "message": "",
  "username": "fastgpt-123456789",
  "avatar": "https://example.webp",
  "contact": "+861234567890",
  "memberName": "成员名（非必填）",
}
```

失败：
```JSON
{
  "success": false,
  "message": "错误信息",
  "username": "",
  "avatar": "",
  "contact": ""
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

### 获取组织

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl -X GET "https://example.com/org/list" \
-H "Authorization: Bearer your_token_here" \
-H "Content-Type: application/json"
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

⚠️注意：只能存在一个根部门。如果你的系统中存在多个根部门，需要先进行处理，加一个虚拟的根部门。返回值类型：

```ts
type OrgListResponseType = {
    message?: string; // 报错信息
    success: boolean;
    orgList: {
        id: string; // 部门的唯一 id
        name: string; // 名字
        parentId: string; // parentId，如果为根部门，传空字符串。
    }[];
}
```

```JSON
{
  "success": true,
  "message": "",
   "orgList": [
      {
         "id": "od-125151515",
         "name": "根部门",
         "parentId": ""
      },
      {
         "id": "od-51516152",
         "name": "子部门",
         "parentId": "od-125151515"
      }
   ]
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


### 获取成员


{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl -X GET "https://example.com/user/list" \
-H "Authorization: Bearer your_token_here" \
-H "Content-Type: application/json"
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

返回值类型：

```typescript
type UserListResponseListType = {
    message?: string; // 报错信息
    success: boolean;
    userList: {
      username: string; // 唯一 id username 必须与 SSO 接口返回的用户 username 相同。并且必须携带一个前缀，例如: sync-aaaaa，和 sso 接口返回的前缀一致
      memberName?: string; // 名字，作为 tmbname
      avatar?: string;
      contact?: string; // email or phone number
      orgs?: string[]; // 人员所在组织的 ID。没有组织传 []
    }[];
}
```
curl示例

```JSON
{
  "success": true,
  "message": "",
  "userList": [
    {
      "username": "fastgpt-123456789",
      "memberName": "张三",
      "avatar": "https://example.webp",
      "contact": "+861234567890",
      "orgs": ["od-125151515", "od-51516152"]
    },
    {
      "username": "fastgpt-12345678999",
      "memberName": "李四",
      "avatar": "",
      "contact": "",
      "orgs": ["od-125151515"]
    }
  ]

}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}




## 如何对接非标准系统

1. 客户自己开发：按 fastgpt 提供的标准接口进行开发，并将部署后的服务地址填入 fastgpt-pro
   可以参考该模版库：[fastgpt-sso-template](https://github.com/labring/fastgpt-sso-template) 进行开发
2. 由 fastgpt 团队定制开发：
   a. 提供系统的 SSO 文档、获取成员和组织的文档、以及外网测试地址。
   b. 在 fastgpt-sso-service 中，增加对应的 provider 和环境变量，并编写代码来对接。
