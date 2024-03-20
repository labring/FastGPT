import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { FlowNodeTemplateType } from '@fastgpt/global/core/module/type';
import { getTeamPlugTemplates, getSystemPlugTemplates } from '../../plugin/api';

type State = {
  basicNodeTemplates: FlowNodeTemplateType[];
  setBasicNodeTemplates: (basicNodeTemplates: FlowNodeTemplateType[]) => void;
  systemNodeTemplates: FlowNodeTemplateType[];
  loadSystemNodeTemplates: (init?: boolean) => Promise<FlowNodeTemplateType[]>;
  teamPluginNodeTemplates: FlowNodeTemplateType[];
  loadTeamPluginNodeTemplates: (e?: {
    parentId?: string | null;
    searchKey?: string;
    init?: boolean;
  }) => Promise<FlowNodeTemplateType[]>;
};

export const useWorkflowStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        basicNodeTemplates: [],
        setBasicNodeTemplates: (basicNodeTemplates) => {
          set((state) => {
            state.basicNodeTemplates = basicNodeTemplates;
          });
        },
        systemNodeTemplates: [],
        async loadSystemNodeTemplates(init) {
          if (!init && get().systemNodeTemplates.length > 0) {
            return get().systemNodeTemplates;
          }
          const templates = await getSystemPlugTemplates();
          set((state) => {
            state.systemNodeTemplates = templates;
          });
          return templates;
        },
        teamPluginNodeTemplates: [],
        async loadTeamPluginNodeTemplates(e) {
          const { parentId = null, searchKey, init } = e || {};

          if (!init && get().teamPluginNodeTemplates.length > 0) {
            return get().teamPluginNodeTemplates;
          }
          const templates = await getTeamPlugTemplates({
            parentId: parentId || null,
            searchKey: searchKey
          });
          set((state) => {
            state.teamPluginNodeTemplates = templates;
          });
          return templates;
        }
      })),
      {
        name: 'datasetStore',
        partialize: (state) => ({})
      }
    )
  )
);
