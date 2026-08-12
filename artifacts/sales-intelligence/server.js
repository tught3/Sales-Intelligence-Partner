import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 4200;
const apiServerPort = process.env.API_SERVER_PORT || 4201;

// /api 요청(HTTP + WebSocket 업그레이드)을 api-server로 프록시.
// 정적 파일 서빙과 * 폴백보다 먼저 등록해야 index.html로 가로채지지 않는다.
// pathFilter로 매칭하고 app.use()를 경로 없이(루트에) 붙여야 한다 —
// app.use('/api', apiProxy)로 마운트하면 Express가 req.url에서 '/api' 접두사를
// 벗겨낸 뒤 미들웨어에 넘겨서, 프록시 대상 URL에도 '/api'가 빠진 채 전달된다.
const apiProxy = createProxyMiddleware({
  pathFilter: '/api',
  target: `http://localhost:${apiServerPort}`,
  changeOrigin: true,
  ws: true,
});

app.use(apiProxy);

app.use(express.static(join(__dirname, 'dist/public')));

app.get('/*splat', (req, res) => {
  res.sendFile(join(__dirname, 'dist/public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`✓ Serving on http://localhost:${port}`);
  console.log(`✓ Proxying /api -> http://localhost:${apiServerPort}`);
});

// express는 app.listen()이 만드는 http.Server의 upgrade 이벤트를 자동으로
// 프록시에 연결해주지 않으므로, WebSocket 업그레이드도 프록시되도록 명시 구독한다.
server.on('upgrade', apiProxy.upgrade);
