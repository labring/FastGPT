export function getLikeSql(searchText?: string) {
  return searchText ? `AND (index ILIKE '%${searchText}%' OR content ILIKE '%${searchText}%')` : '';
}
