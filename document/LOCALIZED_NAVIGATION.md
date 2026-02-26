# 国际化路由适配说明

## 问题
路由跳转时语言前缀丢失，导致用户在切换页面后回到默认语言。

## 解决方案

### 1. 核心配置
- **`lib/i18n.ts`**: 设置 `hideLocale: 'never'`，确保所有语言（包括默认语言）都显示语言前缀
- **`lib/localized-navigation.ts`**: 提供客户端路由工具，自动处理语言前缀

### 2. 修复的路由跳转位置

#### ✅ 一级导航（Tab Navigation）
- **文件**: `app/[lang]/docs/layout.tsx`
- **方法**: 使用 `getLocalizedPath()` 为每个 tab 的 URL 添加语言前缀
- **状态**: 已完成

#### ✅ 二级导航（Sidebar）
- **文件**: `lib/source.ts`
- **方法**: Fumadocs 的 loader 自动根据 i18n 配置生成带语言前缀的链接
- **状态**: 已完成（无需修改）

#### ✅ 空页面重定向
- **文件**: 
  - `app/[lang]/(home)/page.tsx` - 首页重定向
  - `app/[lang]/(home)/[...not-found]/page.tsx` - 404 重定向
- **方法**: 使用 `getLocalizedPath()` 添加语言前缀
- **状态**: 已完成

#### ✅ MDX 组件重定向
- **文件**: `components/docs/Redirect.tsx`
- **方法**: 使用 `useLocalizedRouter()` hook
- **状态**: 已完成

#### ✅ 旧页面重定向
- **文件**: `components/docs/not-found.tsx`
- **方法**: 
  - 使用 `useCurrentLang()` 获取当前语言
  - 从 pathname 中移除语言前缀进行匹配
  - 使用 `useLocalizedPath()` 为重定向目标添加语言前缀
- **状态**: 已完成

#### ✅ 文档内链接
- **文件**: 
  - `components/docs/LocalizedLink.tsx` - 自定义 Link 组件
  - `mdx-components.tsx` - 配置 MDX 使用 LocalizedLink
- **方法**: 拦截 MDX 中的 `<a>` 标签，自动为内部链接添加语言前缀
- **状态**: 已完成

### 3. 语言选择器
- **文件**: `app/layout.config.tsx`
- **配置**: 
  ```typescript
  i18n: {
    locale,
    languages: [
      { name: '简体中文', locale: 'zh-CN' },
      { name: 'English', locale: 'en' }
    ],
    hideLocale: 'never'
  }
  ```
- **状态**: 已完成

## 使用方法

### 客户端组件
```tsx
'use client';
import { useLocalizedRouter } from '@/lib/localized-navigation';

function MyComponent() {
  const router = useLocalizedRouter();
  router.push('/docs/introduction'); // 自动添加语言前缀
}
```

### 服务端组件
```tsx
import { getLocalizedPath } from '@/lib/i18n';
import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(getLocalizedPath('/docs/intro', lang));
}
```

### MDX 文档
```mdx
<!-- 内部链接会自动添加语言前缀 -->
[查看介绍](/docs/introduction)

<!-- 或使用 Redirect 组件 -->
<Redirect to="/docs/faq" />
```

## 测试清单
- [ ] 一级导航切换保持语言
- [ ] 侧边栏导航保持语言
- [ ] 首页重定向保持语言
- [ ] 404 页面重定向保持语言
- [ ] 旧链接重定向保持语言
- [ ] 文档内链接保持语言
- [ ] 语言选择器正常工作
- [ ] 搜索结果链接保持语言
