import { useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { readCsvRawText } from '@fastgpt/web/common/file/utils';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useVirtualScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import {
  delAllChatInputGuide,
  delChatInputGuide,
  getChatInputGuideList,
  postChatInputGuides,
  putChatInputGuide
} from '@/web/core/chat/inputGuide/api';

const normalizeGuideTextList = (textList: string[]) =>
  textList.map((text) => text.trim()).filter(Boolean);

/**
 * 封装输入引导词库弹窗的数据加载和写操作。
 * 列表增删改采用本地乐观更新，批量导入统一在这里去空白，避免弹窗组件关心 CSV 或 API 细节。
 */
export const useInputGuideLexicon = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { File: SelectFile, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.csv'
  });
  const [newData, setNewData] = useState<string>();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editDataId, setEditDataId] = useState<string>();
  const [searchKey, setSearchKey] = useState('');

  const {
    scrollDataList,
    setData,
    ScrollList,
    isLoading: isRequesting,
    fetchData,
    scroll2Top
  } = useVirtualScrollPagination(getChatInputGuideList, {
    refreshDeps: [searchKey],
    itemHeight: 48,
    overscan: 20,
    pageSize: 20,
    defaultParams: {
      appId,
      searchKey
    }
  });

  const { run: createNewData, loading: isCreating } = useRequest(
    async (textList: string[]) => {
      const normalizedTextList = normalizeGuideTextList(textList);

      if (normalizedTextList.length === 0) {
        return Promise.resolve();
      }

      scroll2Top();
      return postChatInputGuides({
        appId,
        textList: normalizedTextList
      }).then((res) => {
        if (res.insertLength < normalizedTextList.length) {
          toast({
            status: 'warning',
            title: t('app:insert_input_guide,_some_data_already_exists', { len: res.insertLength })
          });
        } else {
          toast({
            status: 'success',
            title: t('common:add_success')
          });
        }
        fetchData({ init: true });
      });
    },
    {
      onSuccess() {
        setNewData(undefined);
      },
      errorToast: t('common:create_failed')
    }
  );

  const onUpdateData = useCallback(
    ({ text, dataId }: { text: string; dataId: string }) => {
      const trimmedText = text.trim();

      // 空文本不落库，也不把本地列表乐观更新成空值。
      if (!trimmedText) {
        setEditDataId(undefined);
        return;
      }

      setData((state) =>
        state.map((item) => {
          if (item._id === dataId) {
            return {
              ...item,
              text: trimmedText
            };
          }
          return item;
        })
      );

      void putChatInputGuide({
        appId,
        text: trimmedText,
        dataId
      });

      setEditDataId(undefined);
    },
    [appId, setData]
  );

  const onDeleteData = useCallback(
    (dataIdList: string[]) => {
      if (dataIdList.length === 0) return;

      setData((state) => state.filter((item) => !dataIdList.includes(item._id)));
      void delChatInputGuide({
        appId,
        dataIdList
      });
    },
    [appId, setData]
  );

  const onDeleteAllData = useCallback(() => {
    setData([]);
    void delAllChatInputGuide({
      appId
    });
  }, [appId, setData]);

  const onStartCreateData = useCallback(() => {
    setNewData('');
  }, []);

  const onStartEditData = useCallback((dataId: string) => {
    setEditDataId(dataId);
  }, []);

  const clearSelectedRows = useCallback(() => {
    setSelectedRows([]);
  }, []);

  const onSelectRow = useCallback((dataId: string, checked: boolean) => {
    setSelectedRows((state) => {
      if (checked) {
        return state.includes(dataId) ? state : [...state, dataId];
      }

      return state.filter((id) => id !== dataId);
    });
  }, []);

  const onSelectFile = useCallback(
    async (files: File[]) => {
      const file = files?.[0];
      if (file) {
        const list = await readCsvRawText({ file });
        // CSV 只取第一列作为引导词，后续列按模板说明忽略。
        const textList = list.map((item) => item[0] || '');
        createNewData(textList);
      }
    },
    [createNewData]
  );

  return {
    SelectFile,
    ScrollList,
    clearSelectedRows,
    createNewData,
    editDataId,
    isCreatingNewData: newData !== undefined,
    isLoading: isRequesting || isCreating,
    onDeleteAllData,
    onDeleteData,
    onOpenSelectFile,
    onSelectRow,
    onSelectFile,
    onStartCreateData,
    onStartEditData,
    onUpdateData,
    scrollDataList,
    searchKey,
    selectedRows,
    setSearchKey
  };
};
