import React, { useRef, useCallback, ComponentType } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { getExportDataList } from '@/api/model';
import { useMutation } from '@tanstack/react-query';
type FileSuffix = 'csv';
type HOCProps = {
  isLoading: boolean;
  onClick: () => any;
};
const fileMap = {
  csv: {
    suffix: 'csv',
    fileType: 'text/csv'
  }
};
export const useDownloadFile = ({
  fileSuffix,
  fetchDataList,
  Component,
  progressData = undefined
}: {
  fileSuffix: FileSuffix;
  fetchDataList: () => any;
  Component: React.FC;
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
  // 高阶函数，为组件添加下载功能
  //@ts-ignore
  const withDownLoad = useCallback(
    (WrappedComponent: ComponentType) => {
      const WithDownLoad = (props) => {
        return (
          <WrappedComponent
            {...props}
            isLoading={isLoadingExport}
            onClick={() => onclickExport()}
          />
        );
      };
      return WithDownLoad;
    },
    [isLoadingExport, onclickExport]
  );

  return withDownLoad(Component);
};
