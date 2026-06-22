---
capability_label: 账号信息
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles: ["普通成员", "团队管理员", "团队拥有者"]
router_paths: ["/account/info"]
---

# 账号信息 — API索引

## 用户信息查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/user/tokenLogin` | GET | 获取当前登录用户信息 | `useUserStore.ts:54` → `pages/account/info/index.tsx:77` | 账户→账号信息→页面加载时调用（`initUserInfo`） |

## 用户信息更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/user/account/update` | PUT | 更新用户头像和时区 | `useUserStore.ts:89` → `pages/account/info/index.tsx:157` | 账户→账号信息→上传头像后自动保存时调用 |
| `/proApi/support/user/team/member/updateName` | PUT | 修改团队成员昵称 | `team/api.ts:61` → `pages/account/info/index.tsx:328` | 账户→账号信息→编辑昵称输入框失焦时调用 |
| `/api/support/user/updatePasswordByOld` | POST | 通过旧密码修改密码 | `user/api.ts:?` → `UpdatePswModal.tsx:47` | 账户→账号信息→修改密码→点击确认按钮时调用 |
| `/common/file/presignAvatarPostUrl` | POST | 获取头像上传预签名URL | `file/api.ts:8` → `pages/account/info/index.tsx:177` | 账户→账号信息→选择头像文件后上传时调用 |

## 团队套餐查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/team/plan/getTeamPlanStatus` | GET | 获取团队套餐状态和用量 | `team/api.ts:123` → `useUserStore.ts:100` | 账户→账号信息→页面加载时调用（`initTeamPlanStatus`）；兑换优惠券成功后刷新时调用 |

## 钱包操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/support/wallet/balance/conversion` | POST | 余额兑换为AI积分 | `bill/api.ts:?` → `ConversionModal.tsx:32` | 账户→账号信息→余额兑换→点击确认兑换按钮时调用 |
| `/proApi/support/wallet/coupon/redeem` | GET | 使用兑换码兑换优惠券 | `team/api.ts:131` → `RedeemCouponModal.tsx:19` | 账户→账号信息→兑换优惠券→输入券码点击确认时调用 |

## 客服与工单

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/common/workorder/create` | GET | 获取工单系统跳转URL | `workorder/api.ts:2` → `pages/account/info/index.tsx:749` | 账户→账号信息→问题反馈→点击按钮时调用；需先验证工单访问权限 |

---

## API 调用链追踪

### `GET /api/support/user/tokenLogin` 调用链

```
Info页面 (useMount → initUserInfo)
  ├── 触发: 页面首次加载
  ├── 参数: 无（使用登录 Cookie/Session 认证）
  └── 响应处理: 更新 userInfo State → 设置头像、用户名、团队信息、语言偏好；同时触发 initTeamPlanStatus

Info页面（手动刷新）
  ├── 触发: 修改成员昵称后调用 initUserInfo() 刷新
  └── 响应处理: 同上
```

### `PUT /api/support/user/account/update` 调用链

```
MyInfo组件 (afterUploadAvatar → onClickSave)
  ├── 触发: 用户选择头像文件并上传成功后
  ├── 参数: { avatar: string, timezone: string }
  ├── 前置: 先通过 POST /common/file/presignAvatarPostUrl 获取预签名URL并上传文件到S3
  ├── 成功: 乐观更新 userInfo State → Toast 提示"更新成功"
  └── 失败: 回滚 userInfo 到旧值 → 静默失败
```

### `PUT /proApi/support/user/team/member/updateName` 调用链

```
MyInfo组件 (昵称Input onBlur)
  ├── 触发: 用户编辑昵称输入框后失焦
  ├── 参数: { name: string }（最大100字符）
  ├── 条件: 新值与当前值不同才发起请求；同步成员不可编辑（isSyncMember）
  ├── 成功: initUserInfo() 刷新页面数据
  └── 失败: 静默捕获异常，不做提示
```

### `POST /api/support/user/updatePasswordByOld` 调用链

```
UpdatePswModal (表单提交)
  ├── 触发: 用户填写旧密码、新密码、确认密码后点击确认
  ├── 参数: { oldPsw: string, newPsw: string }
  ├── 前置校验: 新密码满足密码规则（checkPasswordRule）；新密码与确认密码一致
  ├── 成功: 关闭弹窗 → Toast 提示"密码修改成功"
  └── 失败: Toast 提示"密码修改失败"；表单校验失败显示对应错误文案
```

### `POST /common/file/presignAvatarPostUrl` 调用链

```
MyInfo组件 (AvatarUploader)
  ├── 触发: 用户点击头像区域 → 选择图片文件
  ├── 参数: { filename: string, autoExpired?: boolean }
  ├── 响应: 返回预签名上传URL
  └── 后续: 使用预签名URL上传图片文件 → 成功后调用 afterUploadAvatar → onClickSave 更新用户头像
```

### `GET /support/user/team/plan/getTeamPlanStatus` 调用链

```
useUserStore.initTeamPlanStatus
  ├── 触发: 页面加载（与 initUserInfo 并行调用）；券码兑换成功后手动刷新
  ├── 参数: 无（请求头 { maxQuantity: 1 }，防止高频重复请求）
  ├── 成功: 更新 teamPlanStatus State → UI 渲染套餐名称、用量进度条、到期时间
  └── 失败: 静默失败，套餐相关UI不展示
```

### `POST /api/support/wallet/balance/conversion` 调用链

```
ConversionModal (onConvert)
  ├── 触发: 用户查看余额兑换弹窗 → 点击「兑换」按钮
  ├── 参数: 无（后端根据当前用户余额计算）
  ├── 兑换公式: 余额 / 15 × SUB_EXTRA_POINT_RATE（前端展示计算）
  ├── 成功: 页面刷新（router.reload）→ Toast 提示"兑换成功"
  └── 失败: Toast 提示"兑换失败"
```

### `GET /proApi/support/wallet/coupon/redeem` 调用链

```
RedeemCouponModal (redeemCouponAsync)
  ├── 触发: 用户输入券码 → 点击确认
  ├── 参数: { key: couponCode } (couponCode为输入框值)
  ├── 成功: 触发 onSuccess 刷新套餐状态 → 关闭弹窗 → Toast 提示"操作成功"
  └── 失败: 静默失败（依赖后端错误响应）
```

### `GET /proApi/common/workorder/create` 调用链

```
Other组件 (onFeedback)
  ├── 触发: 用户点击「问题反馈」按钮
  ├── 前置检查: 验证团队套餐是否支持工单（ticketResponseTime 是否存在）
  │   ├── 无工单权限 → 弹窗提示工单不可用（TeamErrEnum.ticketNotAvailable）
  │   └── 有工单权限 → 继续
  ├── 参数: 无
  └── 成功: 获取 redirectUrl → window.open 跳转到工单系统
```
