
# 前端组件开发规范

FastGPT 使用 React + TypeScript + Chakra UI。

## 3.1 组件结构

**审查要点**:
- ✅ 使用函数式组件和 Hooks
- ✅ 组件使用 `React.memo` 优化性能
- ✅ Props 有明确的类型定义
- ✅ 使用 TypeScript type 而不是 interface (项目约定)

**示例**:
```typescript
import React from 'react';
import { Box, Button } from '@chakra-ui/react';

type YourComponentProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
};

export const YourComponent = React.memo(function YourComponent({
  title,
  onClick,
  disabled = false
}: YourComponentProps) {
  return (
    <Box>
      <Button onClick={onClick} isDisabled={disabled}>
        {title}
      </Button>
    </Box>
  );
});
```

## 3.2 状态管理

**审查要点**:
- ✅ 本地状态使用 `useState`
- ✅ 全局状态使用 Zustand store
- ✅ 表单状态使用 `useForm` (react-hook-form)
- ✅ 复杂状态逻辑使用 `useReducer`

## 3.3 样式规范

**审查要点**:
- ✅ 优先使用 Chakra UI props
- ✅ 响应式设计使用 Chakra UI 的断点系统
- ✅ 自定义样式放在 `styles/theme.ts`
- ✅ 避免内联样式

**示例**:
```typescript
// ❌ 不好的实践
<Box style={{ backgroundColor: 'blue', padding: '16px' }}>

// ✅ 好的实践
<Box bg="blue.500" p={4}>
```

## 3.4 国际化

**审查要点**:
- ✅ 所有用户可见文本使用 `i18nT`
- ✅ 翻译 key 使用命名空间
- ✅ 动态文本使用插值

**示例**:
```typescript
import { i18nT } from '@fastgpt/web/i18n/utils';

const message = i18nT('user:welcome', { name: userName });
```

## 3.5 性能优化

**审查要点**:
- ✅ 列表渲染使用 key
- ✅ 大列表使用虚拟化
- ✅ 避免在渲染中创建新对象/函数
- ✅ 使用 `useMemo` 缓存计算结果
- ✅ 使用 `useCallback` 缓存函数

---
