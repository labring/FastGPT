'use client';
// components/CustomSearchDialog.tsx
import { liteClient } from 'algoliasearch/lite';
import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog,
  SearchDialogOverlay,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogClose,
  SearchDialogList,
  type SharedProps
} from 'fumadocs-ui/components/dialog/search';
import { useI18n } from 'fumadocs-ui/contexts/i18n';

if (!process.env.NEXT_PUBLIC_SEARCH_APPID || !process.env.NEXT_PUBLIC_SEARCH_APPKEY) {
  throw new Error('NEXT_PUBLIC_SEARCH_APPID and NEXT_PUBLIC_SEARCH_APPKEY are not set');
}

const client = liteClient(
  process.env.NEXT_PUBLIC_SEARCH_APPID,
  process.env.NEXT_PUBLIC_SEARCH_APPKEY
);

export default function CustomSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const { search, setSearch, query } = useDocsSearch({
    type: 'algolia',
    client,
    indexName: 'document',
    locale
  });

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
