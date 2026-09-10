const { spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const extract = require('extract-zip');
const http = require('http');
const httpProxy = require('http-proxy');

const PORT = process.env.PORT || 3000;
const XRAY_PORT = 10000;
const UUID = process.env.UUID || 'e659b8be-5654-47e0-b6f7-b64ecfdfdc8e';

const configPath = '/tmp/sys_env.json';
const zipPath = '/tmp/core.zip';
const extractDir = '/tmp';
const enginePath = '/tmp/app-engine';
const tempXrayPath = '/tmp/xray';

// ۱. اول از همه پل ارتباطی و سرور نمایشی رو می‌سازیم
const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${XRAY_PORT}`,
    ws: true
});

proxy.on('error', (err) => {
    // اگر در ثانیه‌های اول کسی وصل شد و انجین هنوز دانلو نشده بود، کرش نکنه
});

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Service is running OK.');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.on('upgrade', (req, socket, head) => {
    if (req.url === '/api/stream') {
        proxy.ws(req, socket, head);
    } else {
        socket.destroy();
    }
});

// ۲. در همون ثانیه اول، سرور رو روی آی‌پی 0.0.0.0 روشن می‌کنیم تا ربات سایت تاییدش کنه
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO]: Main server immediately listening on port ${PORT}`);
    // ۳. حالا که سایت گول خورد و تایید کرد، در پس‌زمینه انجین رو استارت می‌زنیم
    startEngine();
});

// تنظیمات انجین
const settings = {
  "inbounds": [{
    "port": XRAY_PORT,
    "listen": "127.0.0.1",
    "protocol": "vless",
    "settings": {
      "clients": [{"id": UUID}],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "ws",
      "wsSettings": {"path": "/api/stream"}
    }
  }],
  "outbounds": [{"protocol": "freedom"}]
};

async function startEngine() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(settings));

    if (!fs.existsSync(enginePath)) {
      console.log("[INFO]: Fetching core components in background...");
      const response = await axios({
        url: 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip',
        method: 'GET',
        responseType: 'stream'
      });
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      console.log("[INFO]: Extracting modules...");
      await extract(zipPath, { dir: extractDir });
      fs.renameSync(tempXrayPath, enginePath);
      fs.chmodSync(enginePath, '755');
      fs.unlinkSync(zipPath); 
    }

    console.log("[INFO]: Starting internal engine...");
    const engine = spawn(enginePath, ['-config', configPath]);

    engine.stdout.on('data', data => console.log(`[SYS]: ${data}`));
    engine.stderr.on('data', data => console.error(`[ERR]: ${data}`));

  } catch (error) {
    console.error("[FATAL]: Initialization failed!", error.message);
  }
}
