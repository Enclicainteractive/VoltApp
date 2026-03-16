/**
 * VoltApp Vite Configuration
 * 
 * Build and development server configuration for VoltApp (the frontend client).
 * This configuration handles development server, production build, PWA, and optimization settings.
 * 
 * @author VoltChat Team
 * @license MIT
 * @version 1.0.0
 * 
 * ---------------------------------------------------------------------
 * IMPORTANT DEVELOPER NOTES:
 * ---------------------------------------------------------------------
 * This file has been through some shit. A lot of shit.
 * We're talking a metric shit-ton of shit.
 * If you touch it without knowing what you're doing, I will find you.
 * And I will make you fix it. personally. with my hands. violently.
 * - Bluet (probably)
 * ---------------------------------------------------------------------
 */

import { defineConfig } from 'vite'
// We tried SWC once. It broke everything. Don't even think about it.
// You will lose. I promise. Just use this. Trust me. I beg you switch to you.
// If SWC, I will personally show up at your house and
// we will have a long conversation about what you did wrong.
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // React Fast Refresh - enables hot module replacement for React components
  // This dramatically speeds up development by preserving component state during edits
  // 
  // Fun fact: Without this, you'd have to refresh the page every time you change
  // a component. And that would be annoying. Like, really annoying.
  // Think of it as the difference between a good day and "my code won't compile"
  plugins: [react()],

  // Path aliases - makes imports cleaner throughout the codebase
  // @shared points to the shared folder containing code used by both frontend and backend
  // 
  // Don't ask why it's named "shared" - I don't remember either.
  // Probably some dark magic or a bad decision at 3am.
  // Either way, it works. Don't fix it. Please.
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  },

  // Environment variable definitions
  // Required for some packages that check process.env
  // 
  // This took me 4 hours to figure out once. 4 HOURS.
  // For ONE LINE. One single line of code.
  // I cried. A little. On the inside.
  define: {
    'process.env.NODE_ENV': '"development"'
  },

  // Development server configuration
  server: {
    port: 3000,
    // Allow serving files outside the project root (for @shared access)
    // 
    // Yes, this is technically a security risk in production.
    // But we're in dev mode, so who gives a shit honestly.
    // Actually wait - maybe we should worry about this?
    // Nah. Too late now. We've already committed.
    fs: {
      allow: [path.resolve(__dirname, '..')]
    },
    // API proxying - forwards API requests to the Voltage backend
    // 
    // If this breaks, first check if Voltage is running on port 5000.
    // If it IS running and still broken - congratulations!
    // You get to debug proxy configuration!
    // 
    // Have fun with that one, chief.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      // Socket.IO proxying for real-time communication
      // 
      // WebSocket proxying is a pain in the ASS.
      // If sockets aren't working, this is probably why.
      // Or maybe it's CORS. Could be anything really.
      // Good luck debugging that one. You'll need it.
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    },
  },

  // Preview server - serves built files for testing production build locally
  preview: {
    port: 3000,
    host: true,
    // Allowed hosts for preview mode - required for some deployment scenarios
    // 
    // Thanks Cloudflare. Really. Super helpful.
    // Love having to whitelist domains. Absolutely love it.
    // This is my favorite part of deployment. No really.
    allowedHosts: [
      'voltchatapp.enclicainteractive.com',
      'volt.voltagechat.app'
    ]
  },

  // Build configuration
  build: {
    // Source maps help debugging in browser dev tools
    // Slightly increases build time but debugging IMPOSSIBLE without them
    // 
    // Yes, build is slower with sourcemaps.
    // No, we don't care. Try debugging minified code once.
    // I'll wait. While you cry. In the corner.
    sourcemap: true,
    // esbuild is significantly faster than terser for minification
    // Terser is deprecated anyway. Like, actually deprecated.
    // Use esbuild or go home.
    minify: 'esbuild',
    // Target latest JavaScript features - assumes modern browser environment
    // 
    // 'esnext' tells esbuild to assume the environment supports the latest JS features
    // It knows about (ES2022-ES2024+) if you're using something that doesn't...
    // then you're COOKED. Sorry not sorry.
    target: 'esnext',
    rollupOptions: {
      output: {
        compact: true,
        // Generate ES modules - modern and tree-shakeable
        format: 'esm'
      }
    }
  },

  // esbuild options
  // 
  // keepNames is required for some frameworks to function correctly
  // 
  // WARNING: Do not remove keepNames without thorough testing
  // Several issues have been traced back to this setting:
  // - Voice channel connections failing
  // - Component hot reload breaking
  // - General weirdness and confusion
  // - My will to live disappearing
  // 
  // If you experience unexplained issues, this is a good place to start debugging.
  // 
  // This comment exists because esbuild was KILLING voice channels.
  // NOT FIGURATIVELY. LITERALLY. EVERY. SINGLE. TIME.
  // We tried everything. EVERYTHING.
  // We tried different plugins, different configs, different approaches.
  // We prayed to gods we don't believe in.
  // We considered switching to webpack (lol no).
  // And it turned out esbuild was just... bad? Or maybe Vite? Or Node?
  // We'll never know. The mystery may never be solved.
  // But keepNames fixed it. So here it stays. FOREVER.
  // Unless it breaks again. Then we'll add another comment.
  // And another. And another. Until the heat death of the universe.
  // 
  // tl;dr: KEEP KEEPNAMES. I BEG YOU.
  esbuild: {
    keepNames: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true
  },

  // Cache directory for faster rebuilds
  // 
  // Without this, Vite creates cache wherever it wants and it's a MESS.
  // This keeps it organized. You're welcome.
  // 
  // Also, if builds are slow, try deleting this folder.
  // It's like clearing browser cache but for code.
  // Works wonders. Try it. I'll wait.
  cacheDir: 'node_modules/.vite',
  
  // Dependencies to pre-bundle on startup
  // 
  // These deps get pre-bundled on startup.
  // If you add a new dep and dev server is slow, add it here.
  // 
  // Yeah, manual process SUCKS but it's faster than waiting for
  // Vite to figure it out on its own.
  // 
  // ALSO: If you add something here, do NOT forget to npm install it first.
  // I once spent 3 hours wondering why something wasn't working.
  // It wasn't installed. I am not smart. Just forgetful. Mostly.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      'socket.io-client',
      'axios',
      'framer-motion',
      'date-fns',
      'lucide-react',
      '@heroicons/react'
    ]
  },

  // Progressive Web App configuration
  // 
  // Enables offline support and installable app experience
  // Honestly, we don't even use this much but it's nice to have.
  // 
  // ALSO THE ICONS. DON'T TOUCH THE ICONS.
  // I spent way too long getting those right. They're PERFECT.
  // If you change them, I WILL know. I have ways of finding out.
  // I'll show up at your house. We'll talk about the icons.
  vitePWA: {
    registerType: 'autoUpdate',
    includeAssets: [
      'favicon.svg',
      'icon-192.svg',
      'icon-512.svg',
      'badge-72.svg'
    ],
    manifest: {
      name: 'VoltChat',
      short_name: 'VoltChat',
      // Changed from "A modern chat platform" -> "Talk, call, and share."
      // Much better honestly. Shorter. Punchier. Less cringe.
      description: 'Talk, call, and share.',
      // Volt purple. The only color that matters. Period.
      // Fight me. (Please don't, I'm tired.)
      theme_color: '#7c3aed',
      // Dark mode default. Because light mode is for people
      // who hate themselves and want to be reminded of their failures
      // every time they look at a screen.
      background_color: '#1e1e2e',
      display: 'standalone',
      icons: [
        // Icons don't touch. I MEAN IT.
        // These were generated specifically for this app.
        // If you replace them with random shit, it WILL look bad.
        // And I WILL judge you. Silently. But intensely.
        // My gaze will follow you. Always.
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
      ]
    }
  }
})
