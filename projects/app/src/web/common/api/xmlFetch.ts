import { getToken } from '@/web/support/user/auth';
import { hasHttps } from '@fastgpt/web/common/system/utils';

export const xmlDownloadFetch = async ({ url, filename }: { url: string; filename: string }) => {
  if (hasHttps()) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    const response = await fetch(url, {
      headers: {
        token: `${getToken()}`
      }
    });
    if (!response.ok) throw new Error('Network response was not ok.');

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none'; // 隐藏<a>元素
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click(); // 模拟用户点击
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl); // 清理生成的URL
  }
};
