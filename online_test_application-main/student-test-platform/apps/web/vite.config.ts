import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0',
    // Port 80 so LAN/hostname access needs no port in the URL (http://thinkplus.test).
    // Dev mode (`vite`, not `vite preview`) is untouched and still defaults to 5173.
    port: 80,
    // Vite rejects unrecognized Host headers by default (DNS-rebinding protection),
    // which would 403 requests arriving as "thinkplus.test" once DNS/hosts resolve it.
    allowedHosts: ['thinkplustest', 'thinkplus.test', 'localhost', '192.168.29.196'],
  },
})
