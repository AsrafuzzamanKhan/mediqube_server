const crypto = require('crypto');

/**
 * Generates a full ZegoCloud Kit Token (same format as generateKitTokenForTest,
 * but using Node.js crypto so the server secret never leaves the backend).
 * Returns the complete kit token — pass directly to ZegoUIKitPrebuilt.create().
 */
function generateKitToken(appID, userID, userName, roomID, serverSecret, expireSeconds = 3600) {
  const n = Math.floor(Date.now() / 1000);
  const expire = n + expireSeconds;

  const s = {
    app_id: appID,
    user_id: userID,
    nonce: Math.floor(2147483647 * Math.random()),
    ctime: n,
    expire,
  };

  let g = Math.random().toString().substring(2, 18);
  if (g.length < 16) g += g.substring(0, 16 - g.length);

  const key    = Buffer.from(serverSecret, 'utf8');
  const ivBuf  = Buffer.from(g, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, ivBuf);
  const h      = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(s), 'utf8')), cipher.final()]);
  const c      = h.length;

  const C = Buffer.alloc(28 + c);
  C.writeUInt32BE(0, 0);
  C.writeInt32BE(expire, 4);
  C.writeUInt8(g.length >> 8, 8);
  C.writeUInt8(g.length & 0xff, 9);
  Buffer.from(g, 'utf8').copy(C, 10);
  C.writeUInt8(c >> 8, 26);
  C.writeUInt8(c & 0xff, 27);
  h.copy(C, 28);

  const token04  = `04${C.toString('base64')}`;
  const metadata = Buffer.from(JSON.stringify({
    userID,
    roomID,
    userName: encodeURIComponent(userName || ''),
    appID,
  })).toString('base64');

  return `${token04}#${metadata}`;
}

module.exports = { generateKitToken };
