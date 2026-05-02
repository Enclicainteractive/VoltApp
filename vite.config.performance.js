// Enhanced Vite configuration for performance optimization and bundle splitting
import { defineConfig } from 'vite'
import { resolve } from 'path'

export const performanceConfig = {
  build: {
    rollupOptions: {
      output: {
        // Enhanced manual chunk splitting for optimal loading
        manualChunks: {
          // Core React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          
          // UI framework and components
          'ui-vendor': [
            '@heroicons/react',
            'lucide-react'
          ],
          
          // Three.js and 3D components (for activities)
          '3d-vendor': [
            'three',
            '@react-three/fiber',
            '@react-three/drei'
          ],
          
          // Socket and real-time communication
          'socket-vendor': [
            'socket.io-client'
          ],
          
          // Date and utility libraries
          'utils-vendor': [
            'date-fns',
            'zustand',
            'emoji-name-map'
          ],
          
          // Activities (lazy loaded)
          'activities-main': [
            './src/activities/builtin/components/VoltCraftActivity.jsx',
            './src/activities/builtin/components/MiniGolfActivity.jsx'
          ],
          
          'activities-games': [
            './src/activities/builtin/components/ChessArenaActivity.jsx',
            './src/activities/builtin/components/TicTacToeActivity.jsx',
            './src/activities/builtin/components/ConnectFourActivity.jsx',
            './src/activities/builtin/components/PokerNightActivity.jsx'
          ],
          
          'activities-creative': [
            './src/activities/builtin/components/CollaborativeDrawingActivity.jsx',
            './src/activities/builtin/components/PixelArtActivity.jsx',
            './src/activities/builtin/components/SketchDuelActivity.jsx'
          ],
          
          'activities-media': [
            './src/activities/builtin/components/OurVidsActivity.jsx',
            './src/activities/builtin/components/BytebeatActivity.jsx'
          ],
          
          // Modals (lazy loaded)
          'modals-settings': [
            './src/components/modals/SettingsModal.jsx',
            './src/components/modals/ProfileModal.jsx',
            './src/components/modals/ServerSettingsModal.jsx'
          ],
          
          'modals-creation': [
            './src/components/modals/CreateServerModal.jsx',
            './src/components/modals/CreateChannelModal.jsx',
            './src/components/modals/JoinServerModal.jsx'
          ],
          
          // Admin and advanced features
          'admin-features': [
            './src/components/AdminPanel.jsx',
            './src/components/modals/AdminConfigModal.jsx'
          ]
        },
        
        // Dynamic chunk naming for cache busting
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
          
          if (facadeModuleId) {
            // Activity chunks
            if (facadeModuleId.includes('/activities/')) {
              return 'chunks/activities/[name]-[hash].js'
            }
            
            // Modal chunks
            if (facadeModuleId.includes('/modals/')) {
              return 'chunks/modals/[name]-[hash].js'
            }
            
            // Component chunks
            if (facadeModuleId.includes('/components/')) {
              return 'chunks/components/[name]-[hash].js'
            }
            
            // Service chunks
            if (facadeModuleId.includes('/services/')) {
              return 'chunks/services/[name]-[hash].js'
            }
          }
          
          return 'chunks/[name]-[hash].js'
        },
        
        // Asset naming for better caching
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          
          if (/\.(css)$/i.test(assetInfo.name)) {
            return 'assets/css/[name]-[hash][extname]'
          }
          
          return 'assets/[name]-[hash][extname]'
        }
      },
      
      // External dependencies to reduce bundle size
      external: (id) => {
        // Externalize large libraries that can be loaded from CDN
        const externals = [
          // Can be loaded from CDN if needed
          // 'react',
          // 'react-dom'
        ]
        return externals.includes(id)
      }
    },
    
    // Optimization settings
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    
    // Chunk size warnings
    chunkSizeWarningLimit: 1000, // Increase limit for large apps
    
    // Asset inlining threshold
    assetsInlineLimit: 4096, // 4KB threshold
    
    // Build performance
    reportCompressedSize: false, // Faster builds
    
    // CSS code splitting
    cssCodeSplit: true
  },
  
  // Optimization for dependencies
  optimizeDeps: {
    include: [
      // Pre-bundle these dependencies for faster loading
      'react',
      'react-dom',
      'react-router-dom',
      'socket.io-client',
      '@heroicons/react/24/outline',
      'lucide-react',
      'date-fns',
      'zustand'
    ],
    
    exclude: [
      // Don't pre-bundle these heavy dependencies
      'three',
      '@react-three/fiber',
      '@react-three/drei'
    ],
    
    // Force optimization for problematic packages
    force: true
  },
  
  // Development server optimizations
  server: {
    // Enable file watching optimizations
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**'
      ]
    }
  },
  
  // Resolve optimizations
  resolve: {
    alias: {
      // Create shorter import paths
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@services': resolve(__dirname, './src/services'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@contexts': resolve(__dirname, './src/contexts'),
      '@activities': resolve(__dirname, './src/activities'),
      '@assets': resolve(__dirname, './src/assets')
    }
  },
  
  // Plugin optimizations
  esbuild: {
    // Remove console logs in production
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug'] : [],
    
    // Keep function names for better debugging
    keepNames: true,
    
    // Tree shaking optimizations
    treeShaking: true
  }
}

export default performanceConfig