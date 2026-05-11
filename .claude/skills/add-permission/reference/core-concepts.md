# 核心概念

## 1. 权限值 (Permission Value) - 位字段设计

权限使用位字段 (bitmask) 表示，支持权限组合：

```typescript
// packages/global/support/permission/constant.ts
export const CommonPerList = {
  owner: ~0 >>> 0,  // 所有位为1，表示所有者
  read: 0b100,      // 读权限 (4)
  write: 0b010,     // 写权限 (2)
  manage: 0b001     // 管理权限 (1)
};
```

### 权限值对照表

| 权限 | 值 | 二进制 | 说明 |
|------|-----|--------|------|
| NullRoleVal | 0 | 0b000 | 无角色 |
| ReadPermissionVal | 4 | 0b100 | 读权限 |
| WritePermissionVal | 2 | 0b010 | 写权限 |
| ManagePermissionVal | 1 | 0b001 | 管理权限 |
| OwnerPermissionVal | ~0>>>0 | 全1 | 所有者 |

### 位运算示例

```typescript
// 检查是否有读权限
const hasRead = (permission & ReadPermissionVal) === ReadPermissionVal;

// 合并权限
const merged = permission1 | permission2;

// 添加权限
const withWrite = permission | WritePermissionVal;
```

---

## 2. 自定义权限规则

`CommonPerList` 定义了基础权限位，其中低三位具有固定语义：

| 位 | 权限 | 值 |
|----|------|-----|
| 第 1 位 | manage | 0b001 |
| 第 2 位 | write | 0b010 |
| 第 3 位 | read | 0b100 |

**规则：自定义权限只能增加高位的位值，不得修改低三位。**

原因：低三位是 `CommonRolePerMap` 角色继承体系的基础，修改会导致角色映射错乱。

### 正确示例

```typescript
// packages/global/support/permission/app/constant.ts
export const AppPerList = {
  ...CommonPerList,
  readChatLog: 0b1000  // 第 4 位，正确：使用高位
};
```

---

## 3. 角色值 (Role Value) - 权限映射

**关键区分**：数据库中 `permission` 字段存储的是**角色值**，不是展开后的权限值。

```typescript
// 角色 -> 权限映射
export const CommonRolePerMap = new Map([
  [0b100, 0b100],  // read 角色 -> read 权限
  [0b010, 0b110],  // write 角色 -> write + read 权限
  [0b001, 0b111]   // manage 角色 -> manage + write + read 权限
]);
```

### 角色继承关系

```
manage (0b001) ──包含──► write + read
   │
write (0b010) ──包含──► read
   │
read (0b100)
```

---

## 4. 协作者类型

权限可以分配给三种实体（三选一）：

```typescript
// packages/global/support/permission/collaborator.ts
type CollaboratorIdType = RequireOnlyOne<{
  tmbId: string;    // 团队成员
  groupId: string;  // 成员组
  orgId: string;    // 组织
}>;
```

### 权限优先级

```
tmbId (个人权限)
   │
   └─ 存在？─► 直接返回
         │
         └─ 否 ─► groupId + orgId 合并后返回
```

**注意**：不是"个人 > 组 > 组织"的覆盖关系，而是：
- 个人权限存在则直接使用
- 否则 group 和 org 权限按位合并

---

## 5. ResourcePermission Schema

```typescript
// packages/service/support/permission/schema.ts
const ResourcePermissionSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, required: true },

  // 协作者标识（三选一）
  tmbId: { type: Schema.Types.ObjectId },
  groupId: { type: Schema.Types.ObjectId },
  orgId: { type: Schema.Types.ObjectId },

  // 资源信息
  resourceType: { type: String, enum: Object.values(PerResourceTypeEnum), required: true },
  resourceId: { type: Schema.Types.ObjectId },

  // 存储的是角色值
  permission: { type: Number, required: true }
});
```

### 索引

- `resourceId + tmbId` 唯一
- `resourceId + groupId` 唯一
- `resourceId + orgId` 唯一

---

## 6. 资源 Schema 权限相关字段

```typescript
const ResourceSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, required: true },
  tmbId: { type: Schema.Types.ObjectId, required: true },   // 创建者/owner
  parentId: { type: Schema.Types.ObjectId, default: null }, // 父资源（可选）
  inheritPermission: { type: Boolean, default: true }       // 是否继承（可选）
});
```
