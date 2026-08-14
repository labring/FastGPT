# UTM 归因规范

`FASTGPT_HOME_DOMAIN` 只配置 origin，例如 `https://fastgpt.io` 或 `https://fastgpt.cn`，不能携带路径或查询参数。

文档内跳转 FastGPT 官网统一使用 `FastGPTLink`。组件会固定添加：

- `utm_source=docs`
- `utm_medium=referral`

页面和链接位置使用以下参数：

| 页面 | `utm_campaign` | 链接位置 | `utm_content` |
| --- | --- | --- | --- |
| 快速了解 FastGPT | `docs_getting_started` | 国际版入口 | `cloud_entry_io` |
| 快速了解 FastGPT | `docs_getting_started` | 中国大陆版入口 | `cloud_entry_cn` |
| 云服务介绍 | `docs_cloud_intro` | 国际版入口 | `cloud_entry_io` |
| 云服务介绍 | `docs_cloud_intro` | 中国大陆版入口 | `cloud_entry_cn` |
| 云服务 FAQ | `docs_cloud_faq` | 国际版登录帮助 | `login_help_io` |
| 云服务 FAQ | `docs_cloud_faq` | 中国大陆版登录帮助 | `login_help_cn` |
| 本地开发 | `docs_self_host_dev` | 文档开头产品链接 | `intro_product_link` |
| 本地开发 | `docs_self_host_dev` | 前置环境产品链接 | `prerequisites_product_link` |
| 文档导航 | `docs_navigation` | 商业咨询入口 | `business_consultation` |
| 商业版说明 | `docs_commercial` | 价格说明咨询 | `pricing_contact` |
| 商业版说明 | `docs_commercial` | 自有服务器报价咨询 | `self_hosted_pricing` |
| 商业版说明 | `docs_commercial` | 咨询问卷 | `inquiry_form` |
| 产品端企业认证 | `enterprise_auth` | 联系商务 | `contact_business` |

GitHub README 中的链接固定使用 `utm_source=github`、`utm_medium=referral`，并使用以下参数：

| 位置 | `utm_campaign` | `utm_content` |
| --- | --- | --- |
| 顶部 Logo | `github_home` | `logo` |
| Cloud Service 徽章 | `github_home` | `cloud_badge` |
| 云服务正文链接 | `github_home` | `cloud_service_link` |
| 商业版说明 | `github_home` | `commercial_consultation` |

同一页面或同一推广主题复用同一个 `utm_campaign`，使用不同的 `utm_content` 区分具体链接位置。新增页面时使用稳定、可读的小写下划线命名，避免把文案或时间写入参数。
