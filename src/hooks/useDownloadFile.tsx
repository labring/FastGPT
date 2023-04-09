import React, { useRef, useCallback } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { getExportDataList } from '@/api/model';
import { useMutation } from '@tanstack/react-query';
type FileSuffix = 'csv' | 'json';
const fileMap = {
  csv: {
    suffix: 'csv',
    fileType: 'text/csv'
  },
  json: {
    suffix: 'json',
    fileType: 'application/json'
  }
};
export const useDownloadFile = ({
  fileSuffix,
  fetchDataList,
  progressData = undefined
}: {
  fileSuffix: FileSuffix;
  fetchDataList: () => any;
  progressData?: undefined | (() => any);
}) => {
  // 导出为文件
  const exportFile = useCallback(
    (data) => {
      const blob = new Blob([data], {
        type: `${fileMap[fileSuffix].fileType};charset=utf-8`
      });

      // 创建下载链接
      const downloadLink = document.createElement('a');
      downloadLink.href = window.URL.createObjectURL(blob);
      downloadLink.download = `data.${fileMap[fileSuffix].suffix}`;

      // 添加链接到页面并触发下载
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    },
    [fileSuffix]
  );
  // 异步获取所有的数据，并导出
  const { mutate: onclickExport, isLoading: isLoadingExport } = useMutation({
    mutationFn: fetchDataList,
    onSuccess(res) {
      let data = JSON.parse(res);
      console.log(res, 'rse');
      if (progressData) {
        data = progressData(data);
      }
      exportFile(data);
    }
  });
  const DownloadButton = useCallback(
    ({ text }: { text: string }) => (
      <Button
        variant={'outline'}
        mr={2}
        size={'sm'}
        isLoading={isLoadingExport}
        title={'v2.3之前版本的数据无法导出'}
        onClick={() => onclickExport()}
      >
        {text}
      </Button>
    ),
    [isLoadingExport, onclickExport]
  );

  return {
    DownloadButton
  };
};
