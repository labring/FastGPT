import { Alert } from '@/components/docs/Alert';
import { getApiReferenceNotice } from '@/lib/api-reference-notice';

/** 展示可复用的在线 API 文档提示；英文页面通过 language="en" 使用英文文案。 */
export function ApiReferenceNotice({ language = 'zh-CN' }: { language?: 'zh-CN' | 'en' }) {
  const notice = getApiReferenceNotice(language);

  return (
    <Alert icon="📖" context="info">
      <p>
        <strong>{notice.title}</strong>
        {notice.separator}
        {notice.description}
      </p>
      <ul>
        {notice.links.map(({ label, url }) => (
          <li key={url}>
            {label}
            {notice.separator}
            <a href={url}>System OpenAPI</a>
          </li>
        ))}
        <li>
          {notice.selfHosted}
          {notice.separator}
          <code>{notice.selfHostedPath}</code>
        </li>
      </ul>
    </Alert>
  );
}
