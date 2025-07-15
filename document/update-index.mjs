// @ts-check
import { algoliasearch } from 'algoliasearch';
import { sync } from 'fumadocs-core/search/algolia';
import * as fs from 'node:fs';

const content = fs.readFileSync('.next/server/app/static.json.body');

// now you can pass it to `sync`
/** @type {import('fumadocs-core/search/algolia').DocumentRecord[]} **/
const records = JSON.parse(content.toString());

const client = algoliasearch('E98V5BVTTC', '2831a0e577ac9a4632ddc674eb5507f9');

void sync(client, {
  indexName: 'document',
  documents: records,
});