import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.snu.caddydriver',
  appName: 'SNU Caddy Driver',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
