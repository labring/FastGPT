import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type {
  PuzzleCaptchaChallenge,
  PuzzleCaptchaSubmission,
  PuzzleCaptchaResult
} from '@fastgpt/global/support/user/account/captcha/type';
import { PuzzleCaptchaSubmissionSchema } from '@fastgpt/global/support/user/account/captcha/type';

/**
 * CLI 旋转验证使用仅监听 loopback 的短期页面，由 CLI 代理服务端校验。
 * 随机路径、Host/Origin 校验和串行提交限制防止本地页面串用；页面不包含密码或登录令牌。
 */
export const createPuzzlePreview = async ({
  challenge,
  getCaptcha,
  verify
}: {
  challenge: PuzzleCaptchaChallenge;
  getCaptcha: () => Promise<PuzzleCaptchaChallenge>;
  verify: (submission: PuzzleCaptchaSubmission) => Promise<PuzzleCaptchaResult>;
}) => {
  const nonce = randomBytes(32).toString('hex');
  let resolveSolution!: (captcha: string) => void;
  let rejectSolution!: (error: Error) => void;
  let settled = false;
  let submitting = false;
  let currentChallenge = challenge;
  let served = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const solution = new Promise<string>((resolve, reject) => {
    resolveSolution = resolve;
    rejectSolution = reject;
  });
  // 浏览器启动过程中也可能超时，立即注册 rejection handler，调用方仍会收到原始异常。
  void solution.catch(() => undefined);
  /** 每次页面刷新使用新的挑战；HTML 中只序列化公开图片数据。 */
  const renderPage = () => {
    const data = JSON.stringify(currentChallenge).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FastGPT security verification</title><style>body{font:16px system-ui;background:#f4f7fb;color:#233245;margin:0;display:grid;min-height:100vh;place-items:center}main{width:min(320px,85vw);background:white;padding:24px;border-radius:16px;box-shadow:0 8px 32px #23324518}h1{font-size:20px}#image{position:relative;width:224px;max-width:100%;aspect-ratio:1;overflow:hidden;border-radius:50%;margin:20px auto;background:#f4f2ed}img{width:100%;display:block}input{width:100%;height:44px;touch-action:none;accent-color:#3370ff}p{font-size:14px;line-height:1.5}</style><main><h1>Security verification</h1><p>Drag the slider to turn the image upright.</p><div id="image"><img id="background" alt=""></div><input id="slider" aria-label="Rotate the image" type="range" value="0" min="0"><p>Use arrow keys to rotate, then press Enter to verify.</p><p id="status" role="status"></p></main><script>
const c=${data},s=document.getElementById('slider'),p=document.getElementById('background'),m=document.getElementById('status');p.src=c.captchaImage;s.max=360;let track=[],start=0,busy=false;
function begin(){if(busy)return;s.value=0;p.style.transform='rotate(0deg)';start=performance.now();track=[{x:0,y:0,t:0}];}
s.onpointerdown=begin;s.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit();}else if(e.key.startsWith('Arrow')&&!track.length)begin();};s.oninput=()=>{p.style.transform='rotate('+Number(s.value)+'deg)';if(track.length>=240)track=track.filter((_,i)=>i===0||i%2===1);track.push({x:Number(s.value),y:0,t:Math.round(performance.now()-start)});};
async function submit(){if(busy||!track.length)return;busy=true;s.disabled=true;track.push({x:Number(s.value),y:0,t:Math.round(performance.now()-start)});m.textContent='Verifying…';try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:c.challengeId,angle:Number(s.value),track})});if(!r.ok)throw Error();const result=await r.json();if(result.status==='passed'){m.textContent='Verified. Return to your terminal.';}else if(result.status==='retry'){track=[];s.value=0;p.style.transform='rotate(0deg)';busy=false;s.disabled=false;m.textContent='Verification failed. '+result.remainingAttempts+' attempts remaining.';}else{location.reload();}}catch{m.textContent='Verification failed or expired. Run the login command again.';}}s.onpointerup=submit;
</script></html>`;
  };

  const server = createServer(async (req, res) => {
    const address = server.address();
    const host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
    );
    if (
      req.url !== `/${nonce}` ||
      req.headers.host !== host ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'GET') {
      try {
        if (served) {
          currentChallenge = await getCaptcha();
          resetTimeout();
        }
        served = true;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderPage());
      } catch {
        res.writeHead(400).end('Could not load a new verification image.');
      }
      return;
    }
    if (req.method !== 'POST' || submitting || settled) {
      res.writeHead(409).end();
      return;
    }
    submitting = true;
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32_768) throw new Error('Puzzle submission is too large');
        chunks.push(Buffer.from(chunk));
      }
      const submission = PuzzleCaptchaSubmissionSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString('utf8'))
      );
      if (submission.challengeId !== currentChallenge.challengeId)
        throw new Error('Puzzle challenge mismatch');
      const result = await verify(submission);
      if (result.status === 'passed') {
        settled = true;
        resolveSolution(result.captcha);
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch {
      settled = true;
      rejectSolution(new Error('Image rotation verification failed. Run the login command again.'));
      res.writeHead(400).end();
    } finally {
      submitting = false;
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Failed to open image rotation verification');
  /** 每次成功换图按新图片重设有效期，旧图定时器不能终止仍有效的新图。 */
  function resetTimeout() {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => {
        if (!settled) {
          settled = true;
          rejectSolution(new Error('Image rotation verification expired.'));
        }
        server.close();
        server.closeAllConnections();
      },
      Math.max(1, Math.min(300_000, new Date(currentChallenge.expiresAt).getTime() - Date.now()))
    );
    timeout.unref();
  }
  resetTimeout();

  return {
    url: `http://127.0.0.1:${address.port}/${nonce}`,
    solution,
    cleanup: async () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        rejectSolution(new Error('Image rotation verification cancelled.'));
      }
      server.close();
      server.closeAllConnections();
    }
  };
};
