import z from 'zod';
import { textWithDefault, urlWithDefault } from './primitives';
import { isValidServiceBaseUrl, stripUrlTrailingSlash } from '../../../string/url';

/** 管理端保存主站域名时要求完整 HTTP(S) 地址，禁止凭据、查询参数和片段。 */
export const SitePublicUrlSchema = z
  .string()
  .trim()
  .refine(isValidServiceBaseUrl, { message: 'Expected a valid HTTP(S) public site URL' })
  .transform(stripUrlTrailingSlash);

const NavbarItemConfigSchema = z.strictObject({
  id: z.string().max(100),
  name: z.string().max(100),
  avatar: textWithDefault(),
  url: textWithDefault(),
  isActive: z.boolean().default(true)
});

export type NavbarItemConfigType = z.infer<typeof NavbarItemConfigSchema>;

export const SiteConfigSchema = z.strictObject({
  // 未配置时不猜测部署域名，浏览器内可使用相对路径；管理表单保存时必须填写。
  publicUrl: z.union([z.literal(''), SitePublicUrlSchema]).default(''),
  name: z.string().min(1).max(100).default('AI'),
  description: z.string().max(1000).default(''),
  favicon: textWithDefault(),
  docUrl: urlWithDefault('https://doc.fastgpt.io'),
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
  // 自定义对外 API 域名（运行期以实例配置为准）
  customApiDomain: urlWithDefault(),
  // 自定义免登分享页面独立域名（运行期以实例配置为准）
  customSharePageDomain: urlWithDefault(),
  // 客服助手 iframe 地址
  botIframeUrl: textWithDefault(),
  // SaaS 自定义独立域名：域名是 CNAME 主机名，不要求带协议
  customDomain: z
    .strictObject({
      enable: z.boolean().default(false),
      domain: z
        .strictObject({
          aliyun: textWithDefault(),
          tencent: textWithDefault(),
          volcengine: textWithDefault()
        })
        .prefault({}),
      // 服务端部署参数不下发普通 feConfigs；kubeconfig 在管理 API 中按敏感字段脱敏。
      kc: z
        .strictObject({
          aliyun: textWithDefault(),
          tencent: textWithDefault(),
          volcengine: textWithDefault()
        })
        .prefault({}),
      issuerServiceName: z
        .strictObject({
          aliyun: textWithDefault(),
          tencent: textWithDefault(),
          volcengine: textWithDefault()
        })
        .prefault({}),
      nginxServiceName: z
        .strictObject({
          aliyun: textWithDefault(),
          tencent: textWithDefault(),
          volcengine: textWithDefault()
        })
        .prefault({})
    })
    .prefault({}),
  // 前端注入的外部第三方脚本列表（键值对表示属性，如 src/async）
  scripts: z.array(z.record(z.string(), z.string())).default([])
});
