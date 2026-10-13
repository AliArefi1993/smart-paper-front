import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aliarefi.smartpaper',
  appName: 'Smart Paper',
  // Reports may contain voluntary private text; never log bridge arguments.
  loggingBehavior: 'none',
  webDir: 'out'
};

export default config;
