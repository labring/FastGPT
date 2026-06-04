export const FileSelectMode = {
  All: 'all',
  Partial: 'partial'
} as const;

export type FileSelectModeType = (typeof FileSelectMode)[keyof typeof FileSelectMode];
