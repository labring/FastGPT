import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') return;

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Encoding': 'none',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream'
  });

  let val = 0;

  const timer = setInterval(() => {
    console.log('发送消息', val);
    res.write(`data: ${val++}\n\n`);
    if (val > 30) {
      clearInterval(timer);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }, 500);
}
