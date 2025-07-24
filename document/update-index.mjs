import { algoliasearch } from 'algoliasearch';
import { sync } from 'fumadocs-core/search/algolia';
import * as fs from 'node:fs';

async function main() {
  const content = fs.readFileSync('.next/server/app/static.json.body');

  // now you can pass it to `sync`
  /** @type {import('fumadocs-core/search/algolia').DocumentRecord[]} **/
  const records = JSON.parse(content.toString());

  console.log({
    NEXT_PUBLIC_SEARCH_APPID: process.env.NEXT_PUBLIC_SEARCH_APPID,
    SEARCH_APPWRITEKEY: process.env.SEARCH_APPWRITEKEY,
    SEARCH_APPWRITEKEY: process.env.SEARCH_APPWRITEKEY
  })

  if (!process.env.NEXT_PUBLIC_SEARCH_APPID || !process.env.SEARCH_APPWRITEKEY || !process.env.SEARCH_APPWRITEKEY) {
    console.log('NEXT_PUBLIC_SEARCH_APPID or SEARCH_APPWRITEKEY is not set');
    return;
  }

  const client = algoliasearch(
    process.env.NEXT_PUBLIC_SEARCH_APPID || '',
    process.env.SEARCH_APPWRITEKEY || ''
  );

  void sync(client, {
    indexName: 'document',
    documents: records
  });
}

main();
