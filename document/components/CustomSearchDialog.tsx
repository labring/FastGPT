'use client';
// components/CustomSearchDialog.tsx
import { useEffect, useMemo, useState } from 'react';
import type { DocumentRecord } from 'fumadocs-core/search/algolia';
import { useDocsSearch } from 'fumadocs-core/search/client';
import type { SortedResult } from 'fumadocs-core/server';
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

let staticRecordsPromise: Promise<DocumentRecord[]> | null = null;

/** Lazily fetch and cache pre-rendered `/static.json` search records for static preview hosts. */
function loadStaticRecords(): Promise<DocumentRecord[]> {
  if (!staticRecordsPromise) {
    staticRecordsPromise = fetch('/static.json')
      .then((res) => (res.ok ? (res.json() as Promise<DocumentRecord[]>) : []))
      .catch(() => {
        staticRecordsPromise = null;
        return [];
      });
  }
  return staticRecordsPromise;
}

/** Filter cached `/static.json` records by locale and query terms into grouped `SortedResult` items. */
function searchStaticRecords({
  records,
  rawQuery,
  locale
}: {
  records: DocumentRecord[];
  rawQuery: string;
  locale?: string;
}): SortedResult[] {
  const terms = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const matchesAll = (text?: string) =>
    Boolean(text && terms.every((term) => text.toLowerCase().includes(term)));

  const localePrefix = locale ? `/${locale}/` : '';
  const localeRecords = localePrefix
    ? records.filter((record) => record.url === `/${locale}` || record.url.startsWith(localePrefix))
    : [];
  const pool = localeRecords.length > 0 ? localeRecords : records;

  const results: SortedResult[] = [];
  let groupCount = 0;

  for (const record of pool) {
    if (groupCount >= 8) break;

    const titleMatched = matchesAll(record.title);
    const descriptionMatched = matchesAll(record.description);
    const subItems: SortedResult[] = [];
    let subIndex = 0;

    if (descriptionMatched && record.description) {
      subItems.push({
        id: `${record.url}-${subIndex++}`,
        type: 'text',
        content: record.description,
        url: record.url
      });
    }

    for (const heading of record.structured?.headings ?? []) {
      if (subItems.length >= 6) break;
      if (matchesAll(heading.content)) {
        subItems.push({
          id: `${record.url}-${subIndex++}`,
          type: 'heading',
          content: heading.content,
          url: `${record.url}#${heading.id}`
        });
      }
    }

    for (const item of record.structured?.contents ?? []) {
      if (subItems.length >= 6) break;
      if (matchesAll(item.content)) {
        subItems.push({
          id: `${record.url}-${subIndex++}`,
          type: 'text',
          content: item.content,
          url: item.heading ? `${record.url}#${item.heading}` : record.url
        });
      }
    }

    if (!titleMatched && subItems.length === 0) continue;

    groupCount += 1;
    results.push({
      id: record.url,
      type: 'page',
      content: record.title,
      url: record.url
    });
    results.push(...subItems);
  }

  return results;
}

export default function CustomSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const { search, setSearch, query } = useDocsSearch({
    type: 'fetch',
    api: '/api/search',
    locale
  });
  const [staticRecords, setStaticRecords] = useState<DocumentRecord[] | null>(null);
  const [isFallbackLoading, setIsFallbackLoading] = useState(false);

  useEffect(() => {
    if (!query.error || !search.trim() || staticRecords !== null) return;
    let active = true;
    setIsFallbackLoading(true);
    loadStaticRecords()
      .then((records) => {
        if (active) setStaticRecords(records);
      })
      .finally(() => {
        if (active) setIsFallbackLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query.error, search, staticRecords]);

  const items = useMemo(() => {
    if (!query.error) {
      return query.data !== 'empty' ? query.data : null;
    }
    if (!search.trim() || staticRecords === null) return null;
    return searchStaticRecords({ records: staticRecords, rawQuery: search, locale });
  }, [locale, query.data, query.error, search, staticRecords]);

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading || isFallbackLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={items} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
