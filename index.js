const { spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const extract = require('extract-zip');
const http = require('http');
const httpProxy = require('http-proxy');

const PORT = process.env.PORT || 3000;
const XRAY_PORT = 10000; // پورت داخلی و مخفی برای انجین
const UUID = process.env.UUID || 'e659b8be-5654-47e0-b6f7-b64ecfdfdc8e';

const configPath = '/tmp/sys_env.json';
const zipPath = '/tmp/core.zip';
const extractDir = '/tmp';
const enginePath = '/tmp/app-engine';
const tempXrayPath = '/tmp/xray';

// تنظیمات انجین روی پورت مخفی
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

fs.writeFileSync(configPath, JSON.stringify(settings));

async function startEngine() {
  try {
    if (!fs.existsSync(enginePath)) {
      console.log("[INFO]: Fetching core components into /tmp...");
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

    // ساخت پل ارتباطی (پروکسی)
    const proxy = httpProxy.createProxyServer({
        target: `http://127.0.0.1:${XRAY_PORT}`,
        ws: true
    });

    proxy.on('error', (err) => {
        console.error("[PROXY ERR]:", err.message);
    });

    // ساخت وب‌سایت فیک برای دور زدن ربات چک‌کننده سایت
    const server = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Service is running OK.'); // پیغام سلامت برای ربات
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    // هدایت ترافیک وی‌پی‌ان به انجین داخلی
    server.on('upgrade', (req, socket, head) => {
        if (req.url === '/api/stream') {
            proxy.ws(req, socket, head);
        } else {
            socket.destroy();
        }
    });

    server.listen(PORT, () => {
        console.log(`[INFO]: Main server listening on platform port ${PORT}`);
    });

  } catch (error) {
    console.error("[FATAL]: Initialization failed!", error.message);
  }
}

startEngine();
