import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  DatasetCollectionTagTypeEnum,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import { resolveDisplayedCollectionTag, type CollectionTagDisplayItem } from './TagCommon';

export const SET_TAG_TABLE_COLUMNS = '200px minmax(0, 1fr) 100px';

export type CollectionTagRow = {
  id: string;
  tagId: string;
  value: string | number | string[];
};

/** 切换标签类型时的空值：选项类是空数组，其余是空字符串。 */
export const emptyTagRowValue = (tagType?: DatasetTagType['tagType']) =>
  tagType === DatasetCollectionTagTypeEnum.array ? [] : '';

export const createEmptyTagRow = (): CollectionTagRow => ({
  id: getNanoid(),
  tagId: '',
  value: ''
});

/** 把集合上的展示格式标签灌进设置弹窗表格；没有可解析项时给一行空行。 */
export const collectionTagsToRows = (
  items: CollectionTagDisplayItem[] | undefined,
  tags: DatasetTagType[]
): CollectionTagRow[] => {
  const rows: CollectionTagRow[] = [];
  for (const item of items ?? []) {
    const resolved = resolveDisplayedCollectionTag(item, tags);
    if (!resolved) continue;
    rows.push({
      id: getNanoid(),
      tagId: String(resolved.tagDoc._id),
      value: resolved.value
    });
  }
  return rows.length > 0 ? rows : [createEmptyTagRow()];
};

/** 行数据是否已选标签且填了对应类型的值，用于禁用「添加」和底部确定。 */
export const isTagRowComplete = (
  row: Pick<CollectionTagRow, 'tagId' | 'value'>,
  tags: DatasetTagType[]
) => {
  if (!row.tagId) return false;
  const tagDoc = tags.find((tag) => String(tag._id) === row.tagId);
  if (!tagDoc) return false;

  const tagType = tagDoc.tagType ?? DatasetCollectionTagTypeEnum.string;
  if (tagType === DatasetCollectionTagTypeEnum.string) {
    return typeof row.value === 'string' && row.value.trim().length > 0;
  }
  if (
    tagType === DatasetCollectionTagTypeEnum.number ||
    tagType === DatasetCollectionTagTypeEnum.datetime
  ) {
    return typeof row.value === 'number' && Number.isFinite(row.value);
  }
  if (tagType === DatasetCollectionTagTypeEnum.array) {
    return Array.isArray(row.value) && row.value.length > 0;
  }
  return false;
};

/** 当前行可选的标签：排除其它行已选中的 tagId。 */
export const unusedTagSelectOptions = (
  tags: DatasetTagType[],
  rows: Array<{ id: string; tagId: string }>,
  currentRowId: string
) => {
  const otherSelectedTagIds = new Set(
    rows.filter((row) => row.id !== currentRowId && Boolean(row.tagId)).map((row) => row.tagId)
  );

  return tags
    .filter((tag) => !otherSelectedTagIds.has(String(tag._id)))
    .map((tag) => ({
      label: tag.tag,
      value: String(tag._id)
    }));
};
