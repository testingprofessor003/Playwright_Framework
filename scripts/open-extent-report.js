const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const extentDir = path.resolve(process.cwd(), 'reports', 'extent');
const latest = path.join(extentDir, 'latest.html');
const index = path.join(extentDir, 'index.html');
const report = fs.existsSync(latest) ? latest : index;

if (!fs.existsSync(report)) {
  console.error('Extent activity report not found. Run tests or npm run report:extent first.');
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
  if (report === latest && fs.existsSync(index)) {
    console.log(`Archive of all runs: ${index}`);
  }
});
