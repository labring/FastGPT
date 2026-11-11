import { getFastGPTDocsLocale, getFastGPTDocsOriginForLocale } from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

/** Expose machine-readable edition capabilities and pricing for AI agents and procurement tools. */
export function GET() {
  const locale = getFastGPTDocsLocale();
  const zhOrigin = getFastGPTDocsOriginForLocale('zh-CN');
  const enOrigin = getFastGPTDocsOriginForLocale('en');
  const canonicalUrl =
    locale === 'zh-CN'
      ? `${zhOrigin}/zh-CN/guide/version/commercial`
      : `${enOrigin}/en/guide/version/commercial`;

  const body =
    locale === 'zh-CN'
      ? `# FastGPT 版本与定价清单

> 供开发者、采购评估与 AI Agent 读取的结构化版本对比及参考价格。详细条款以官方商业版页面为准：${zhOrigin}/zh-CN/guide/version/commercial

## 1. 社区版（开源自部署）
- 价格：¥0（开源免费，遵循 FastGPT 开源协议：${zhOrigin}/zh-CN/guide/version/opensource/license）
- 部署形态：Docker Compose / Sealos / Kubernetes 自部署
- 包含能力：对话 Agent、对话 Agent V2、可视化工作流编排、知识库检索（RAG）、分享链接与 System OpenAPI、多模型接入、模型调用日志看板

## 2. 官方云服务（SaaS 全托管）
- 访问入口：中国站 https://fastgpt.cn ｜ 国际站 https://fastgpt.io
- 计费模式：团队周期套餐（免费版 / 基础版 / 高级版 / 定制版）+ 按量 AI 积分资源包
- AI 积分计费规则：LLM 按输入/输出百万 Token（M Tokens）阶梯倍率扣减；向量与重排按 M Tokens 计费；TTS 按百万字符计费；STT 按每 60 秒计费；配置团队自有模型 API Key 免收平台 AI 积分
- 包含能力：免运维托管基础设施、预置主流大模型与增强 PDF 解析、第三方知识库定时同步、网站与图片知识库、应用评测、运行日志看板、团队空间与细粒度权限
- 详细说明：${zhOrigin}/zh-CN/guide/version/cloud/intro 与 ${zhOrigin}/zh-CN/guide/version/cloud/faq

## 3. 商业版（企业级生产部署）
- 交付形态：社区版开源镜像 + \`fastgpt-pro\` 商业版镜像 + 商业授权密钥（License），支持基于开源仓库进行前后端二次开发
- 共有权益：商业化使用授权、首次生产部署联调支持、专属工单优先响应
- 企业专属能力：多租户与支付管理、SSO 单点登录、自定义版权与自定义域名、第三方渠道发布（飞书 / 企业微信 / 钉钉 / 微信公众号）、知识库文件级权限、第三方知识库定时同步、应用评测、辅助生成、全局审计日志

### 商业版订阅参考价
| 部署方案 | 资源与运维范围 | 上线周期 | 参考起始价格 |
| --- | --- | --- | --- |
| Sealos 全托管（单实例） | 8C32G 基础资源，有效期内免费升级，官方免运维服务与数据库 | 0.5 天 | ¥10,000 起/月（3 个月起订）或 ¥120,000 起/年 |
| Sealos 全托管（多节点高可用） | 32C128G 基础资源，多副本负载均衡，有效期内免费升级与免运维 | 0.5 天 | ¥22,000 起/月（3 个月起订）或 ¥264,000 起/年 |
| 企业自有服务器 / 私有云部署 | 部署于企业内网或私有云，含 6 个版本官方协助升级支持 | 14 天内 | 联系商务获取报价：https://fastgpt.cn/zh/contact?source=docs&utm_source=docs&utm_medium=referral&utm_campaign=docs_commercial&utm_content=self_hosted_pricing |

### 技术支持与定制服务费
- 定开、维护、迁移、三方接入与跨大版本远程协助升级：¥2,000 – ¥3,000 / 人 / 天

### Sealos 云底座按量资源单价参考
| 资源项 | 计费单位 | 展示单价（人民币） |
| --- | --- | --- |
| CPU | Core / 天 | 0.410993 |
| 内存 | GB / 天 | 0.207289 |
| 存储卷 | GB / 天 | 0.012563 |
| 端口 | 个 / 天 | 0.168000 |
| 网络流量 | / M | 0.000781 |
`
      : `# Pricing & Editions — FastGPT

> Machine-readable edition capabilities and reference pricing for developers, buyers, and AI agents. Canonical details: ${enOrigin}/en/guide/version/commercial

## 1. Community Edition (Open-Source Self-Hosted)
- Price: $0 / ¥0 (Open-source license: ${enOrigin}/en/guide/version/opensource/license)
- Deployment: Self-hosted via Docker Compose, Sealos, or Kubernetes
- Included features: Chat Agent, Chat Agent V2, visual Workflow orchestration, Knowledge Base RAG, share links, System OpenAPI, multi-model routing, model call logs

## 2. FastGPT Cloud (Managed SaaS)
- Regions: Global https://fastgpt.io | China https://fastgpt.cn (isolated accounts and data per region)
- Billing model: Tiered team subscriptions (Free / Basic / Pro / Custom) + pay-as-you-go AI Points packs
- AI Points metering: LLMs billed per 1M input/output tokens by model tier; Embedding & Rerank per 1M tokens; TTS per 1M characters; STT per 60 seconds; team-supplied model API keys incur zero platform AI Points
- Included features: Zero-ops managed infrastructure, built-in LLMs/Embedding/Rerank/enhanced PDF parsing, third-party dataset scheduled sync, website & image datasets, application evaluation, run log dashboard, team RBAC
- Details: ${enOrigin}/en/guide/version/cloud/intro and ${enOrigin}/en/guide/version/cloud/faq

## 3. Commercial Edition (Enterprise Production)
- Delivery model: Open-source Community Edition image + \`fastgpt-pro\` Commercial image + License key; supports custom source-code development on the Community Edition codebase
- Included with all plans: Commercial SaaS/production license, initial deployment assistance, priority support tickets
- Enterprise capabilities: Multi-tenancy & billing, SSO single sign-on, custom branding & custom domains, Lark / WeCom / DingTalk / WeChat Official Account publishing, collection-level permissions, scheduled third-party dataset sync, evaluation suite, AI-assisted workflow/Agent/Skill generation, platform audit logs

### Commercial Edition Reference Pricing
| Deployment Plan | Included Scope & Capacity | Time to Launch | Starting Price (CNY) |
| --- | --- | --- | --- |
| Sealos Fully Managed | 8C32G resources, free upgrades during license term, fully managed app & DB ops | Half day | ¥10,000/month (3-month minimum) or ¥120,000/year |
| Sealos Fully Managed (Multi-node) | 32C128G resources, multi-replica load balancing, free upgrades & managed ops | Half day | ¥22,000/month (3-month minimum) or ¥264,000/year |
| Self-Hosted (On-Premises / Private Cloud) | Runs on customer-managed servers/VPC, includes assisted upgrades for 6 releases | Within 14 days | Custom quote: https://fastgpt.cn/en/contact?source=docs&utm_source=docs&utm_medium=referral&utm_campaign=docs_commercial&utm_content=self_hosted_pricing |

### Engineering & Custom Services
- Custom workflow/Agent development, maintenance, migration, third-party integration, and assisted major upgrades: ¥2,000 – ¥3,000 per person per day

### Sealos Pay-As-You-Go Infrastructure Rates
| Resource | Unit | Reference Rate (CNY) |
| --- | --- | --- |
| CPU | Core / day | 0.410993 |
| Memory | GB / day | 0.207289 |
| Storage volume | GB / day | 0.012563 |
| Port | Port / day | 0.168000 |
| Network traffic | / M | 0.000781 |
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${canonicalUrl}>; rel="canonical"`
    }
  });
}
