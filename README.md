# VoltApp

The frontend application for VoltChat - a modern real-time chat platform.

## Overview

VoltApp is a React-based web application that provides the user interface for VoltChat. It connects to the [Voltage](https://github.com/Enclicainteractive/Voltage) backend API for real-time messaging, voice channels, and user management.

## Features

- Real-time messaging with Socket.IO
- Voice channels with WebRTC
- Server and channel management
- Direct messages
- User authentication via Enclica Interactive OAuth 2.0
- Progressive Web App (PWA) support
- Face recognition for user verification
- Markdown message support
- Emoji picker
- Theme support (dark/light)

## Tech Stack

- React 18
- React Router v6
- Vite
- Socket.IO Client
- Axios
- Zustand (state management)
- SimplePeer (WebRTC)
- Lucide React (icons)
- face-api.js (facial recognition)
- tesseract.js (OCR)

## Prerequisites

- Node.js 18+
- npm or yarn
- A running [Voltage](https://github.com/Enclicainteractive/Voltage) backend server

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The app will be available at http://localhost:3000

## Building for Production

```bash
npm run build
```

Production files will be in the `dist` directory.

## Configuration

The frontend proxies API requests to the backend. By default:
- API: http://localhost:5000/api
- WebSocket: http://localhost:5000/socket.io

To change these settings, edit `vite.config.js`.

## Project Structure

```
VoltApp/
├── public/
│   ├── models/           # Face recognition models
│   └── sw.js             # Service worker
├── src/
│   ├── components/       # React components
│   │   └── modals/      # Modal components
│   ├── contexts/        # React contexts
│   ├── hooks/           # Custom hooks
│   ├── pages/           # Page components
│   ├── services/        # API services
│   ├── store/           # Zustand store
│   ├── theme/           # Theme configuration
│   ├── utils/           # Utilities
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── index.html
├── package.json
└── vite.config.js
```

## OAuth Configuration

VoltApp uses Enclica Interactive OAuth 2.0 for authentication. The redirect URI should point to:
```
http://localhost:3000/callback
```

## License

MIT License - feel free to use this project for learning and development.

## Related Projects

- [Voltage](https://github.com/Enclicainteractive/Voltage) - Backend API server
