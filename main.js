// version 0.1.3 build 2025-12-24
// WMProject1217

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 配置
const config = {
  port: 80,
  wwwFolder: './www',
  upstreamServer: 'https://mirrors.ustc.edu.cn/', // 替换为你的上级服务器地址
  timeout: 10000, // 超时时间(ms)
  logFile: './main.log' // 日志文件路径
};

// 日志记录函数
function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  
  fs.appendFile(config.logFile, logMessage, (err) => {
    if (err) {
      console.error(`Fail to Write Log: ${err}`);
    }
  });
  
  // 同时在控制台输出
  console.log(logMessage.trim());
}

if (!fs.existsSync(config.wwwFolder)) {
  fs.mkdirSync(config.wwwFolder, { recursive: true });
  writeLog('INFO', `Created www Folder: ${config.wwwFolder}`);
}

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) { return true; }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname, { recursive: true });
}

function fetchFromUpstream(requestPath, response) {
  const upstreamUrl = config.upstreamServer + requestPath;
  console.log(`Get From Upstream: ${upstreamUrl}`);
  
  const protocol = upstreamUrl.startsWith('https') ? https : http;
  
  const req = protocol.get(upstreamUrl, (upstreamRes) => {
    const statusCode = upstreamRes.statusCode;
    
    if (statusCode >= 400) {
      writeLog('WARN', `Upstream Server Error: ${statusCode} for ${upstreamUrl}`);
      response.writeHead(statusCode, upstreamRes.headers);
      upstreamRes.pipe(response);
      return;
    }
    
    const localPath = path.join(config.wwwFolder, requestPath);
    ensureDirectoryExistence(localPath);
    
    const chunks = [];
    upstreamRes.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    upstreamRes.on('end', () => {
      const fileBuffer = Buffer.concat(chunks);
      
      fs.writeFile(localPath, fileBuffer, (err) => {
        if (err) {
          writeLog('ERROR', `Fail to Save File: ${localPath}, Error: ${err.message}`);
          response.writeHead(500, { 'Content-Type': 'text/plain' });
          response.end('Internal Server Error');
          return;
        }
        
        writeLog('INFO', `Saved File: ${localPath} (${fileBuffer.length} bytes)`);
        
        response.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        response.end(fileBuffer);
      });
    });
  });
  
  req.on('error', (err) => {
    writeLog('ERROR', `Fail to Request Upstream Server: ${err.message} for ${upstreamUrl}`);
    response.writeHead(502, { 'Content-Type': 'text/plain' });
    response.end('Bad Gateway');
  });
  
  req.setTimeout(config.timeout, () => {
    writeLog('ERROR', `Timeout when Requesting Upstream Server: ${upstreamUrl}`);
    req.destroy();
    response.writeHead(504, { 'Content-Type': 'text/plain' });
    response.end('Gateway Timeout');
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const requestPath = decodeURIComponent(parsedUrl.pathname);
  
  if (requestPath === '/') {
    const indexPath = path.join(config.wwwFolder, 'index.html');
    if (fs.existsSync(indexPath)) {
      fs.readFile(indexPath, (err, data) => {
        if (err) {
          writeLog('ERROR', `Fail to Read Local File: ${indexPath}, Error: ${err.message}`);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    } else {
      fetchFromUpstream(requestPath, res);
    }
    return;
  }
  
  const localFilePath = path.join(config.wwwFolder, requestPath);
  
  fs.access(localFilePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.log(`File not Existed: ${localFilePath}`);
      fetchFromUpstream(requestPath, res);
    } else {
      console.log(`Response from Local: ${localFilePath}`);
      
      const ext = path.extname(localFilePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      fs.readFile(localFilePath, (err, data) => {
        if (err) {
          writeLog('ERROR', `Fail to Read Local File: ${localFilePath}, Error: ${err.message}`);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    }
  });
});

// 服务器启动日志
server.listen(config.port, "0.0.0.0", () => {
  const startupMessage = `Server Started on http://0.0.0.0:${config.port}\n` +
                        `Cache Folder: ${path.resolve(config.wwwFolder)}\n` +
                        `Upstream Server: ${config.upstreamServer}`;
  
  writeLog('INFO', '========== SERVER STARTED ==========');
  writeLog('INFO', startupMessage);
  
  //console.log(`Server Started on http://0.0.0.0:${config.port}`);
  //console.log(`Cache Folder: ${path.resolve(config.wwwFolder)}`);
  //console.log(`Upstream Server: ${config.upstreamServer}`);
});

// 服务器中断日志
process.on('SIGINT', () => {
  writeLog('INFO', '========== SERVER STOPPED ==========');
  writeLog('INFO', 'Server received SIGINT signal, shutting down...');
  
  console.log('\nKilling Server...');
  server.close(() => {
    writeLog('INFO', 'Server stopped successfully');
    console.log('Killed.');
    process.exit(0);
  });
});

// 服务器错误日志
server.on('error', (err) => {
  writeLog('ERROR', `Server Error: ${err.message}`);
  console.error('Error:', err);
});