/**
 * Minimal loopback SMTP fixture for recovery-email integration tests. Capture
 * message bodies through a real SMTP conversation without authenticating to or
 * sending mail through an external provider.
 */
import { createServer } from 'node:net';

/**
 * Listen on an ephemeral loopback port and return the server plus captured
 * messages. Buffer partial TCP lines and unescape SMTP dot-stuffed DATA lines.
 */
export async function smtpFixture() {
  const messages: string[] = [];
  const server = createServer((socket) => {
    let pending = '',
      data = false,
      message: string[] = [];
    socket.setEncoding('utf8');
    socket.write('220 DevTrack test mail server\r\n');
    socket.on('data', (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        // SMTP DATA ends at a lone dot; doubled leading dots represent message text.
        if (data) {
          if (line === '.') {
            messages.push(message.join('\r\n'));
            message = [];
            data = false;
            socket.write('250 Message accepted\r\n');
          } else message.push(line.replace(/^\.\./, '.'));
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 test.local\r\n');
        else if (/^DATA/i.test(line)) {
          data = true;
          socket.write('354 Send message\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No SMTP fixture address');
  return { server, messages, port: address.port };
}
