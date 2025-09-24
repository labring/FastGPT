# ResponseTags 组件增强 - 链接处理功能

## 功能描述

在 ResponseTags 组件中实现了智能链接处理功能，当用户点击工具引用的链接时，系统会：

1. **提取URL参数**: 从链接中提取 `corpId`、`traceId`、`mediaId` 参数
2. **API调用**: 调用 `/v2/open/api/onpremise/memo/getOneTimeToken` 获取一次性访问token
3. **智能跳转**: 根据API响应结果跳转到正确的URL
4. **错误处理**: 提供完善的错误提示和回退机制

## 实现细节

### 1. URL参数提取函数
```typescript
const extractUrlParams = (url: string) => {
  try {
    const urlObj = new URL(url);
    const corpId = urlObj.searchParams.get('corpId');
    const traceId = urlObj.searchParams.get('traceId');
    const mediaId = urlObj.searchParams.get('mediaId');
    
    return { corpId, traceId, mediaId };
  } catch (error) {
    console.error('Failed to parse URL:', error);
    return { corpId: null, traceId: null, mediaId: null };
  }
};
```

### 2. API调用函数
```typescript
// 静态配置变量
const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080',
  sysAccessKey: process.env.NEXT_PUBLIC_SYS_ACCESS_KEY || '',
  appId: process.env.NEXT_PUBLIC_APP_ID || '',
  appAccessKey: process.env.NEXT_PUBLIC_APP_ACCESS_KEY || ''
};

const getOneTimeToken = async (params: {
  corpId: string;
  traceId: string;
  mediaId: string;
}) => {
  // 构建请求参数，包含静态配置
  const queryParams = new URLSearchParams({
    sysAccessKey: API_CONFIG.sysAccessKey,
    corpId: params.corpId,
    appId: API_CONFIG.appId,
    appAccessKey: API_CONFIG.appAccessKey,
    mediaId: params.mediaId,
    traceId: params.traceId
  });

  const apiUrl = `${API_CONFIG.baseUrl}/v2/open/api/onpremise/memo/getOneTimeToken?${queryParams}`;
  
  // 发送GET请求到API端点
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // 返回JSON响应
  return await response.json();
};
```

### 3. 链接点击处理
- 参数验证：检查必需的URL参数是否存在
- 配置验证：确保系统配置参数已设置
- API调用：获取一次性token
- 响应处理：根据success字段决定跳转或显示错误
- 错误回退：API失败时直接打开原始URL

## 环境变量配置

需要在 `.env` 文件中配置以下环境变量：

```env
# API基础配置
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_SYS_ACCESS_KEY=your_system_access_key
NEXT_PUBLIC_APP_ID=your_app_id
NEXT_PUBLIC_APP_ACCESS_KEY=your_app_access_key
```

### 配置说明
- `NEXT_PUBLIC_API_BASE_URL`: API服务器的基础URL，默认为 `http://localhost:8080`
- `NEXT_PUBLIC_SYS_ACCESS_KEY`: 系统访问密钥，用于身份验证（可选）
- `NEXT_PUBLIC_APP_ID`: 应用ID，用于识别具体应用（必须）
- `NEXT_PUBLIC_APP_ACCESS_KEY`: 应用访问密钥，用于身份验证（必须）

## 错误处理

系统提供了完善的错误处理机制：

### 1. 参数验证错误
- **URL参数缺失**: 当URL中缺少必需参数（corpId、traceId、mediaId）时，显示参数错误提示
- **配置参数缺失**: 当环境变量未配置时，显示配置错误提示

### 2. API错误码处理
根据接口文档，系统会处理以下特定错误码：

| 错误码 | 错误描述 | 用户提示 |
|--------|----------|----------|
| 1010201001 | incorrect corpId | 企业ID不正确，请检查corpId参数 |
| 1010201002 | incorrect sysAccessKey | 系统访问密钥不正确，请检查配置 |
| 1010201004 | incorrect appId | 应用ID不正确，请检查appId配置 |
| 1010201005 | incorrect app key | 应用访问密钥不正确，请检查appAccessKey配置 |

### 3. 网络错误处理
- **网络请求失败**: 当网络请求失败时，显示网络错误提示并回退到原始URL
- **HTTP状态错误**: 当API返回非200状态码时，抛出HTTP错误

## 用户体验优化

- 使用 Chakra UI 的 Toast 组件提供用户友好的错误提示
- 实现了优雅的错误回退机制
- 保持了原有的链接功能作为备选方案

## 技术特点

- 使用 React Hooks (useCallback) 优化性能
- 完善的 TypeScript 类型定义
- 符合 React 最佳实践的依赖管理
- 无 linter 错误，代码质量高

## 测试建议

1. 测试正常流程：包含完整参数的URL
2. 测试参数缺失：URL中缺少部分参数
3. 测试配置缺失：未设置环境变量
4. 测试API失败：模拟API返回错误
5. 测试网络失败：模拟网络连接问题
