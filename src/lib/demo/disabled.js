// Stand-in for demo/client in real builds (see metro.config.js). Never called there.
module.exports = {
  createDemoClient() { throw new Error('Demo backend is not part of this build (set EXPO_PUBLIC_DEMO=1).'); },
  resetDemo: async () => {},
};
