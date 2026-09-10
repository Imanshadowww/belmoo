const { spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const extract = require('extract-zip');

const PORT = process.env.PORT || 3000;
const UUID = process.env.UUID || 'e659b8be-5654-47e0-b6f7-b64ecfdfdc8e';

// تمام فایل‌ها رو به پوشه مجاز و بازِ /tmp منتقل کردیم
const configPath = '/tmp/sys_env.json';
const zipPath = '/tmp/core.zip';
const extractDir = '/tmp';
const enginePath = '/tmp/app-engine';
const tempXrayPath = '/tmp/xray';

const settings = {
  "inbounds": [{
    "port": parseInt(PORT),
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

// ساخت فایل تو پوشه مجاز
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

    console.log("[INFO]: Starting application engine on port " + PORT);
    const engine = spawn(enginePath, ['-config', configPath]);

    engine.stdout.on('data', data => console.log(`[SYS]: ${data}`));
    engine.stderr.on('data', data => console.error(`[ERR]: ${data}`));

  } catch (error) {
    console.error("[FATAL]: Initialization failed!", error.message);
  }
}

startEngine();
