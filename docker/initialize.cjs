const { spawnSync } = require('node:child_process');
function validateDatabase(env) {
  if (env.PORTABLE_INIT !== '1') throw new Error('Portable initialization must be explicitly enabled.');
  const url = new URL(env.DATABASE_URL || '');
  if (url.hostname !== 'db' || url.pathname !== '/cyberassurance') {
    throw new Error('Initialization is restricted to the local Compose database. No changes made.');
  }
}
function initialize() {
  validateDatabase(process.env);
  for (const args of [['prisma', 'db', 'push', '--skip-generate'], ['prisma', 'db', 'seed']]) {
    const result = spawnSync('yarn', args, { stdio: 'inherit', env: process.env });
    if (result.error || result.status !== 0) {
      throw new Error('Initialization stopped. Review the error; do not use reset or accept-data-loss flags.');
    }
  }
  console.log('Controls initialized. Existing users and assessments were not reset.');
}
module.exports = { validateDatabase };
if (require.main === module) {
  try { initialize(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
