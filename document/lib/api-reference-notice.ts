/** 网页提示与 Markdown 导出共用同一份在线 API 文档文案和地址，默认使用中文。 */
export function getApiReferenceNotice(language = 'zh-CN') {
  const isEn = language === 'en';
  const labels = isEn
    ? {
        title: 'Online API Reference',
        description:
          'Refer to the official API reference and deployment interactive pages for complete request/response schemas and endpoint availability:',
        officialChina: 'Official API Reference (China)',
        officialInternational: 'Official API Reference (Global)',
        china: 'Mainland China Cloud (Try it out)',
        international: 'International Cloud (Try it out)',
        selfHosted: 'Self-Hosted Instance (Try it out)'
      }
    : {
        title: '在线 API 文档',
        description:
          '接口完整入参、出参 Schema 及开放范围以官方 API 参考文档与对应实例在线调试页面为准：',
        officialChina: '官方 API 参考（中国大陆站）',
        officialInternational: '官方 API 参考（国际站）',
        china: '中国大陆云服务（在线调试）',
        international: '国际云服务（在线调试）',
        selfHosted: '私有化自部署（在线调试）'
      };

  return {
    ...labels,
    separator: isEn ? ': ' : '：',
    links: isEn
      ? [
          {
            label: labels.officialInternational,
            url: 'https://doc.fastgpt.io/openapi/api-reference'
          },
          {
            label: labels.officialChina,
            url: 'https://doc.fastgpt.cn/openapi/api-reference'
          },
          {
            label: labels.international,
            url: 'https://cloud.fastgpt.io/apidoc/systemopenapi'
          },
          {
            label: labels.china,
            url: 'https://cloud.fastgpt.cn/apidoc/systemopenapi'
          }
        ]
      : [
          {
            label: labels.officialChina,
            url: 'https://doc.fastgpt.cn/openapi/api-reference'
          },
          {
            label: labels.officialInternational,
            url: 'https://doc.fastgpt.io/openapi/api-reference'
          },
          {
            label: labels.china,
            url: 'https://cloud.fastgpt.cn/apidoc/systemopenapi'
          },
          {
            label: labels.international,
            url: 'https://cloud.fastgpt.io/apidoc/systemopenapi'
          }
        ],
    selfHostedPath: '<instance>/apidoc/systemopenapi'
  };
}
