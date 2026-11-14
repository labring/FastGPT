/** 网页提示与 Markdown 导出共用同一份在线 API 文档文案和地址，默认使用中文。 */
export function getApiReferenceNotice(language = 'zh-CN') {
  const labels =
    language === 'en'
      ? {
          title: 'Online API Reference',
          description:
            'Always refer to the latest online API documentation for complete request/response schemas and endpoint availability:',
          china: 'Mainland China Cloud',
          international: 'International Cloud',
          selfHosted: 'Self-Hosted Instance'
        }
      : {
          title: '在线 API 文档',
          description: '接口完整入参、出参 Schema 及开放范围以最新在线 API 文档说明为准：',
          china: '中国大陆云服务',
          international: '国际云服务',
          selfHosted: '私有化自部署'
        };

  return {
    ...labels,
    separator: language === 'en' ? ': ' : '：',
    links: [
      { label: labels.china, url: 'https://cloud.fastgpt.cn/apidoc/systemopenapi' },
      { label: labels.international, url: 'https://cloud.fastgpt.io/apidoc/systemopenapi' }
    ],
    selfHostedPath: '<instance>/apidoc/systemopenapi'
  };
}
