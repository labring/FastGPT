import { getLangMapping } from './utils';

const errorContent = {
  'zh-CN': {
    title: '语言加载错误，请刷新网站重试',
    refresh: '刷新网站',
    unknownError: '未知错误'
  },
  en: {
    title: 'Failed to load the language resources. Please refresh the page and try again.',
    refresh: 'Refresh page',
    unknownError: 'Unknown error'
  },
  'zh-Hant': {
    title: '語言載入錯誤，請重新整理網站後再試',
    refresh: '重新整理網站',
    unknownError: '未知錯誤'
  }
} as const;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error || fallback;

  try {
    return JSON.stringify(error) || fallback;
  } catch {
    return fallback;
  }
};

/**
 * 客户端语言资源加载失败时的统一错误态。
 * 该组件不依赖 i18n 和 UI Provider，确保 common namespace 加载失败时仍可正常展示。
 */
const ClientI18nErrorFallback = ({ language, error }: { language: string; error: unknown }) => {
  const content = errorContent[getLangMapping(language)];
  const errorMessage = getErrorMessage(error, content.unknownError);

  return (
    <div
      role="alert"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '240px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '24px',
        textAlign: 'center',
        color: '#5f6368'
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#1f2329' }}>{content.title}</div>
      <div
        style={{
          maxWidth: '720px',
          padding: '8px 12px',
          borderRadius: '6px',
          background: '#f5f6f7',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: 1.5,
          overflowWrap: 'anywhere'
        }}
      >
        {errorMessage}
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '7px 16px',
          border: '1px solid #3370ff',
          borderRadius: '6px',
          background: '#3370ff',
          color: '#fff',
          fontSize: '14px',
          cursor: 'pointer'
        }}
      >
        {content.refresh}
      </button>
    </div>
  );
};

export default ClientI18nErrorFallback;
