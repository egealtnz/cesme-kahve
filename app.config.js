// Extends app.json. Android push notifications (FCM) need google-services.json from Firebase; it is not
// committed. Locally put it in the project root; on EAS upload it as a file variable named
// GOOGLE_SERVICES_JSON (see LAUNCH.md, step 6).
const fs = require('node:fs');

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
