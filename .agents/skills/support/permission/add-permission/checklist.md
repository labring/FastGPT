# 权限接入实施清单

> 上线前核对清单，可打印使用。

## 设计判断

- [ ] 确认资源是否有 owner
- [ ] 确认资源是否属于 team
- [ ] 确认资源是否需要协作者
- [ ] 确认资源是否有 folder / parent-child 结构
- [ ] 确认资源是否支持 `inheritPermission`
- [ ] 确认资源是否需要 owner 转移

---

## FastGPT 主仓库

### 权限定义

- [ ] `PerResourceTypeEnum` 已添加新资源类型
- [ ] `packages/global/support/permission/{resource}/constant.ts` 已创建
  - [ ] `{Resource}RoleList`
  - [ ] `{Resource}RolePerMap`
  - [ ] `{Resource}PerList`
  - [ ] `{Resource}DefaultRoleVal`
- [ ] `packages/global/support/permission/{resource}/controller.ts` 已创建
  - [ ] `{Resource}Permission` 类

### 资源 Schema

- [ ] 包含 `teamId` 字段
- [ ] 包含 `tmbId` 字段（owner）
- [ ] 包含 `parentId` 字段（如有层级）
- [ ] 包含 `inheritPermission` 字段（如有继承）

### 鉴权函数

- [ ] `packages/service/support/permission/{resource}/auth.ts` 已创建
- [ ] `auth{Resource}` 函数已实现
- [ ] 如有继承，已实现父级权限合并

### API 权限校验

- [ ] 列表接口：`ReadPermissionVal`
- [ ] 详情接口：`ReadPermissionVal`
- [ ] 创建接口：`WritePermissionVal` 或 team 级创建权限
- [ ] 更新接口：`WritePermissionVal`
- [ ] 删除接口：`OwnerPermissionVal`（不是 Manage！）
- [ ] Folder 创建接口（如有）
- [ ] 恢复继承接口（如有）

### 继承相关（如适用）

- [ ] 明确 folder 类型列表
- [ ] 资源创建时复制父协作者
- [ ] 资源移动时同步子树权限
- [ ] `resumeInheritPermission` 逻辑

---

## fastgpt-pro

### 协作者管理

- [ ] `collaborator/list` 接口
  - [ ] 返回 `clbs`（最终生效协作者）
  - [ ] 返回 `parentClbs`（父级协作者）
- [ ] `collaborator/update` 接口
  - [ ] 需要 `ManagePermissionVal`
  - [ ] 不能修改自己的权限
  - [ ] 非 owner 不能修改管理员权限
  - [ ] 继承冲突时自动断开继承

### Owner 转移（如适用）

- [ ] `changeOwner` 接口
  - [ ] 需要 `OwnerPermissionVal`
  - [ ] 更新资源表 `tmbId`
  - [ ] 根资源断开继承
  - [ ] 修正权限记录

### 协作者类型支持

- [ ] 支持 `tmbId`（团队成员）
- [ ] 支持 `groupId`（成员组）
- [ ] 支持 `orgId`（组织）

### 审计日志

- [ ] 更新协作者日志
- [ ] 删除协作者日志
- [ ] Owner 转移日志
- [ ] 恢复继承日志（如有）
- [ ] 移动资源日志（如有）

---

## 前端

- [ ] 协作者列表 API 调用
- [ ] 协作者更新 API 调用
- [ ] Owner 转移 API 调用（如有）
- [ ] 权限配置弹窗 / 协作者管理组件
- [ ] 继承态提示 UI（如有）
- [ ] 恢复继承入口（如有）

---

## 测试

### 单元测试

- [ ] Permission 类与角色映射
- [ ] `getTmbPermission` 优先级逻辑
- [ ] 继承型资源的父子权限合并

### 集成测试

- [ ] 主要 API 的权限边界
- [ ] 删除是否要求 owner
- [ ] 移动与继承恢复逻辑
- [ ] 协作者更新冲突处理
- [ ] Owner 转移后权限记录正确性

---

## 最终检查

- [ ] 删除要求 owner，而不是 manage
- [ ] group / org 协作者按预期生效
- [ ] 继承断开后生成正确的显式协作者快照
- [ ] 移动资源后子树权限同步
- [ ] Owner 转移后旧/新 owner 权限记录正确
- [ ] 前后端展示的"最终权限"与后端实际鉴权一致
