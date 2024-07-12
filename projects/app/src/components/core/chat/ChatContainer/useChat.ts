import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './PluginRunBox/constants';

export const useChat = () => {
  const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([]);
  const variablesForm = useForm();
  // plugin
  const [pluginRunTab, setPluginRunTab] = useState<PluginRunBoxTabEnum>(PluginRunBoxTabEnum.input);

  const resetChatRecords = useCallback(
    (props?: { records?: ChatSiteItemType[]; variables?: Record<string, any> }) => {
      const { records = [], variables = {} } = props || {};

      setChatRecords(records);

      const data = variablesForm.getValues();
      for (const key in data) {
        const val = variables[key] !== undefined ? variables[key] : '';
        variablesForm.setValue(key, val);
      }
    },
    [variablesForm, setChatRecords]
  );
  const clearChatRecords = useCallback(() => {
    setChatRecords([]);

    const data = variablesForm.getValues();
    for (const key in data) {
      variablesForm.setValue(key, '');
    }
  }, [variablesForm]);

  return {
    chatRecords,
    setChatRecords,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    clearChatRecords,
    resetChatRecords
  };
};
