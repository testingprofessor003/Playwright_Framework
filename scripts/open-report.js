const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const report = path.resolve(process.cwd(), 'reports', 'custom', 'failures.html');

if (!fs.existsSync(report)) {
  console.error('Custom report not found. Run npm run report:custom first.');
  process.exit(1);
}

const command =
  process.platform === 'win32'
    ? `start "" "${report}"`
    : process.platform === 'darwin'
      ? `open "${report}"`
      : `xdg-open "${report}"`;

exec(command, { shell: true }, (error) => {
  if (error) {
    console.error(`Could not open report: ${error.message}`);
    process.exit(1);
  }
  console.log(`Opened ${report}`);
});
