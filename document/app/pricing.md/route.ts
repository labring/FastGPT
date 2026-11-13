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
- **官方云服务（SaaS 全托管）**：中国站 https://fastgpt.cn ｜ 国际站 https://fastgpt.io；按团队周期套餐与 AI 积分资源包计费（语言、向量与重排模型按每百万 Token 计价，TTS 按每百万字符计价，STT 按每 60 秒计价；详见 ${cloudIntroUrl} 与 ${cloudFaqUrl}）。`
      : `## Community Edition & FastGPT Cloud Overview

- **Community Edition (Open-Source Self-Hosted)**: Free under the FastGPT open-source license (${licenseUrl}), deployable via Docker Compose, Sealos, or Kubernetes.\n- **FastGPT Cloud (Managed SaaS)**: Global https://fastgpt.io | China https://fastgpt.cn; billed via team subscriptions and AI Points packs (language, embedding, and rerank models per 1M tokens, TTS per 1M characters, STT per 60 seconds; see ${cloudIntroUrl} and ${cloudFaqUrl}).`;

  const body = `${commercialMarkdown.trimEnd()}

${editionOverview}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${canonicalUrl}>; rel="canonical"`
    }
  });
}
