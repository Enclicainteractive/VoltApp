# Voice Channel Fixes - Analysis and Implementation

## Issues Identified

### 1. **postMessage on disconnected port errors**
- **Root Cause**: ScriptProcessorNode (used in VoiceFX) continues firing `onaudioprocess` events after the AudioContext is closed or the node is disconnected
- **Impact**: Causes console spam and potential memory leaks
- **Fix**: Add `_isActive` flag to all processors and check before processing; set to false before disconnecting

### 2. **"Processing" state stuck / Disconnection not showing**
- **Root Cause**: Multiple issues:
  - Participants marked as `isReconnecting` but never cleared when they actually leave
  - Grace period timers (8s) too long, making it look like users are still connected
  - Peer state not properly cleaned up on disconnect
- **Fix**: 
  - Reduce grace period to 3-5 seconds
  - Properly clear reconnecting state when user actually leaves
  - Emit proper disconnect events immediately

### 3. **Only 2 people can connect**
- **Root Cause**: Connection queue processing issues:
  - `canAcceptPeer()` returns false after 2 peers due to capacity limits
  - `MAX_CONNECTED_PEERS = 100` but tier config limits concurrent negotiations
  - Queue gets stuck when `activeNegotiationsRef.current >= maxConcurrent`
- **Fix**:
  - Remove artificial peer limits
  - Fix queue processing to not get stuck
  - Increase concurrent negotiation limits

### 4. **People struggle to connect**
- **Root Cause**: Multiple connection issues:
  - Too many STUN/TURN servers (warning shows 5+ servers)
  - Aggressive cooldown timers preventing reconnection
  - Exponential backoff too aggressive
  - ICE restart happening too frequently
- **Fix**:
  - Reduce STUN/TURN server list to 3-4 reliable servers
  - Reduce cooldown timers
  - Make reconnection logic less aggressive
  - Only restart ICE when truly needed

## Implementation Plan

1. Fix VoiceFX ScriptProcessor cleanup
2. Fix participant disconnection handling
3. Remove connection limits
4. Optimize STUN/TURN configuration
5. Improve connection queue processing
6. Add better error recovery
