import { create, devtools, immer } from '@fastgpt/web/common/zustand';
import type {
  EvaluationDatasetSchemaType,
  EvaluationMetricSchemaType,
  EvaluationDisplayType
} from '@fastgpt/global/core/evaluation/type';

export interface EvaluationState {
  // Data
  datasets: EvaluationDatasetSchemaType[];
  metrics: EvaluationMetricSchemaType[];
  tasks: EvaluationDisplayType[];

  // UI State
  loading: {
    datasets: boolean;
    metrics: boolean;
    tasks: boolean;
  };

  // Selected items for task creation
  selectedDatasetId: string;
  selectedMetricIds: string[];

  // Modal states
  showDatasetModal: boolean;
  showMetricModal: boolean;
  showTaskModal: boolean;
  editingItem:
    | EvaluationDatasetSchemaType
    | EvaluationMetricSchemaType
    | EvaluationDisplayType
    | null;
}

export interface EvaluationActions {
  // Dataset actions
  setDatasets: (datasets: EvaluationDatasetSchemaType[]) => void;
  addDataset: (dataset: EvaluationDatasetSchemaType) => void;
  updateDataset: (id: string, dataset: Partial<EvaluationDatasetSchemaType>) => void;
  removeDataset: (id: string) => void;

  // Metric actions
  setMetrics: (metrics: EvaluationMetricSchemaType[]) => void;
  addMetric: (metric: EvaluationMetricSchemaType) => void;
  updateMetric: (id: string, metric: Partial<EvaluationMetricSchemaType>) => void;
  removeMetric: (id: string) => void;

  // Task actions
  setTasks: (tasks: EvaluationDisplayType[]) => void;
  addTask: (task: EvaluationDisplayType) => void;
  updateTask: (id: string, task: Partial<EvaluationDisplayType>) => void;
  removeTask: (id: string) => void;

  // Selection actions
  setSelectedDatasetId: (id: string) => void;
  setSelectedMetricIds: (ids: string[]) => void;
  clearSelections: () => void;

  // Loading actions
  setLoading: (key: keyof EvaluationState['loading'], loading: boolean) => void;

  // Modal actions
  openDatasetModal: (item?: EvaluationDatasetSchemaType) => void;
  closeDatasetModal: () => void;
  openMetricModal: (item?: EvaluationMetricSchemaType) => void;
  closeMetricModal: () => void;
  openTaskModal: (item?: EvaluationDisplayType) => void;
  closeTaskModal: () => void;
}

export const useEvaluationStore = create<EvaluationState & EvaluationActions>()(
  devtools(
    immer((set: (fn: (state: EvaluationState & EvaluationActions) => void) => void) => ({
      // Initial state
      datasets: [],
      metrics: [],
      tasks: [],
      loading: {
        datasets: false,
        metrics: false,
        tasks: false
      },
      selectedDatasetId: '',
      selectedMetricIds: [],
      showDatasetModal: false,
      showMetricModal: false,
      showTaskModal: false,
      editingItem: null,

      // Dataset actions
      setDatasets: (datasets: EvaluationDatasetSchemaType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.datasets = datasets;
        }),

      addDataset: (dataset: EvaluationDatasetSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.datasets.push(dataset);
        }),

      updateDataset: (id: string, dataset: Partial<EvaluationDatasetSchemaType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.datasets.findIndex(
            (item: EvaluationDatasetSchemaType) => item._id === id
          );
          if (index !== -1) {
            state.datasets[index] = { ...state.datasets[index], ...dataset };
          }
        }),

      removeDataset: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.datasets = state.datasets.filter(
            (item: EvaluationDatasetSchemaType) => item._id !== id
          );
        }),

      // Metric actions
      setMetrics: (metrics: EvaluationMetricSchemaType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.metrics = metrics;
        }),

      addMetric: (metric: EvaluationMetricSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.metrics.push(metric);
        }),

      updateMetric: (id: string, metric: Partial<EvaluationMetricSchemaType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.metrics.findIndex(
            (item: EvaluationMetricSchemaType) => item._id === id
          );
          if (index !== -1) {
            state.metrics[index] = { ...state.metrics[index], ...metric };
          }
        }),

      removeMetric: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.metrics = state.metrics.filter(
            (item: EvaluationMetricSchemaType) => item._id !== id
          );
        }),

      // Task actions
      setTasks: (tasks: EvaluationDisplayType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.tasks = tasks;
        }),

      addTask: (task: EvaluationDisplayType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.tasks.push(task);
        }),

      updateTask: (id: string, task: Partial<EvaluationDisplayType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.tasks.findIndex((item: EvaluationDisplayType) => item._id === id);
          if (index !== -1) {
            state.tasks[index] = { ...state.tasks[index], ...task };
          }
        }),

      removeTask: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.tasks = state.tasks.filter((item: EvaluationDisplayType) => item._id !== id);
        }),

      // Selection actions
      setSelectedDatasetId: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedDatasetId = id;
        }),

      setSelectedMetricIds: (ids: string[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedMetricIds = ids;
        }),

      clearSelections: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedDatasetId = '';
          state.selectedMetricIds = [];
        }),

      // Loading actions
      setLoading: (key: keyof EvaluationState['loading'], loading: boolean) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.loading[key] = loading;
        }),

      // Modal actions
      openDatasetModal: (item?: EvaluationDatasetSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showDatasetModal = true;
          state.editingItem = item || null;
        }),

      closeDatasetModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showDatasetModal = false;
          state.editingItem = null;
        }),

      openMetricModal: (item?: EvaluationMetricSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showMetricModal = true;
          state.editingItem = item || null;
        }),

      closeMetricModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showMetricModal = false;
          state.editingItem = null;
        }),

      openTaskModal: (item?: EvaluationDisplayType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showTaskModal = true;
          state.editingItem = item || null;
        }),

      closeTaskModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showTaskModal = false;
          state.editingItem = null;
        })
    })),
    { name: 'evaluation-store' }
  )
);
