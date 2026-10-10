import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/lighter-api': {
        target: 'https://mainnet.zklighter.elliot.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lighter-api/, '/api/v1'),
      },
      '/hyperliquid-api': {
        target: 'https://api.hyperliquid.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hyperliquid-api/, ''),
      },
      '/coingecko-api': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko-api/, '/api/v3'),
      },
      '/buyback-api': {
        target: 'https://lighter-vs-hyperliquid.vercel.app/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/buyback-api/, ''),
      },
      '/llama-api': {
        target: 'https://api.llama.fi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llama-api/, ''),
      },
      '/binance-fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-fapi/, '/fapi'),
      },
      '/bybit-api': {
        target: 'https://api.bybit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bybit-api/, ''),
      },
      '/okx-api': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/okx-api/, '/api'),
      },
      '/bitget-api': {
        target: 'https://api.bitget.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bitget-api/, ''),
      },
      '/aster-api': {
        target: 'https://fapi.asterdex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aster-api/, '/fapi'),
      },
    },
  },
  preview: {
    proxy: {
      '/lighter-api': {
        target: 'https://mainnet.zklighter.elliot.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lighter-api/, '/api/v1'),
      },
      '/hyperliquid-api': {
        target: 'https://api.hyperliquid.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hyperliquid-api/, ''),
      },
      '/coingecko-api': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko-api/, '/api/v3'),
      },
      '/buyback-api': {
        target: 'https://lighter-vs-hyperliquid.vercel.app/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/buyback-api/, ''),
      },
      '/llama-api': {
        target: 'https://api.llama.fi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llama-api/, ''),
      },
      '/binance-fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-fapi/, '/fapi'),
      },
      '/bybit-api': {
        target: 'https://api.bybit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bybit-api/, ''),
      },
      '/okx-api': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/okx-api/, '/api'),
      },
      '/bitget-api': {
        target: 'https://api.bitget.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bitget-api/, ''),
      },
      '/aster-api': {
        target: 'https://fapi.asterdex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aster-api/, '/fapi'),
      },
    },
  },
})
