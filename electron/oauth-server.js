// Resilient loopback server binding for OAuth sign-in callbacks.
//
// Windows sometimes denies specific ports with EACCES (Hyper-V / WSL reserve
// random "excluded port ranges") and other apps may occupy the default port
// with EADDRINUSE. This helper tries a list of candidate ports and finally a
// dynamic (OS-assigned) port, binding to 127.0.0.1 only, and resolves with the
// actual bound port so the redirect URI can be built to match.
const net = require('net');

const DEFAULT_CANDIDATES = [58291, 58292, 58293, 58294, 58295, 58300, 0];

function listenWithFallback(server, preferredPort = 58291, host = '127.0.0.1') {
  const ports = [preferredPort, ...DEFAULT_CANDIDATES.filter((p) => p !== preferredPort)];

  return new Promise((resolve, reject) => {
    const tryPort = (index) => {
      if (index >= ports.length) {
        reject(new Error('Could not open a local port for the sign-in callback (all candidate ports are blocked).'));
        return;
      }
      const port = ports[index];

      const onError = (err) => {
        server.removeListener('error', onError);
        const code = err && err.code;
        if (code === 'EADDRINUSE' || code === 'EACCES' || code === 'EADDRNOTAVAIL' || code === 'EPERM') {
          console.warn(`OAuth callback port ${port || 'auto'} unavailable (${code}), trying next...`);
          tryPort(index + 1);
        } else {
          reject(err);
        }
      };

      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        const address = server.address();
        resolve(address && address.port ? address.port : port);
      });
    };

    tryPort(0);
  });
}

module.exports = { listenWithFallback, DEFAULT_CANDIDATES };
