# FastGPT Sitemap 支持

本项目已经添加了对 SEO 友好的 sitemap 支持，帮助搜索引擎更好地索引 FastGPT 的页面。

## 功能特性

- ✅ 动态生成 sitemap.xml
- ✅ 国际化支持 (支持 en, zh-CN, zh-Hant)
- ✅ 自动缓存优化 (24小时缓存)
- ✅ 动态 robots.txt 生成
- ✅ 可扩展的架构设计

## 访问地址

- **Sitemap**: `https://yourdomain.com/sitemap.xml`
- **Robots.txt**: `https://yourdomain.com/robots.txt`

## 支持的页面

当前 sitemap 包含以下主要页面：

1. **首页** (/) - Priority: 1.0, 更新频率: daily
2. **应用列表** (/app/list) - Priority: 0.9, 更新频率: weekly
3. **聊天页面** (/chat) - Priority: 0.9, 更新频率: daily
4. **数据集列表** (/dataset/list) - Priority: 0.8, 更新频率: weekly
5. **登录页面** (/login) - Priority: 0.7, 更新频率: monthly
6. **更多页面** (/more) - Priority: 0.6, 更新频率: monthly
7. **价格页面** (/price) - Priority: 0.6, 更新频率: monthly
8. **工具页面** (/toolkit) - Priority: 0.6, 更新频率: monthly

## 国际化支持

每个页面都包含多语言版本的链接：

```xml
<url>
  <loc>https://yourdomain.com/app/list</loc>
  <xhtml:link rel="alternate" hreflang="zh-CN" href="https://yourdomain.com/zh-CN/app/list" />
  <xhtml:link rel="alternate" hreflang="zh-Hant" href="https://yourdomain.com/zh-Hant/app/list" />
</url>
```

## 配置说明

### 环境变量

确保以下环境变量正确配置以获得最佳的 SEO 效果：

```bash
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

### 添加新页面

要向 sitemap 添加新页面，修改 `SitemapGenerator.getDefaultPages()` 方法：

```typescript
// 在 src/web/common/seo/sitemap.ts 中添加新页面
static getDefaultPages(): SitemapPage[] {
  return [
    // ... 现有页面
    {
      path: '/new-page',
      priority: '0.8',
      changefreq: 'weekly'
    }
  ];
}
```

### 自定义 Robots 规则

要自定义 robots.txt 规则，修改 `RobotsGenerator.getDefaultConfig()` 方法：

```typescript
// 在 src/web/common/seo/robots.ts 中自定义规则
static getDefaultConfig(baseUrl: string): RobotsConfig {
  return {
    userAgent: '*',
    allow: ['/'],
    disallow: [
      '/api/',
      '/admin/',
      '/account/',
      // 添加新的禁用路径
    ],
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
```

## 性能优化

- **缓存策略**: sitemap 和 robots.txt 都设置了 24 小时的浏览器缓存
- **服务端渲染**: 使用 Next.js 的 `getServerSideProps` 确保内容始终是最新的
- **压缩**: 自动启用 gzip 压缩以减少传输大小

## 测试

运行测试脚本验证 sitemap 功能：

```bash
node test-sitemap.js
```

确保开发服务器在端口 3000 上运行。

## 提交到搜索引擎

将你的 sitemap 提交给主流搜索引擎：

- **Google**: [Google Search Console](https://search.google.com/search-console)
- **Bing**: [Bing Webmaster Tools](https://www.bing.com/webmasters/)
- **百度**: [百度搜索资源平台](https://ziyuan.baidu.com/)

## 技术实现

- **Next.js Pages Router**: 使用 `pages/sitemap.xml.tsx` 和 `pages/robots.txt.tsx`
- **TypeScript**: 完全类型安全的实现
- **模块化设计**: 可重用的 sitemap 和 robots 生成器类
- **国际化**: 完整的多语言支持

## 维护说明

- sitemap 会自动检测域名和协议
- 页面更新时间会自动设置为当前时间
- 缓存头会自动设置以确保性能
- 新增页面需要在代码中手动添加