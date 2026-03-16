# Volt Activities SDK (VAS Wrapper)

This folder wraps the standalone `VAS` library in `/VAS`.

- Wrapper file: `src/sdk/activities-sdk.js`
- Core implementation: `../../VAS/src/client/vas-sdk.js`

## Features

- OAuth authorize/token flow helpers
- Realtime activity state + events
- Optional P2P datachannel mesh with server fallback
- Sound cues support
- Role-aware sessions (host/participant/spectator)

## Quick usage

```js
import { createVoltActivitySDK } from './activities-sdk'

const vas = createVoltActivitySDK({
  socket,
  apiBase: '/api/activities',
  contextType: 'voice',
  contextId: 'channel_1',
  sessionId: 'acts_1',
  p2p: { enabled: true },
  sound: { enabled: true, volume: 0.8 }
})

vas.connectSession()
vas.updateState({ score: { a: 2, b: 1 } })
vas.emitEvent('round:start', { round: 3 }, { cue: 'round_start' })
```

## Example pack

See `/VAS/examples` for 10 examples, including live mouse position sync.
