import z from 'zod';
import { textWithDefault, urlWithDefault } from './primitives';

const NavbarItemConfigSchema = z.strictObject({
  id: z.string().max(100),
  name: z.string().max(100),
  avatar: textWithDefault(),
  url: textWithDefault(),
  isActive: z.boolean().default(true)
});

export type NavbarItemConfigType = z.infer<typeof NavbarItemConfigSchema>;

export const SiteConfigSchema = z.strictObject({
  name: z.string().min(1).max(100).default('AI'),
  description: z.string().max(1000).default(''),
  favicon: textWithDefault(),
  marketplaceUrl: urlWithDefault('https://v2.marketplace.fastgpt.cn'),
  docUrl: urlWithDefault('https://doc.fastgpt.io'),
  openApiDocUrl: urlWithDefault('https://doc.fastgpt.io/openapi/intro'),
  // OpenAPI 前缀：用于生成 API Key 的可读前缀
  openApiPrefix: z.string().max(100).default('fastgpt'),
  // 联系/社区弹窗展示的 Markdown 内容
  concatMd: z
    .string()
    .max(10000)
    .default(
      '项目开源地址: [FastGPT GitHub](https://github.com/labring/FastGPT)\n交流群: ![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png)'
    ),
  // 自定义导航栏链接项（头像由 S3 托管）
  navbarItems: z.array(NavbarItemConfigSchema).max(20).default([]),
  // 应用模板使用教程外链
  appTemplateCourse: urlWithDefault(
    'https://fael3z0zfze.feishu.cn/wiki/CX9wwMGyEi5TL6koiLYcg7U0nWb?fromScene=spaceOverview'
  ),
  // 登录引导帮助文档外链
  loginGuideDocUrl: urlWithDefault(
    'https://doc.fastgpt.io/zh-CN/guide/version/cloud/faq#%E8%B4%A6%E5%8F%B7%E7%99%BB%E5%BD%95%E9%97%AE%E9%A2%98'
  ),
  // 自定义对外 API 域名（若未配置回退到环境变量 CUSTOM_API_DOMAIN）
  customApiDomain: urlWithDefault(),
  // 自定义免登分享页面独立域名（若未配置回退到环境变量 CUSTOM_SHARE_PAGE_DOMAIN）
  customSharePageDomain: urlWithDefault(),
  // 前端注入的外部第三方脚本列表（键值对表示属性，如 src/async）
  scripts: z.array(z.record(z.string(), z.string())).default([])
});
