
#  API 路由开发规范

FastGPT 使用 Next.js API Routes,需要遵循特定的开发模式。

### 2.1 路由定义

**文件位置**: `projects/app/src/pages/api/`

**审查要点**:
- ✅ 路由文件使用命名导出,不支持默认导出
- ✅ 使用 `NextAPIRequest` 和 `NextAPIResponse` 类型
- ✅ 支持的 HTTP 方法明确 (`GET`, `POST`, `PUT`, `DELETE`)
- ✅ 返回统一的响应格式

**示例**:
```typescript
import type { NextAPIRequest, NextAPIResponse } from '@fastgpt/service/type/next';
import { APIError } from '@fastgpt/service/core/error/controller';

export default async function handler(req: NextAPIRequest, res: NextAPIResponse) {
  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // 处理逻辑...
    const result = await processData(req.body);

    res.json(result);
  } catch (error) {
    APIError(error)(req, res);
  }
}
```

### 2.2 类型合约

**文件位置**: `packages/global/openapi/`

**审查要点**:
- ✅ API 合约定义在 OpenAPI 规范文件中
- ✅ 请求参数有完整的类型定义
- ✅ 响应格式有完整的类型定义
- ✅ 错误响应有说明

### 2.3 业务逻辑

**文件位置**:
- 通用逻辑: `packages/service/`
- 项目特定逻辑: `projects/app/src/service/`

**审查要点**:
- ✅ 业务逻辑与 API 路由分离
- ✅ 服务函数有明确的类型定义
- ✅ 错误处理统一

### 2.4 权限验证

**审查要点**:
- ✅ 所有 API 路由都有权限验证 (除了公开端点)
- ✅ 使用 `parseHeaderCert` 解析认证头
- ✅ 验证用户对资源的所有权
- ✅ 敏感操作需要额外验证

**示例**:
```typescript
import { parseHeaderCert } from '@fastgpt/global/support/permission/controller';

export default async function handler(req: NextAPIRequest, res: NextAPIResponse) {
  try {
    // 解析认证头
    const { userId, teamId } = await parseHeaderCert(req);

    // 验证权限
    const resource = await Resource.findById(resourceId);
    if (!resource || resource.userId !== userId) {
      throw new Error('Permission denied');
    }

    // 继续处理...
  } catch (error) {
    APIError(error)(req, res);
  }
}
```

### 2.5 错误处理

**审查要点**:
- ✅ 使用 try-catch 包裹所有异步操作
- ✅ 使用 `APIError` 统一错误响应
- ✅ 错误信息不暴露敏感数据
- ✅ HTTP 状态码正确

---
