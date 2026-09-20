/**
 * License 未激活时仍可访问的管理员路由白名单。
 *
 * 仅作用于管理员区域（/admin/*）：白名单之外的 /admin/* 会重定向回管理员主页引导激活；
 * /admin 之外的业务路由（工作台、知识库、对话等）属于开源版本体，不受 License 状态限制。
 *
 * 保留这几个入口的原因：未激活（开源版 / 未续费）部署仍需完成基础可运维配置，
 * 且这些页面的数据来自 app 自身接口，不经过 pro/admin 的 licenseCheck 拦截：
 * - /admin/home：管理员主页，License 激活入口
 * - /admin/config/modelProvider：模型提供商，未配置模型时对话与知识库不可用
 * - /admin/config/plugin：系统工具，插件与工具接入配置
 * - /admin/config/migration：版本升级，跑的是 app 自带的迁移脚本（projects/app/src/migration），
 *   与商业授权无关；迁移未完成时数据处于中间态，不允许被 License 状态挡住
 */
export const unlicensedAdminRoutes = [
  '/admin/home',
  '/admin/config/modelProvider',
  '/admin/config/plugin',
  '/admin/config/migration'
];

/**
 * 商业版介绍文档地址。
 *
 * 用绝对地址而非 getDocPath('/guide/version/commercial')：该路径由各部署的 docUrl 决定
 *（上游默认 https://doc.fastgpt.io），会随配置漂移到不同域名/语言，而这里需要始终指向官方商业版说明。
 */
export const commercialDocUrl = 'https://doc.fastgpt.cn/zh-CN/guide/version/commercial';
