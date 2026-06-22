---
capability_label: 数据集列表
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:37:00.000Z"
parent_module: 数据集
roles: ["管理员", "协作者", "只读用户"]
router_paths: ["/dataset/list"]
---

# 数据集列表 — API索引

## 数据集查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/list` | POST | 获取数据集列表（分页） | `web/core/dataset/api.ts:128` → `pageComponents/dataset/list/context.tsx` | 数据集列表→加载时调用；数据集列表→切换文件夹时调用；数据集列表→搜索时调用；数据集列表→自动加载更多时调用 |
| `/core/dataset/listWithChildren` | POST | 获取带子节点层级的数据集列表 | `web/core/dataset/api.ts:131` → `pageComponents/dataset/list/context.tsx` | 数据集列表→文件夹展开时调用 |
| `/core/dataset/paths` | GET | 获取数据集文件夹路径（面包屑） | `web/core/dataset/api.ts:142` → `pageComponents/dataset/list/context.tsx` | 数据集列表→加载面包屑导航时调用；数据集列表→切换文件夹后刷新路径时调用 |
| `/core/dataset/detail` | GET | 获取单个数据集详情 | `web/core/dataset/api.ts:145` → `pageComponents/dataset/list/context.tsx` | 数据集列表→获取当前文件夹详情时调用 |

## 数据集创建/更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/create` | POST | 创建新数据集 | `web/core/dataset/api.ts:148` → `pageComponents/dataset/list/CreateModal.tsx` | 数据集列表→创建数据集→提交创建表单时调用 |
| `/core/dataset/createWithFiles` | POST | 创建数据集并上传文件 | `web/core/dataset/api.ts:151` → `pageComponents/dataset/list/CreateModal.tsx` | 数据集列表→创建数据集→选择文件上传时调用 |
| `/core/dataset/folder/create` | POST | 创建数据集文件夹 | `web/core/dataset/api.ts:163` → `pages/dataset/list/index.tsx:295` | 数据集列表→新建文件夹→提交创建时调用 |
| `/core/dataset/update` | PUT | 更新数据集信息 | `web/core/dataset/api.ts:153` → `pageComponents/dataset/list/context.tsx` | 数据集列表→编辑数据集→保存修改时调用；数据集列表→编辑文件夹→保存修改时调用；数据集列表→移动数据集时调用 |

## 数据集删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/delete` | DELETE | 删除数据集 | `web/core/dataset/api.ts:155` → `pageComponents/dataset/list/context.tsx` | 数据集列表→删除数据集→确认删除后调用 |

## 权限管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/getPermission` | GET | 获取数据集权限配置 | `web/core/dataset/api.ts:166` → 权限弹窗组件 | 数据集列表→权限配置→打开权限面板时调用 |
| `/core/dataset/resumeInheritPermission` | PUT | 恢复继承父级权限 | `web/core/dataset/api.ts:169` → `pages/dataset/list/index.tsx:339` / `pageComponents/dataset/list/NewList.tsx:664` | 数据集列表→权限配置→点击恢复继承权限时调用 |
| `/proApi/core/dataset/changeOwner` | POST | 更改数据集所有者 | `web/core/dataset/api.ts:172` → `pages/dataset/list/index.tsx:331` / `pageComponents/dataset/list/NewList.tsx:656` | 数据集列表→权限配置→更改所有者时调用 |

## 协作管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collaborator/list` | GET | 获取协作者列表 | `web/core/dataset/api/collaborator.ts` → 权限弹窗组件 | 数据集列表→权限配置→加载协作者列表时调用 |
| `/core/dataset/collaborator/update` | POST | 更新协作者配置 | `web/core/dataset/api/collaborator.ts` → `pages/dataset/list/index.tsx:350` / `pageComponents/dataset/list/NewList.tsx:676` | 数据集列表→权限配置→添加/修改协作者时调用 |
| `/core/dataset/collaborator/delete` | DELETE | 删除协作者 | `web/core/dataset/api/collaborator.ts` → `pages/dataset/list/index.tsx:353` / `pageComponents/dataset/list/NewList.tsx:678` | 数据集列表→权限配置→移除协作者时调用 |

## 导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/dataset/exportAll` | GET | 导出数据集全部数据为CSV | `web/core/dataset/api.ts:550` → `pageComponents/dataset/list/NewList.tsx:549` | 数据集列表→导出数据集→点击导出时调用 |

## 文件上传

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/common/file/getUploadAvatarPresignedUrl` | GET | 获取头像上传预签名URL | `web/common/file/api.ts` → `pages/dataset/list/index.tsx` / `pageComponents/dataset/list/NewList.tsx` | 数据集列表→创建/编辑文件夹→上传头像时调用 |

---

## API 调用链追踪

### `POST /core/dataset/list` 调用链

```
{列表页面 context}
  ├── 触发: 进入页面 / 切换文件夹 / 搜索 / 滚动加载更多
  ├── 参数: { parentId, searchKey?, pageNum?, pageSize? }
  └── 响应处理: 更新 myDatasets 状态，驱动卡片列表渲染

{文件夹树展开}
  ├── 触发: 获取子文件夹下的数据集
  ├── 参数: { parentId, searchKey? }
  └── 响应处理: 合并到 myDatasets 列表
```

### `POST /core/dataset/folder/create` 调用链

```
{页面上"新建文件夹"按钮}
  ├── 触发: 用户点击"新建文件夹"按钮 → 打开 EditFolderModal → 填写表单 → 提交
  ├── 参数: { parentId, name, intro, avatar }
  └── 响应处理: 刷新数据集列表和面包屑路径
```

### `PUT /core/dataset/update` 调用链

```
{编辑数据集}
  ├── 触发: 卡片菜单→编辑 / 顶部编辑按钮 → EditFolderModal / CreateModal → 提交修改
  ├── 参数: { id, name?, intro?, avatar?, parentId? }
  └── 响应处理: 局部更新或重新加载列表

{移动数据集}
  ├── 触发: 拖拽数据集到目标文件夹 → 确认弹窗 → 确认
  ├── 参数: { id, parentId }
  └── 响应处理: 重新加载列表
```

### `DELETE /core/dataset/delete` 调用链

```
{卡片菜单→删除}
  ├── 触发: 用户点击删除 → 确认弹窗（输入名称验证）→ 确认
  ├── 参数: { id }
  └── 响应处理: 刷新列表和面包屑路径
```

### `GET /api/core/dataset/exportAll` 调用链

```
{卡片菜单→导出}
  ├── 触发: 用户点击导出 → 检查团队导出限额 → 发起下载
  ├── 参数: { datasetId }
  └── 响应处理: 触发浏览器下载 CSV 文件
```
