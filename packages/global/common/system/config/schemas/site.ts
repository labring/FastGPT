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
  )
});
