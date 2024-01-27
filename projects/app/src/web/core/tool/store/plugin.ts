import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getPlugTemplates } from '../api';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';

type State = {
  pluginModuleTemplates: FlowModuleTemplateType[];
  loadPluginTemplates: (init?: boolean) => Promise<FlowModuleTemplateType[]>;
};

export const usePluginStore = create<State>()(
  devtools(
    immer((set, get) => ({
      pluginModuleTemplates: [],
      async loadPluginTemplates(init) {
        if (!init && get().pluginModuleTemplates.length > 0) {
          return get().pluginModuleTemplates;
        }
        const templates = await getPlugTemplates();
        set((state) => {
          state.pluginModuleTemplates = templates;
        });
        return templates;
      }
    }))
  )
);
