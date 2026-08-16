const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const report = path.resolve(process.cwd(), 'reports', 'extent', 'index.html');

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
});
