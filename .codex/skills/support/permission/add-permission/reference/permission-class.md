# Permission 类设计

## 1. 基类结构

```typescript
// packages/global/support/permission/controller.ts
export class Permission {
  role: PermissionValueType;
  private permission: PermissionValueType;

  // 权限状态（计算属性）
  isOwner: boolean;
  hasManagePer: boolean;
  hasWritePer: boolean;
  hasReadPer: boolean;

  // 角色状态
  hasManageRole: boolean;
  hasWriteRole: boolean;
  hasReadRole: boolean;

  constructor({ role, isOwner, roleList, perList, rolePerMap }) {
    this.role = isOwner ? OwnerRoleVal : role;
    this.updatePermissions();
  }

  // 检查是否拥有指定权限
  checkPer(perm: PermissionValueType): boolean {
    if (perm === OwnerPermissionVal) {
      return this.permission === OwnerPermissionVal;
    }
    return (this.permission & perm) === perm;
  }

  // 添加角色
  addRole(...roleList: RoleValueType[]) {
    for (const role of roleList) {
      this.role = this.role | role;
    }
    this.updatePermissions();
    return this;
  }
}
```

### 关键点

1. **存储的是 role**：`permission` 字段存的是 role 值，通过 `rolePerMap` 展开成实际权限
2. **isOwner 提升**：如果 `isOwner=true`，role 直接设为 `OwnerRoleVal`
3. **链式调用**：`addRole` 返回 `this`，支持链式操作

---

## 2. 创建资源特定的 Permission 类

```typescript
// packages/global/support/permission/{resource}/controller.ts
import { Permission, PerConstructPros } from '../controller';
import {
  {Resource}RoleList,
  {Resource}RolePerMap,
  {Resource}PerList,
  {Resource}DefaultRoleVal
} from './constant';

export class {Resource}Permission extends Permission {
  constructor(props?: PerConstructPros) {
    // 处理空参数
    if (!props) {
      props = { role: {Resource}DefaultRoleVal };
    } else if (!props.role) {
      props.role = {Resource}DefaultRoleVal;
    }

    // 注入资源特定的配置
    props.roleList = {Resource}RoleList;
    props.rolePerMap = {Resource}RolePerMap;
    props.perList = {Resource}PerList;

    super(props);
  }
}
```

---

## 3. 使用示例

### 3.1 基本检查

```typescript
const per = new DatasetPermission({ role: WriteRoleVal });

per.hasReadPer;   // true（write 包含 read）
per.hasWritePer;  // true
per.hasManagePer; // false
per.isOwner;      // false

per.checkPer(ReadPermissionVal);  // true
per.checkPer(ManagePermissionVal); // false
```

### 3.2 在鉴权中使用

```typescript
const Per = new {Resource}Permission({
  role: myPer,
  isOwner: String(resource.tmbId) === String(tmbId)
});

if (!Per.checkPer(per)) {
  return Promise.reject({Resource}ErrEnum.unAuth);
}

// 返回给调用方
return {
  permission: Per,
  {resource}: resource
};
```

### 3.3 合并权限

```typescript
import { sumPer } from '@fastgpt/global/support/permission/utils';

// 合并父级权限和自身权限
const Per = new {Resource}Permission({
  role: sumPer(folderPer, myPer),
  isOwner
});
```

---

## 4. 现有 Permission 类

| 类 | 文件 |
|----|------|
| `Permission` | `packages/global/support/permission/controller.ts` |
| `DatasetPermission` | `packages/global/support/permission/dataset/controller.ts` |
| `AppPermission` | `packages/global/support/permission/app/controller.ts` |
| `TeamPermission` | `packages/global/support/permission/user/controller.ts` |
