const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const PORT = process.env.PORT || 8088;

// MongoDB
const blackPool = [
  "stratum-mining-pool.zapto.org"
];

// App
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const nodes = {};
const MAX_CONNECTION_PER_IP = 200;

function proxySender(ws, conn) {
  ws.on('close', () => {
    conn.end();
  });

  ws.on('message', (cmd) => {
    try {
      const command = JSON.parse(cmd);
      const method = command.method;;
      if (method === 'mining.subscribe' || method === 'mining.authorize' || method === 'mining.submit') {
        conn.write(cmd);
      }
    } catch (error) {
      console.log(`[Error][INTERNAL] ${error}`);
      ws.close();
    }
  });
}

function proxyReceiver(conn, cmdq) {
  conn.on('data', (data) => {
    cmdq.send(data.toString());
  });
  conn.on('end', () => {
    cmdq.close();
  });
  conn.on('error', (err) => {
    conn.end();
  });
}

function proxyConnect(host, port) {
  const conn = net.createConnection(port, host);
  return conn;
}

async function proxyMain(ws, req) {
  ws.on('message', (message) => {
    const command = JSON.parse(message);
    if (command.method === 'proxy.connect' && command.params.length === 2) {
      const [host, port] = command.params || [];
      
      if (!host || !port || blackPool.includes(host) || port < 0 || port > 65536) {
        ws.close();
        req.socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        req.socket.destroy();
        return;
      }

      const conn = proxyConnect(host, port);
      if (conn) {
        proxySender(ws, conn);
        proxyReceiver(conn, ws);
      }
    }
  });
}

wss.on('connection', proxyMain);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
