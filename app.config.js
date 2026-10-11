// Extends app.json. Android push notifications (FCM) need google-services.json from Firebase. It sits in the
// project root and is committed (it only identifies the Firebase project and ships inside every APK anyway;
// the private FCM key lives in Expo's credentials, never here). GOOGLE_SERVICES_JSON can point elsewhere.
const fs = require('node:fs');

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
