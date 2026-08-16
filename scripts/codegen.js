const { execSync } = require('child_process');

const url =
  process.env.npm_config_url ||
  process.env.CODEGEN_URL ||
  process.env.BASE_URL ||
  'https://example.com';
const browser = process.env.npm_config_browser || process.env.BROWSER || 'chromium';
const device = process.env.npm_config_device;

const args = ['playwright', 'codegen', '--browser', browser];
if (device) {
  args.push('--device', device);
}
args.push(url);

execSync(`npx ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, {
  stdio: 'inherit',
  shell: true,
});
