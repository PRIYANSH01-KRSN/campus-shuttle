import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.snu.caddydriver',
  appName: 'SNU Caddy Driver',
  webDir: 'out',
  server: {
    url: 'https://snu-caddy.vercel.app',
    cleartext: true,
    androidScheme: 'https'
  }
};

export default config;
