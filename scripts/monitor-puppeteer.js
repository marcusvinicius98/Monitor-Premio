Run rm -f scripts/monitor_flag.txt
→ Abrindo painel...
Erro: Error: ENOENT: no such file or directory, open '/home/runner/work/Monitor-Premio/Monitor-Premio/scripts/downloads/prev_tabela.xlsx'
    at Object.openSync (node:fs:574:18)
    at Object.readFileSync (node:fs:453:35)
    at read_binary (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/xlsx/xlsx.js:3153:44)
    at readSync (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/xlsx/xlsx.js:23698:69)
    at Object.readFileSync (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/xlsx/xlsx.js:23738:9)
    at /home/runner/work/Monitor-Premio/Monitor-Premio/scripts/monitor-puppeteer.js:74:52 {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: '/home/runner/work/Monitor-Premio/Monitor-Premio/scripts/downloads/prev_tabela.xlsx'
}
/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/common/CallbackRegistry.js:72
            this._reject(callback, new Errors_js_1.TargetCloseError('Target closed'));
                                   ^

TargetCloseError: Protocol error (DOM.resolveNode): Target closed
    at CallbackRegistry.clear (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/common/CallbackRegistry.js:72:36)
    at CdpCDPSession._onClosed (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/CDPSession.js:101:25)
    at Connection.onMessage (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/Connection.js:130:25)
    at WebSocket.<anonymous> (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/node/NodeWebSocketTransport.js:44:32)
    at callListener (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/ws/lib/event-target.js:290:14)
    at WebSocket.onMessage (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/ws/lib/event-target.js:209:9)
    at WebSocket.emit (node:events:524:28)
    at Receiver.receiverOnMessage (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/ws/lib/websocket.js:1220:20)
    at Receiver.emit (node:events:524:28)
    at Immediate.<anonymous> (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/ws/lib/receiver.js:601:16) {
  cause: ProtocolError
      at <instance_members_initializer> (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/common/CallbackRegistry.js:93:14)
      at new Callback (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/common/CallbackRegistry.js:97:16)
      at CallbackRegistry.create (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/common/CallbackRegistry.js:22:26)
      at Connection._rawSend (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/Connection.js:89:26)
      at CdpCDPSession.send (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/CDPSession.js:66:33)
      at IsolatedWorld.adoptBackendNode (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/IsolatedWorld.js:109:46)
      at IsolatedWorld.adoptHandle (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/IsolatedWorld.js:126:28)
      at async CdpElementHandle.<anonymous> (/home/runner/work/Monitor-Premio/Monitor-Premio/node_modules/puppeteer-core/lib/cjs/puppeteer/api/ElementHandle.js:264:60)
}

Node.js v20.19.1
Error: Process completed with exit code 1.
