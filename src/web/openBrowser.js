const { exec } = require('node:child_process');

const logger = require('../utils/logger');

// Detects Termux (Android) via the environment variables it exposes. Other
// platforms are detected through Node's `process.platform`.
function isTermux() {
  return Boolean(process.env.TERMUX_VERSION) || /com\.termux/.test(process.env.PREFIX || '');
}

// Builds the ordered list of shell commands that may open a URL in the user's
// default browser, most specific first.
function candidates(url) {
  if (isTermux()) {
    return [
      `termux-open-url "${url}"`,
      `am start -a android.intent.action.VIEW -d "${url}"`
    ];
  }

  switch (process.platform) {
    case 'darwin':
      return [`open "${url}"`];
    case 'win32':
      return [`cmd /c start "" "${url}"`, `start "${url}"`];
    default:
      // Linux, WSL and other POSIX systems.
      return [`xdg-open "${url}"`, `gio open "${url}"`];
  }
}

function tryCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 5000 }, (error) => resolve(!error));
  });
}

// Opens `url` in the default system browser. Never throws: if every strategy
// fails the URL is logged so the user can still reach the dashboard manually.
async function openBrowser(url) {
  for (const command of candidates(url)) {
    if (await tryCommand(command)) return;
  }

  logger.warn(`Could not open a browser automatically. Visit ${url} to open the dashboard.`);
}

module.exports = { openBrowser };
