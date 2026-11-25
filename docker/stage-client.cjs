// Container-only: relocate generated artifacts, never rewrite the managed schema.
const fs = require('node:fs');
const path = require('node:path');
function stageClient(root) {
  const schemaDir = path.join(root, 'prisma');
  const schema = fs.readFileSync(path.join(schemaDir, 'schema.prisma'), 'utf8');
  const block = schema.match(/generator\s+client\s*\{([^}]+)\}/);
  const output = block && block[1].match(/\boutput\s*=\s*"([^"]+)"/);
  const destination = path.join(root, 'node_modules/.prisma/client');
  const source = output ? path.resolve(schemaDir, output[1]) : destination;
  if (!fs.existsSync(path.join(source, 'index.js'))) {
    throw new Error('Generated client is missing. Run the generation step before staging.');
  }
  if (source !== destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, force: true });
  }
  const { PrismaClient } = require(path.join(root, 'node_modules/@prisma/client'));
  const client = new PrismaClient();
  if (!client.controlDefinition || !client.user) throw new Error('Generated application models are missing.');
  console.log('Generated database client staged and imported successfully.');
}
module.exports = { stageClient };
if (require.main === module) stageClient(process.cwd());
