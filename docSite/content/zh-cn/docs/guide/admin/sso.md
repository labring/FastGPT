---
title: 'SSO & 外部成员同步'
description: 'FastGPT 外部成员系统接入设计与配置'
icon: ''
draft: false
toc: true
weight: 707
---
## 外部成员系统接入设计

### 介绍

为了方便地接入**外部成员系统**，FastGPT 提供一套接入外部系统的**标准接口**，以及一个 FastGPT-SSO-Service 镜像作为**适配器**。

可以实现：

1. SSO 登录
2. 成员和组织架构同步（下面都简称成员同步）

**原理**

FastGPT-pro 中，有一套标准的SSO 和成员同步接口，系统会根据这套接口进行 SSO 和成员同步操作。

FastGPT-SSO-Service 是为了聚合不同来源的 SSO 和成员同步接口，将他们转成 fastgpt-pro 可识别的接口。

### 内置的通用协议/IM

{{< table "table-hover table-striped-columns" >}}
| 协议/功能      | SSO 支持 | 成员同步支持 |
|----------------|----------|--------------|
| 飞书           | 是       | 是           |
| 企业微信（企微）| 是       | 是           |
| 钉钉           | 是       | 否           |
| Saml2.0        | 是       | 否           |
| Oauth2.0       | 是       | 否           |
{{< /table >}}

### 系统配置教程

首先确认外部成员系统是否可以通过中转镜像进行接入，如果可以，则可以直接部署，如果不可以，请看本文最后的“如何对接非标准系统”。

1. 首先需要参考后文的**通用外部成员系统配置**进行配置。

2. 在商业版后台配置按钮文字，图标等。

{{< table "table-hover table-striped-columns" >}}
| <div style="text-align:center">企业微信</div> | <div style="text-align:center">钉钉</div> | <div style="text-align:center">飞书</div> |
|-----------|-----------------|--------------|
| ![企业微信](/imgs/sso15.png)  |  ![钉钉](/imgs/sso16.png)       | ![飞书](/imgs/sso17.png)     |   
{{< /table >}}

3. 设置“团队模式”为“同步模式”。

   ![](/imgs/sso1.png)

#### 可选配置

1. 自动定时成员同步

   设置 fastgpt-pro 环境变量则可开启自动成员同步

```bash
SYNC_MEMBER_CRON="0 0 * * *" # Cron 表达式，每天 0 点执行
```

### 标准接口文档

#### SSO

![](/imgs/sso2.png)

FastGPT 提供如下标准接口支持：

1. example.com/getAuthURL 获取鉴权重定向地址
2. example.com/login/oauth/getUserInfo?code=xxxxx 消费 code，换取用户信息

##### GET /login/oauth/getAuthURL

该接口用于获取第三方用户系统的oauth登陆地址。

登陆地址中需要的参数，包括 client_id, secret 等都应该拼接好。

redirec_uri 应该为 FastGPT 前端服务的 /login/provider 路径：

https://fastgpt.cn/login/provider

返回值类型如下(JSON):

```JSON
{
  "success": true,
  "message": "错误信息",
  "authURL": "https://example.com/somepath/login/oauth?redirect_uri=https%3A%2F%2Ffastgpt.cn%2Flogin%2Fprovider%0A"
}
```

重定向地址 redirect_uri 应该是 fastgpt 的 /login/provider 路径。

例如 fastgpt.example.com/login/provider （提示：需要进行 urlencode）

##### GET /login/oauth/getUserInfo?code=xxxxxx

该接口接受一个 code 参数作为鉴权，消费 code 返回用户信息。

https://oauth.example/login/oauth/getUserInfo?code=xxxx

返回如下信息(JSON):

```JSON
{
  "success": true,
  "message": "错误信息",
  "username": "用户名，用于注册 fastgpt，全局唯一的， fastgpt不会自动拼接任何前缀",
  "avatar": "头像，可以为空",
  "contact": "联系方式，最好不为空"
}
```

#### 成员同步

成员同步分为**人员同步**和**组织同步**，FastGPT 会向同步服务依次发送**组织同步**和**人员同步**两个请求。

1. org/list 同步所有的组织
2. user/list 同步所有的人员

上述两个接口通过 header Authorization 中的 Bearer xxxxx 方式进行鉴权。

##### 组织同步

1. 同步组织 /org/list

GET https://example.com/org/list

⚠️注意：只能存在一个根部门。如果你的系统中存在多个根部门，需要先进行处理，加一个虚拟的根部门。
返回值类型：

```typescript
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

##### 人员同步

1. 同步用户 /user/list

GET https://example.com/user/list

返回值类型：

```typescript
type UserListResponseListType = {
    message?: string; // 报错信息
    success: boolean;
    userList: {
      username: string; // 唯一 id username 必须与 SSO 接口返回的用户 username 相同
                        // 必须携带一个前缀，例如: sync-aaaaa，和 sso 接口返回的前缀一致 
      memberName?: string; // 名字，作为 tmbname
      avatar?: string;
      contact?: string; // email or phone number
      orgs?: string[]; // 人员所在组织的 ID。没有组织传 []
    }[];
}
```

#### 如何对接非标准系统

1. 客户自己开发：按 fastgpt 提供的标准接口进行开发，并将部署后的服务地址填入 fastgpt-pro

   a. 可以参考该模版库：https://github.com/labring/fastgpt-sso-template 进行开发
2. 由 fastgpt 团队定制开发：

   a. 提供系统的 SSO 文档、获取成员和组织的文档、以及外网测试地址。

   b. 在 fastgpt-sso-service 中，增加对应的 provider 和环境变量，并编写代码来对接，具体参考开发 README。

## 通用外部成员系统配置

### 外部成员系统中转镜像部署

SSO 中转镜像（FastGPT-SSO-Service）本质是一个**适配器**,将不同的 oauth 逻辑封装为上述的逻辑。

目前提供企业微信，钉钉，飞书的适配。

如果需要适配您企业的用户系统，需要联系我们。

使用 docker-compose 部署：

```yaml
  fastgpt-sso:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.9.0
    container_name: fastgpt-sso
    restart: always
    networks:
      - fastgpt
    environment: # 具体环境变量看下面
      - SSO_PROVIDER=example
      - AUTH_TOKEN=xxxxx
      # other envs
}
```

**注意**

1. 不需要暴露端口出来。
2. 确保和 fastgpt-pro, fastgpt 在同一个网路中
3. 容器暴露的端口为 3000
4. AUTH_TOKEN 应当与 fastgpt-pro 中一致。

#### FastGPT-pro 商业版 的配置

环境变量中的 `EXTERNAL_USER_SERVICE_BASE_URL` 为内网地址，例如上述例子中的配置，环境变量应该设置为

```yaml
EXTERNAL_USER_SERVICE_BASE_URL=http://fastgpt-sso:3000
EXTERNAL_USER_SERVICE_AUTH_TOKEN=xxxxx
}
```

> 如果环境变量设置后还未生效，可能需要点击一次“保存”按钮

### 飞书

1. **参数获取**

   App ID和App Secret

   进入开发者后台，点击企业自建应用，在凭证与基础信息页面查看应用凭证。

   ![](/imgs/sso3.png)

2. **权限配置**

   进入开发者后台，点击企业自建应用，在开发配置的权限管理页面开通权限。

   ![](/imgs/sso4.png)

   对于开通用户SSO登录而言，开启用户身份权限的以下内容

   1. ***获取通讯录基本信息***
   2. ***获取用户基本信息***
   3. ***获取用户邮箱信息***
   4. ***获取用户 user ID***

   对于开启企业同步相关内容而言，开启身份权限的内容与上面一致，但要注意是开启应用权限

3. **重定向URL**

   进入开发者后台，点击企业自建应用，在开发配置的安全设置中设置重定向URL
   ![](/imgs/sso5.png)

4. **环境变量配置**

   ```bash
   # #飞书 - feishu -如果是私有化部署，这里的配置前缀可能会有变化
   # #（以下皆为官方api接口）
   # SSO_PROVIDER=feishu
   # # oauth 接口
   # SSO_TARGET_URL=https://accounts.feishu.cn/open-apis/authen/v1/authorize
   # #获取token 接口
   # FEISHU_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v2/oauth/token
   # #获取用户信息接口
   # FEISHU_GET_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
   # #重定向地址，因为飞书获取用户信息要校验所以需要填
   # FEISHU_REDIRECT_URI=xxx
   # #飞书APP的应用ID，一般以cli开头
   # FEISHU_APP_ID=xxx
   # #飞书APP的应用密钥
   # FEISHU_APP_SECRET=xxx
   ```

### 钉钉

1. **参数获取**

   CLIENT_ID与CLIENT_SECRET

   进入钉钉开放平台，点击应用开发，选择自己的应用进入，记录在凭证与基础信息页面下的Client ID与Client secret。
   ![](/imgs/sso6.png)

2. **权限配置**

   进入钉钉开放平台，点击应用开发，选择自己的应用进入，在开发配置的权限管理页面操作，需要开通的权限包括：

   1. ***个人手机号信息***
   2. ***通讯录个人信息读权限***
   3. ***获取钉钉开放接口用户访问凭证的基础权限***

3. **重定向URL**

   进入钉钉开放平台，点击应用开发，选择自己的应用进入，在开发配置的安全设置页面操作
   需要填写的内容有两个：

   1. 服务器出口IP （调用钉钉服务端API的服务器IP列表）
   2. 重定向URL（回调域名）

4. **环境变量配置**

   ```bash
   # #钉钉 - dingtalk
   # SSO_PROVIDER=dingtalk
   # #oauth 接口
   # SSO_TARGET_URL=https://login.dingtalk.com/oauth2/auth
   # #获取token 接口
   # DINGTALK_TOKEN_URL=https://api.dingtalk.com/v1.0/oauth2/userAccessToken
   # #获取用户信息接口
   # DINGTALK_GET_USER_INFO_URL=https://oapi.dingtalk.com/v1.0/contact/users/me
   # #钉钉APP的应用ID
   # DINGTALK_CLIENT_ID=xxx
   # #钉钉APP的应用密钥
   # DINGTALK_CLIENT_SECRET=xxx
   ```

### 企业微信

#### **参数获取**

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

#### **环境变量**

   ```bash
   ## 企业微信 - wecom
   # SSO_PROVIDER=wecom
   # （以下皆为官方api接口）
   # oauth 接口，在企微终端使用
   # WECOM_TARGET_URL_OAUTH=https://open.weixin.qq.com/connect/oauth2/authorize
   # # sso 接口，扫码
   # WECOM_TARGET_URL_SSO=https://login.work.weixin.qq.com/wwlogin/sso/login
   # # 获取用户id（只能拿id)
   # WECOM_GET_USER_ID_URL=https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo
   # # 获取用户详细信息（除了名字都有）
   # WECOM_GET_USER_INFO_URL=https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail
   # # 获取用户信息（有名字，没其他信息）
   # WECOM_GET_USER_NAME_URL=https://qyapi.weixin.qq.com/cgi-bin/user/get
   # # 获取组织 id 列表
   # WECOM_GET_DEPARTMENT_LIST_URL=https://qyapi.weixin.qq.com/cgi-bin/department/list
   # # 获取用户 id 列表
   # WECOM_GET_USER_LIST_URL=https://qyapi.weixin.qq.com/cgi-bin/user/list_id
   # # 企微 CorpId
   # WECOM_CORPID=
   # # 企微 App 的 AgentId 一般是 1000xxx
   # WECOM_AGENTID=
   # # 企微 App 的 Secret
   # WECOM_APP_SECRET=
   # # 通讯录同步助手的 Secret
   # WECOM_SYNC_SECRET=
   ```

### 标准 OAuth2.0

我们提供一套标准的 OAuth2.0 接入流程。
需要三个地址：

1. 登陆鉴权地址（登陆后将 code 传入 redirect_uri）
   - 需要将地址完整写好，除了 redirect_uri 以外（会自动补全）
2. 获取 access_token 的地址，请求为 GET 方法，参数 code
```bash
http://example.com/oauth/access_token?code=xxxx
```
3. 获取用户信息的地址

```bash
http://example.
```
```bash
# # OAuth2.0
# # OAuth2 登陆鉴权地址
# OAUTH2_AUTHORIZE_URL=
# # OAuth2 获取 AccessToken 地址
# OAUTH2_TOKEN_URL=
# # OAuth2 获取用户信息地址
# OAUTH2_USER_INFO_URL=
# # OAuth2 用户名字段映射（必填）
# OAUTH2_USERNAME_MAP=
# # OAuth2 头像字段映射（选填）
# OAUTH2_AVATAR_MAP=
# # OAuth2 成员名字段映射(选填)
# OAUTH2_MEMBER_NAME_MAP=
# # OAuth2 联系方式字段映射(选填)
# OAUTH2_CONTACT_MAP=

```
