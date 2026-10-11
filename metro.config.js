// Keeps the preview-only demo backend (src/lib/demo/client.ts) out of real builds:
// unless EXPO_PUBLIC_DEMO=1, imports of demo/client resolve to an empty stub.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_PUBLIC_DEMO !== '1') {
  const stub = path.resolve(__dirname, 'src/lib/demo/disabled.js');
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (/(^|\/)demo\/client$/.test(moduleName)) return { type: 'sourceFile', filePath: stub };
    return (upstream ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
