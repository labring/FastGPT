/**
 * file download by text
 */
export const fileDownload = ({
  text,
  type,
  filename
}: {
  text: string;
  type: string;
  filename: string;
}) => {
  // 导出为文件
  const blob = new Blob([`\uFEFF${text}`], { type: `${type};charset=utf-8;` });

  // 创建下载链接
  const downloadLink = document.createElement('a');
  downloadLink.href = window.URL.createObjectURL(blob);
  downloadLink.download = filename;

  // 添加链接到页面并触发下载
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body?.removeChild(downloadLink);
};

export const fileToBase64 = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};
