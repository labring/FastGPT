import { getFastGPTDocsLocale, getProductionDocsUrl } from '@/lib/fastgpt-home-url';
import { buildSingleDocMarkdown, getSingleDocCanonicalUrl } from '@/lib/llms-markdown';

export const dynamic = 'force-static';

const COMMERCIAL_SLUG = ['guide', 'version', 'commercial'];

/** Expose machine-readable edition capabilities and pricing for AI agents and procurement tools. */
export async function GET() {
  const locale = getFastGPTDocsLocale();
  const canonicalUrl = getSingleDocCanonicalUrl(locale, COMMERCIAL_SLUG);
  const commercialMarkdown = await buildSingleDocMarkdown({
    lang: locale,
    slugParts: COMMERCIAL_SLUG
  });
  if (commercialMarkdown === null) {
    return new Response('Not found', { status: 404 });
  }

  const licenseUrl = getProductionDocsUrl(locale, '/guide/version/opensource/license');
  const cloudIntroUrl = getProductionDocsUrl(locale, '/guide/version/cloud/intro');
  const cloudFaqUrl = getProductionDocsUrl(locale, '/guide/version/cloud/faq');

  const editionOverview =
    locale === 'zh-CN'
      ? `## 社区版与官方云服务概览

- **社区版（开源自部署）**：开源免费（${licenseUrl}），支持 Docker Compose / Sealos / Kubernetes 部署。
- **官方云服务（SaaS 全托管）**：中国站 https://fastgpt.cn ｜ 国际站 https://fastgpt.io；按团队周期套餐与 AI 积分资源包计费（语言、向量与重排模型按每百万 Token 计价，TTS 按每百万字符计价，STT 按每 60 秒计价；详见 ${cloudIntroUrl} 与 ${cloudFaqUrl}）。

### 官方云服务套餐标准（CNY ¥）

| 套餐版本 | 价格（CNY） | AI 积分 | 知识库索引组容量 | 团队成员 | Agent 数量 | 知识库数量 | 对话记录保留 | 并发 QPM | 核心增值能力 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 免费版（Free） | ¥0 | 100 / 月 | 600 组 | 1 人 | 10 个 | 3 个 | 30 天 | 30 | 基础工作流、API 与分享链接 |
| 基础版（Basic） | ¥99 / 月 或 ¥990 / 年 | 4,000 / 月（48,000 / 年） | 6,000 组 | 5 人 | 50 个 | 30 个 | 180 天 | 300 | 站点同步（单次上限 500 页）、48 小时工单响应 |
| 高级版（Advanced） | ¥599 / 月 或 ¥5,990 / 年 | 25,000 / 月（300,000 / 年） | 36,000 组 | 50 人 | 200 个 | 100 个 | 360 天 | 1,500 | 站点同步（单次上限 2,000 页）、720 天团队操作审计、24 小时工单响应 |
| 定制版（Custom） | 企业按需询价 | 弹性扩容 | 弹性扩容 | 弹性扩容 | 弹性扩容 | 弹性扩容 | 按需定制 | 弹性扩容 | 专属客户成功经理与最高优先级技术支持 |`
      : `## Community Edition & FastGPT Cloud Overview

- **Community Edition (Open-Source Self-Hosted)**: Free under the FastGPT open-source license (${licenseUrl}), deployable via Docker Compose, Sealos, or Kubernetes.
- **FastGPT Cloud (Managed SaaS)**: Global https://fastgpt.io | China https://fastgpt.cn; billed via team subscriptions and AI Points packs (language, embedding, and rerank models per 1M tokens, TTS per 1M characters, STT per 60 seconds; see ${cloudIntroUrl} and ${cloudFaqUrl}).

### FastGPT Cloud Subscription Tiers (CNY ¥)

| Tier | Price (CNY) | AI Points | Dataset Index Groups | Team Members | Max Agents | Max Datasets | Chat Log Retention | Rate Limit (QPM) | Key Capabilities |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Free | CNY ¥0 | 100 / month | 600 | 1 | 10 | 3 | 30 days | 30 | Core workflow builder, API & share links |
| Basic | CNY ¥99 / month or CNY ¥990 / year | 4,000 / month (48,000 / year) | 6,000 | 5 | 50 | 30 | 180 days | 300 | Website Sync (up to 500 pages), 48-hour ticket response |
| Advanced | CNY ¥599 / month or CNY ¥5,990 / year | 25,000 / month (300,000 / year) | 36,000 | 50 | 200 | 100 | 360 days | 1,500 | Website Sync (up to 2,000 pages), 720-day team audit logs, 24-hour ticket response |
| Custom | Custom enterprise quote | Elastic | Elastic | Elastic | Elastic | Elastic | Custom | Elastic | Priority engineering support & dedicated account manager |`;

  const body = `${commercialMarkdown.trimEnd()}

${editionOverview}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Language': locale,
      Link: `<${canonicalUrl}>; rel="canonical"`
    }
  });
}
