# FastGPT Document SEO 配置审计报告

## 审计时间
2026-03-03

## 一、已完成的 SEO 配置 ✅

### 1. 基础 SEO 元素
- ✅ **robots.txt**: 已配置，支持国内外不同策略
  - 国际版：禁止 bingbot，允许其他爬虫
  - 国内版：禁止 Googlebot，允许其他爬虫
  - 包含 Sitemap 引用（但路径有问题，见下文）

- ✅ **sitemap.xml**: 已配置并包含真实的文档更新时间
  - 使用 `doc-last-modified.json` 获取真实更新时间
  - 包含所有文档页面的 URL
  - 符合 XML sitemap 标准格式

- ✅ **Favicon**: 完整的 favicon 配置
  - favicon.ico
  - favicon.svg
  - apple-touch-icon.png
  - android-chrome (192x192, 256x256, 512x512)
  - site.webmanifest (PWA 支持)

### 2. 页面级 SEO
- ✅ **动态 Metadata**: 每个文档页面都有独立的 title 和 description
  - 格式：`{page.data.title} | FastGPT`
  - 包含页面描述

- ✅ **语言标签**: HTML lang 属性正确设置
  - 支持 `zh-CN` 和 `en`
  - 根据路由动态切换

- ✅ **最后更新时间**: 页面显示真实的文档更新时间
  - 使用 Git 提交时间
  - 有助于搜索引擎判断内容新鲜度

### 3. 技术 SEO
- ✅ **静态生成**: 使用 `force-static` 确保 SEO 友好
- ✅ **压缩**: Next.js 配置中启用了 `compress: true`
- ✅ **图片优化**: 配置了远程图片域名白名单
- ✅ **响应式设计**: 使用 Tailwind CSS 确保移动端友好

### 4. 内容 SEO
- ✅ **结构化内容**: 使用 MDX 提供良好的内容结构
- ✅ **内部链接**: 文档之间有良好的内部链接
- ✅ **面包屑导航**: DocsLayout 提供导航结构
- ✅ **目录**: 每个页面都有 TOC (Table of Contents)

## 二、需要改进的 SEO 配置 ⚠️

### 1. 关键问题

#### 🔴 高优先级

**1.1 Sitemap 路径不匹配**
- **问题**: robots.txt 引用 `sitemap-base.xml`，但实际路径是 `sitemap.xml`
- **影响**: 搜索引擎无法找到 sitemap
- **修复**:
  ```typescript
  // document/app/robots.txt/route.ts
  // 将 sitemap-base.xml 改为 sitemap.xml
  Sitemap: ${domain}/sitemap.xml
  ```

**1.2 缺少根级别 Metadata**
- **问题**: 没有在根 layout 中配置全局 metadata
- **影响**: 首页和非文档页面缺少 SEO 元数据
- **建议**: 在 `document/app/[lang]/layout.tsx` 添加：
  ```typescript
  export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    return {
      title: {
        default: 'FastGPT Documentation',
        template: '%s | FastGPT'
      },
      description: 'FastGPT is an AI Agent building platform...',
      keywords: ['FastGPT', 'AI', 'Agent', 'LLM', 'Documentation'],
      authors: [{ name: 'Labring' }],
      creator: 'Labring',
      publisher: 'Labring',
      metadataBase: new URL(process.env.FASTGPT_HOME_DOMAIN ?? 'https://fastgpt.io'),
      alternates: {
        canonical: '/',
        languages: {
          'en': '/en',
          'zh-CN': '/zh-CN'
        }
      },
      openGraph: {
        type: 'website',
        locale: lang,
        url: '/',
        title: 'FastGPT Documentation',
        description: 'FastGPT is an AI Agent building platform...',
        siteName: 'FastGPT',
        images: [
          {
            url: '/og-image.png',
            width: 1200,
            height: 630,
            alt: 'FastGPT'
          }
        ]
      },
      twitter: {
        card: 'summary_large_image',
        title: 'FastGPT Documentation',
        description: 'FastGPT is an AI Agent building platform...',
        images: ['/twitter-image.png']
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-video-preview': -1,
          'max-image-preview': 'large',
          'max-snippet': -1
        }
      },
      icons: {
        icon: [
          { url: '/favicon/favicon.ico' },
          { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
          { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' }
        ],
        apple: [
          { url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      },
      manifest: '/favicon/site.webmanifest'
    };
  }
  ```

**1.3 缺少 Open Graph 图片**
- **问题**: 没有配置社交媒体分享图片
- **影响**: 在社交媒体分享时无法显示预览图
- **建议**: 创建 1200x630 的 OG 图片
  - `/document/app/opengraph-image.png` (或 .jpg)
  - `/document/app/twitter-image.png` (或 .jpg)

#### 🟡 中优先级

**2.1 缺少结构化数据 (Schema.org)**
- **问题**: 没有添加 JSON-LD 结构化数据
- **影响**: 搜索引擎无法更好地理解内容类型
- **建议**: 添加 BreadcrumbList、Article、Organization 等结构化数据

**2.2 缺少 Canonical URL**
- **问题**: 文档页面没有明确的 canonical URL
- **影响**: 可能导致重复内容问题（中英文版本）
- **建议**: 在 generateMetadata 中添加 canonical URL

**2.3 缺少 hreflang 标签**
- **问题**: 没有配置多语言页面的 hreflang 标签
- **影响**: 搜索引擎可能无法正确识别语言版本关系
- **建议**: 在 metadata 中添加 alternates.languages

**2.4 Web Manifest 路径问题**
- **问题**: site.webmanifest 中的图标路径缺少 /favicon/ 前缀
- **影响**: PWA 安装时可能找不到图标
- **修复**:
  ```json
  {
    "icons": [
      {
        "src": "/favicon/android-chrome-192x192.png",
        "sizes": "192x192",
        "type": "image/png"
      },
      {
        "src": "/favicon/android-chrome-512x512.png",
        "sizes": "512x512",
        "type": "image/png"
      }
    ]
  }
  ```

#### 🟢 低优先级

**3.1 缺少 RSS Feed**
- **建议**: 为文档更新提供 RSS/Atom feed

**3.2 缺少 humans.txt**
- **建议**: 添加 humans.txt 说明团队信息

**3.3 性能优化**
- **建议**:
  - 添加 preconnect/dns-prefetch 提示
  - 配置 CSP (Content Security Policy)
  - 添加 security headers

## 三、SEO 最佳实践建议

### 1. 内容优化
- ✅ 确保每个页面都有唯一的 title 和 description
- ⚠️ 建议 description 长度控制在 150-160 字符
- ⚠️ 建议 title 长度控制在 50-60 字符

### 2. 技术优化
- ✅ 使用语义化 HTML 标签
- ✅ 确保移动端友好
- ⚠️ 建议添加 preload 关键资源
- ⚠️ 建议优化 Core Web Vitals

### 3. 链接优化
- ✅ 内部链接结构良好
- ⚠️ 建议添加外部链接的 rel="noopener noreferrer"
- ⚠️ 建议检查是否有死链

### 4. 国际化 SEO
- ✅ 支持多语言
- ⚠️ 需要添加 hreflang 标签
- ⚠️ 需要为不同语言版本设置独立的 canonical URL

## 四、立即行动项

### 必须修复（影响 SEO 功能）
1. 修复 robots.txt 中的 sitemap 路径
2. 添加根级别 metadata 配置
3. 修复 site.webmanifest 中的图标路径

### 建议添加（提升 SEO 效果）
1. 创建 Open Graph 和 Twitter 分享图片
2. 添加结构化数据 (JSON-LD)
3. 配置 hreflang 和 canonical URL
4. 为每个文档页面添加更详细的 metadata

### 可选优化（长期改进）
1. 添加 RSS feed
2. 优化 Core Web Vitals
3. 添加安全 headers
4. 实施内容 CDN 加速

## 五、SEO 配置完整度评分

| 类别 | 完成度 | 评分 |
|------|--------|------|
| 基础配置 | 80% | 🟢 良好 |
| 页面 SEO | 70% | 🟡 中等 |
| 技术 SEO | 75% | 🟢 良好 |
| 社交媒体 | 30% | 🔴 需改进 |
| 国际化 | 60% | 🟡 中等 |
| **总体评分** | **63%** | 🟡 **中等** |

## 六、总结

FastGPT 文档站点的 SEO 基础配置较为完善，特别是在基础 SEO 元素和技术 SEO 方面做得不错。主要需要改进的是：

1. **立即修复**: robots.txt 的 sitemap 路径错误
2. **重点补充**: 根级别 metadata、Open Graph 图片、结构化数据
3. **持续优化**: 国际化 SEO、性能优化、内容质量

建议优先处理"必须修复"项，然后逐步完善"建议添加"项，以达到更好的 SEO 效果。
