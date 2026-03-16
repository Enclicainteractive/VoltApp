import React, { useState } from 'react'
import { X, Lock, ShieldCheck, Key, RefreshCw, Users, Mic, Bot, AlertTriangle, CheckCircle, Copy, Eye, EyeOff, ChevronDown, ChevronRight, Smartphone, Server, MessageSquare, Video } from 'lucide-react'
import './Modal.css'
import './EncryptionInfoModal.css'

const EncryptionInfoModal = ({ onClose }) => {
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    keys: false,
    multiDevice: false,
    voice: false,
    bots: false,
    troubleshooting: false
  })

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const Section = ({ id, icon: Icon, title, children, defaultExpanded = false }) => {
    const isExpanded = expandedSections[id]
    return (
      <div className="encryption-section">
        <button 
          className="encryption-section-header"
          onClick={() => toggleSection(id)}
        >
          <div className="encryption-section-title">
            <Icon size={20} />
            <h3>{title}</h3>
          </div>
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {isExpanded && (
          <div className="encryption-section-content">
            {children}
          </div>
        )}
      </div>
    )
  }

  const FeatureCard = ({ icon: Icon, title, description, status = 'implemented' }) => (
    <div className={`feature-card ${status}`}>
      <div className="feature-icon">
        <Icon size={24} />
      </div>
      <div className="feature-content">
        <h4>{title}</h4>
        <p>{description}</p>
        {status === 'implemented' && (
          <span className="feature-status implemented">
            <CheckCircle size={12} /> Implemented
          </span>
        )}
        {status === 'partial' && (
          <span className="feature-status partial">
            <AlertTriangle size={12} /> Partial
          </span>
        )}
        {status === 'planned' && (
          <span className="feature-status planned">
            <RefreshCw size={12} /> Planned
          </span>
        )}
      </div>
    </div>
  )

  return (
    <div className="modal-overlay encryption-info-overlay" onClick={onClose}>
      <div className="modal-content encryption-info-modal" onClick={e => e.stopPropagation()}>
        <div className="encryption-info-header">
          <div className="encryption-info-title">
            <Lock size={28} className="encryption-icon" />
            <div>
              <h2>End-to-End Encryption</h2>
              <p>How VoltChat protects your messages and data</p>
            </div>
          </div>
          <button className="settings-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="encryption-info-content">
          <Section id="overview" icon={ShieldCheck} title="Overview" defaultExpanded={true}>
            <div className="encryption-overview">
              <p className="encryption-intro">
                VoltChat uses <strong>End-to-End Encryption (E2EE)</strong> to ensure that only you and the people you communicate with can read your messages. Not even VoltChat servers can access your encrypted content.
              </p>

              <div className="encryption-flow">
                <h4>How It Works</h4>
                <div className="flow-steps">
                  <div className="flow-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <h5>Key Generation</h5>
                      <p>Each server generates a unique symmetric encryption key when E2EE is enabled.</p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="step-number">2</div>
                    <div className="step-content">
                      <h5>User Enrollment</h5>
                      <p>Each user generates an asymmetric key pair (public/private) for the server.</p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="step-number">3</div>
                    <div className="step-content">
                      <h5>Key Distribution</h5>
                      <p>The server key is encrypted with each user's public key and distributed securely.</p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="step-number">4</div>
                    <div className="step-content">
                      <h5>Message Encryption</h5>
                      <p>All messages are encrypted with the server key before being sent.</p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="step-number">5</div>
                    <div className="step-content">
                      <h5>Message Decryption</h5>
                      <p>Recipients decrypt messages using their private key and the server key.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="encryption-benefits">
                <h4>Security Benefits</h4>
                <ul>
                  <li><CheckCircle size={16} /> <strong>Zero-Knowledge:</strong> Servers cannot read your messages</li>
                  <li><CheckCircle size={16} /> <strong>Forward Secrecy:</strong> Compromised keys don't reveal past messages</li>
                  <li><CheckCircle size={16} /> <strong>Key Rotation:</strong> Keys can be rotated without losing access to old messages</li>
                  <li><CheckCircle size={16} /> <strong>Multi-Device Support:</strong> Keys sync across all your devices</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="keys" icon={Key} title="Encryption Keys">
            <div className="keys-explanation">
              <h4>Types of Keys</h4>
              
              <div className="key-types">
                <div className="key-type">
                  <div className="key-type-header">
                    <Server size={20} />
                    <h5>Server Symmetric Key</h5>
                  </div>
                  <p>A single AES-256-GCM key shared among all members of an encrypted server. Used to encrypt/decrypt all messages in the server.</p>
                  <div className="key-details">
                    <span className="key-detail">Algorithm: AES-256-GCM</span>
                    <span className="key-detail">Storage: Encrypted with user's public key</span>
                  </div>
                </div>

                <div className="key-type">
                  <div className="key-type-header">
                    <Users size={20} />
                    <h5>User Key Pair</h5>
                  </div>
                  <p>Each user has an asymmetric key pair (RSA-OAEP or ECDH) for each encrypted server they join. The private key is never shared.</p>
                  <div className="key-details">
                    <span className="key-detail">Public Key: Shared with server</span>
                    <span className="key-detail">Private Key: Stored locally, encrypted</span>
                  </div>
                </div>

                <div className="key-type">
                  <div className="key-type-header">
                    <Smartphone size={20} />
                    <h5>Device Keys</h5>
                  </div>
                  <p>Each device gets a unique identifier. Keys are synced across devices using encrypted backups stored on the server.</p>
                  <div className="key-details">
                    <span className="key-detail">Device ID: UUID v4</span>
                    <span className="key-detail">Sync: Encrypted backup with password</span>
                  </div>
                </div>
              </div>

              <div className="key-storage">
                <h4>Key Storage</h4>
                <div className="storage-methods">
                  <div className="storage-method">
                    <h5>Local Storage (IndexedDB)</h5>
                    <p>Keys are stored in your browser's IndexedDB, encrypted with a password-derived key using PBKDF2 (100,000 iterations).</p>
                  </div>
                  <div className="storage-method">
                    <h5>Server Backup</h5>
                    <p>Encrypted backups are stored on the server for multi-device sync. The server cannot decrypt these backups without your password.</p>
                  </div>
                  <div className="storage-method">
                    <h5>Manual Export</h5>
                    <p>You can export all your keys to a JSON file encrypted with your password for safekeeping.</p>
                  </div>
                </div>
              </div>

              <div className="key-rotation">
                <h4>Key Rotation</h4>
                <p>Server owners can rotate the server encryption key at any time. The system maintains a history of previous keys for 24 hours, allowing decryption of messages sent before the rotation.</p>
                <div className="rotation-steps">
                  <div className="rotation-step">
                    <RefreshCw size={16} />
                    <span>New key is generated</span>
                  </div>
                  <div className="rotation-step">
                    <RefreshCw size={16} />
                    <span>Old key is saved to history</span>
                  </div>
                  <div className="rotation-step">
                    <RefreshCw size={16} />
                    <span>New key is distributed to all members</span>
                  </div>
                  <div className="rotation-step">
                    <RefreshCw size={16} />
                    <span>Old messages remain decryptable</span>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section id="multiDevice" icon={Smartphone} title="Multi-Device Sync">
            <div className="multi-device-explanation">
              <p className="multi-device-intro">
                VoltChat supports transparent key synchronization across multiple devices. When you log in on a new device, your encryption keys are automatically synced.
              </p>

              <div className="sync-features">
                <FeatureCard 
                  icon={RefreshCw}
                  title="Automatic Key Sync"
                  description="Keys are automatically synced to the server when you connect. New devices fetch the latest backup."
                  status="implemented"
                />
                <FeatureCard 
                  icon={Server}
                  title="Offline Key Queue"
                  description="If a device is offline when keys are updated, the changes are queued and synced when the device reconnects."
                  status="implemented"
                />
                <FeatureCard 
                  icon={Users}
                  title="Newcomer Support"
                  description="New users joining an encrypted server automatically receive the server key encrypted with their public key."
                  status="implemented"
                />
                <FeatureCard 
                  icon={ShieldCheck}
                  title="Conflict Resolution"
                  description="If multiple devices update keys simultaneously, the most recent update wins based on timestamp."
                  status="implemented"
                />
              </div>

              <div className="sync-flow">
                <h4>Sync Flow</h4>
                <div className="sync-diagram">
                  <div className="sync-node device">
                    <Smartphone size={24} />
                    <span>Device A</span>
                  </div>
                  <div className="sync-arrow">
                    <RefreshCw size={16} />
                  </div>
                  <div className="sync-node server">
                    <Server size={24} />
                    <span>VoltChat Server</span>
                  </div>
                  <div className="sync-arrow">
                    <RefreshCw size={16} />
                  </div>
                  <div className="sync-node device">
                    <Smartphone size={24} />
                    <span>Device B</span>
                  </div>
                </div>
                <ol className="sync-steps-list">
                  <li>Device A generates/updates encryption keys</li>
                  <li>Keys are encrypted with user's password</li>
                  <li>Encrypted backup is uploaded to server</li>
                  <li>Device B fetches the latest backup on connection</li>
                  <li>Device B decrypts backup with user's password</li>
                  <li>Keys are now available on both devices</li>
                </ol>
              </div>

              <div className="offline-support">
                <h4>Offline Device Support</h4>
                <p>When a device is offline, key updates are queued locally. When the device reconnects:</p>
                <ul>
                  <li>Queued updates are pushed to the server</li>
                  <li>Latest server backup is fetched</li>
                  <li>Conflicts are resolved using timestamps</li>
                  <li>Local key storage is updated</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="voice" icon={Mic} title="Voice Channel Encryption">
            <div className="voice-encryption-explanation">
              <p className="voice-intro">
                Voice channels in VoltChat use real-time encryption to protect your audio and video streams.
              </p>

              <div className="voice-features">
                <FeatureCard 
                  icon={Mic}
                  title="Audio Encryption"
                  description="Voice audio is encrypted using DTLS-SRTP with AES-128-GCM. Each participant has unique encryption keys."
                  status="implemented"
                />
                <FeatureCard 
                  icon={Video}
                  title="Video Encryption"
                  description="Video streams are encrypted using the same DTLS-SRTP protocol as audio."
                  status="implemented"
                />
                <FeatureCard 
                  icon={Key}
                  title="Per-Session Keys"
                  description="Each voice session generates unique ephemeral keys. Keys are discarded when the session ends."
                  status="implemented"
                />
                <FeatureCard 
                  icon={ShieldCheck}
                  title="End-to-End Protection"
                  description="Media is encrypted peer-to-peer. The server only relays encrypted packets and cannot access the content."
                  status="implemented"
                />
              </div>

              <div className="voice-protocol">
                <h4>Encryption Protocol</h4>
                <div className="protocol-details">
                  <div className="protocol-item">
                    <h5>Key Exchange</h5>
                    <p>DTLS (Datagram Transport Layer Security) for secure key exchange between peers</p>
                  </div>
                  <div className="protocol-item">
                    <h5>Media Transport</h5>
                    <p>SRTP (Secure Real-time Transport Protocol) for encrypted media streaming</p>
                  </div>
                  <div className="protocol-item">
                    <h5>Cipher Suite</h5>
                    <p>AES-128-GCM with 16-byte authentication tags</p>
                  </div>
                  <div className="protocol-item">
                    <h5>Key Rotation</h5>
                    <p>Keys rotate periodically during long sessions (every 60 minutes)</p>
                  </div>
                </div>
              </div>

              <div className="voice-security">
                <h4>Security Features</h4>
                <ul>
                  <li><CheckCircle size={16} /> <strong>Perfect Forward Secrecy:</strong> Compromised long-term keys don't reveal past sessions</li>
                  <li><CheckCircle size={16} /> <strong>Peer Authentication:</strong> Each participant is authenticated via certificates</li>
                  <li><CheckCircle size={16} /> <strong>Tamper Detection:</strong> Authentication tags detect any modification of media packets</li>
                  <li><CheckCircle size={16} /> <strong>Replay Protection:</strong> Sequence numbers prevent replay attacks</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="bots" icon={Bot} title="Wire Bot Library Integration">
            <div className="bots-explanation">
              <p className="bots-intro">
                The Wire bot library provides transparent E2EE support for bots, allowing them to send and receive encrypted messages without manual key management.
              </p>

              <div className="bot-features">
                <FeatureCard 
                  icon={Bot}
                  title="Automatic Key Management"
                  description="Bots automatically generate and manage encryption keys when joining encrypted servers."
                  status="implemented"
                />
                <FeatureCard 
                  icon={MessageSquare}
                  title="Transparent Encryption"
                  description="Bot messages are automatically encrypted before sending and decrypted after receiving."
                  status="implemented"
                />
                <FeatureCard 
                  icon={Key}
                  title="Key Storage"
                  description="Bot keys are stored securely in the bot's configuration, encrypted with a bot-specific secret."
                  status="implemented"
                />
                <FeatureCard 
                  icon={ShieldCheck}
                  title="Voice Support"
                  description="Bots can join encrypted voice channels and handle encrypted audio/video streams."
                  status="planned"
                />
              </div>

              <div className="bot-usage">
                <h4>Using E2EE with Wire Bots</h4>
                <div className="code-example">
                  <pre><code>{`// Wire bot with automatic E2EE
const { WireBot } = require('@voltchat/wire');

const bot = new WireBot({
  token: 'your-bot-token',
  autoEncryption: true  // Enable automatic E2EE
});

// Bot automatically handles encryption
bot.on('message', async (message) => {
  // Message is already decrypted
  console.log(message.content);
  
  // Response is automatically encrypted
  await message.reply('Hello!');
});

// Join encrypted server
await bot.joinServer('server-id');
// Keys are automatically fetched and stored`}</code></pre>
                </div>
              </div>

              <div className="bot-security">
                <h4>Bot Security Considerations</h4>
                <ul>
                  <li><AlertTriangle size={16} /> <strong>Bot Secrets:</strong> Keep bot tokens and encryption secrets secure</li>
                  <li><AlertTriangle size={16} /> <strong>Key Storage:</strong> Store bot keys in environment variables or secure vaults</li>
                  <li><CheckCircle size={16} /> <strong>Key Rotation:</strong> Rotate bot keys regularly for enhanced security</li>
                  <li><CheckCircle size={16} /> <strong>Access Control:</strong> Limit bot permissions to only what's necessary</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="troubleshooting" icon={AlertTriangle} title="Troubleshooting">
            <div className="troubleshooting-content">
              <div className="troubleshooting-item">
                <h4>Messages showing as encrypted content</h4>
                <p>If you see raw encrypted text instead of decrypted messages:</p>
                <ul>
                  <li>Check that you have the server encryption key (look for the E2EE badge)</li>
                  <li>Try leaving and rejoining the encrypted server</li>
                  <li>Clear your browser cache and reload</li>
                  <li>Check that your password is correct for key decryption</li>
                  <li>Try restoring keys from a backup if available</li>
                </ul>
              </div>

              <div className="troubleshooting-item">
                <h4>Keys not syncing across devices</h4>
                <p>If your keys aren't syncing to other devices:</p>
                <ul>
                  <li>Ensure you're using the same password on all devices</li>
                  <li>Check that you have an internet connection</li>
                  <li>Try manually exporting and importing keys</li>
                  <li>Verify that the server backup endpoint is accessible</li>
                  <li>Check browser console for sync errors</li>
                </ul>
              </div>

              <div className="troubleshooting-item">
                <h4>Cannot join encrypted server</h4>
                <p>If you're unable to join an encrypted server:</p>
                <ul>
                  <li>Ensure the server has E2EE enabled</li>
                  <li>Check that you have the necessary permissions</li>
                  <li>Verify your public key is registered with the server</li>
                  <li>Contact the server owner if you believe this is an error</li>
                </ul>
              </div>

              <div className="troubleshooting-item">
                <h4>Voice connection issues in encrypted channels</h4>
                <p>If you're having trouble with encrypted voice:</p>
                <ul>
                  <li>Check that your browser supports WebRTC and DTLS</li>
                  <li>Ensure you've granted microphone/camera permissions</li>
                  <li>Try disabling VPN or proxy temporarily</li>
                  <li>Check that STUN/TURN servers are configured correctly</li>
                  <li>Verify your firewall allows UDP traffic</li>
                </ul>
              </div>

              <div className="troubleshooting-item">
                <h4>Lost encryption keys</h4>
                <p>If you've lost your encryption keys:</p>
                <ul>
                  <li><AlertTriangle size={16} /> <strong>Warning:</strong> Lost keys cannot be recovered without a backup</li>
                  <li>Try restoring from a manual backup file if you have one</li>
                  <li>Check other devices that might have the keys</li>
                  <li>Contact server owner to re-enroll you in encryption</li>
                  <li>Note: You won't be able to decrypt old messages without the original keys</li>
                </ul>
              </div>

              <div className="troubleshooting-item">
                <h4>Getting Help</h4>
                <p>If you continue to experience issues:</p>
                <ul>
                  <li>Check the browser console for error messages</li>
                  <li>Report bugs on the VoltChat GitHub repository</li>
                  <li>Contact support through the official VoltChat Discord</li>
                  <li>Include server ID, device info, and error messages when reporting</li>
                </ul>
              </div>
            </div>
          </Section>
        </div>

        <div className="encryption-info-footer">
          <div className="encryption-notice">
            <ShieldCheck size={16} />
            <span>VoltChat uses industry-standard encryption protocols. However, no system is completely secure. Always practice good security hygiene.</span>
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default EncryptionInfoModal