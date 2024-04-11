import { getToken } from '@/web/support/user/auth';

export const xmlDownloadFetch = ({ url, filename }: { url: string; filename: string }) => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.setRequestHeader('token', getToken());
  xhr.responseType = 'blob';
  xhr.onload = function (e) {
    if (this.status == 200) {
      const blob = this.response;
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };
  xhr.send();
};
