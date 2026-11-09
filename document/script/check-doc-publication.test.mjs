import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { checkDocumentPublication } from './check-doc-publication.mjs';

for (const status of [404, 200]) {
  test(`an unrelated service returning ${status} cannot pass draft verification`, async (context) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'Content-Type': 'text/html' });
      response.end('<html><main>Unrelated service</main></html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(() => { server.closeAllConnections(); server.close(); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(checkDocumentPublication({ baseUrl }), /公开介绍页/);
  });
}
