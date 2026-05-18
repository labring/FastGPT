import type { ServerResponse } from 'http';

type SandboxProxyErrorPageParams = {
  statusCode: number;
  message: string;
};

const ERROR_PAGE_TITLE = '页面暂时无法打开';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * 渲染 sandbox-proxy 自身错误页。该页面会直接展示在 App iframe 中，
 * 因此只包含可读错误信息和刷新入口，不依赖外部静态资源。
 */
export const renderSandboxProxyErrorPage = ({
  statusCode,
  message
}: SandboxProxyErrorPageParams) => {
  const escapedMessage = escapeHtml(message);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ERROR_PAGE_TITLE}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --text: #111824;
      --muted: #667085;
      --subtle: #98a2b3;
      --border: #eef1f5;
      --primary: #3370ff;
      --primary-hover-filter: brightness(120%);
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      font-family:
        Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
    }

    main {
      width: min(384px, 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    h1 {
      margin: 0;
      color: var(--text);
      font-size: 16px;
      font-weight: 600;
      line-height: 1.45;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }

    .desc {
      max-width: 360px;
      margin-top: 10px;
    }

    .message {
      width: 100%;
      margin: 20px 0 0;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fafbfc;
      text-align: left;
    }

    .message-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .message-label {
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
    }

    .status {
      flex-shrink: 0;
      color: var(--subtle);
      font-size: 11px;
      line-height: 1.4;
    }

    .message-content {
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 18px;
    }

    button {
      height: 30px;
      min-height: 30px;
      padding: 0 16px;
      border: 0;
      border-radius: 4px;
      background: var(--primary);
      color: #ffffff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow:
        0 0 1px rgba(19, 51, 107, 0.08),
        0 1px 2px rgba(19, 51, 107, 0.05);
    }

    button:hover {
      filter: var(--primary-hover-filter);
    }

    button:focus-visible {
      outline: 2px solid rgba(51, 112, 255, 0.35);
      outline-offset: 2px;
    }

    @media (max-width: 480px) {
      body {
        align-items: flex-start;
        padding-top: 88px;
      }

      main {
        width: 100%;
      }

      h1 {
        font-size: 16px;
      }

      .message {
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>${ERROR_PAGE_TITLE}</h1>
    <p class="desc">当前页面加载遇到问题。你可以先刷新页面重试，如果仍然无法打开，请稍后再试。</p>
    <div class="message" aria-label="问题说明">
      <div class="message-head">
        <div class="message-label">问题说明</div>
        <div class="status" aria-label="错误代码 ${statusCode}">${statusCode}</div>
      </div>
      <p class="message-content">${escapedMessage}</p>
    </div>
    <div class="actions">
      <button type="button" onclick="refreshPage()">刷新页面</button>
    </div>
  </main>
  <script>
    function refreshPage() {
      var hasParent = false;

      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'sandboxProxyRefreshPage' }, '*');
          hasParent = true;
        }
      } catch {}

      if (hasParent) {
        window.setTimeout(function () {
          window.location.reload();
        }, 300);
        return;
      }

      window.location.reload();
    }
  </script>
</body>
</html>`;
};

/**
 * 将 sandbox-proxy 自身捕获到的 HTTP 错误以 H5 页面形式返回，
 * 让 iframe 内展示可读错误和用户可执行的刷新操作。
 */
export const sendSandboxProxyErrorPage = (
  res: ServerResponse,
  params: SandboxProxyErrorPageParams
) => {
  res.writeHead(params.statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(renderSandboxProxyErrorPage(params));
};
