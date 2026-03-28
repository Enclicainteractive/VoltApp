import React from 'react'

const SURFACE = 'rgba(2, 12, 22, 0.82)'
const PANEL = 'rgba(15, 23, 42, 0.72)'
const BORDER = 'rgba(148, 163, 184, 0.18)'
const MUTED = '#94a3b8'
const TEXT = '#e2e8f0'
const BRIGHT = '#f8fafc'
const READY = '#4ade80'
const NOT_READY = '#f87171'

const baseButtonStyle = {
  borderRadius: 14,
  fontWeight: 800,
  padding: '14px 16px',
  cursor: 'pointer',
  transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
  boxShadow: '0 14px 32px rgba(0, 0, 0, 0.18)'
}

const uppercaseMetaStyle = {
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase'
}

const statCardStyle = {
  padding: 10,
  borderRadius: 12,
  background: PANEL
}

const overlayButtonStyle = {
  ...baseButtonStyle,
  border: `1px solid ${BORDER}`,
  background: 'rgba(15, 23, 42, 0.88)',
  color: TEXT
}

function getObjectiveLabel(objective) {
  return objective === 'race' ? 'Race' : 'Dogfight'
}

function getProgressLabel({ objective, phase, player, lapTarget, scoreTarget }) {
  if (phase !== 'live') return player.ready ? 'Ready' : 'Not Ready'
  if (objective === 'race') return `${player.laps || 0}/${lapTarget}`
  return `${player.score || 0}/${scoreTarget}`
}

function getFlightHint(mode) {
  return mode?.objective === 'race'
    ? 'Fly every checkpoint ring, protect your line through corners, and finish all laps first.'
    : 'Use boost and repair pickups, control your merge angles, and secure the kill limit before the other pilots.'
}

function getBriefing(mode) {
  return mode?.objective === 'race'
    ? 'Race maps use wider sky corridors, faster craft pacing, and checkpoint pressure. Everyone needs to ready before launch.'
    : 'Combat maps use pickups, bigger engagement spaces, and ballistic cannon rounds with travel time and drop.'
}

function getCraft(crafts, craftId) {
  return crafts.find((craft) => craft.id === craftId) || crafts[0] || {
    id: 'fallback',
    name: 'Interceptor',
    hp: 100,
    speed: 0,
    turn: 0,
    damage: 0,
    color: '#38bdf8'
  }
}

function TelemetryPill({ label, value, accent }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 3,
        minWidth: 92
      }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED }}>{label}</div>
      <div style={{ color: accent || BRIGHT, fontWeight: 800, fontSize: 13 }}>{value}</div>
    </div>
  )
}

function FlightInfoPanel({ mode, status }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        width: 336,
        background: SURFACE,
        border: `1px solid ${mode.accent}33`,
        borderRadius: 20,
        padding: 16,
        backdropFilter: 'blur(14px)',
        boxShadow: '0 20px 55px rgba(0, 0, 0, 0.26)'
      }}
    >
      <div style={{ ...uppercaseMetaStyle, color: mode.accent, marginBottom: 6 }}>Three.js Flight Ops</div>
      <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 0.94 }}>{mode.title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, marginTop: 8 }}>{mode.subtitle}</div>
      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: BRIGHT,
          lineHeight: 1.55,
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.6)',
          border: `1px solid ${mode.accent}22`
        }}
      >
        {status}
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={statCardStyle}>
          <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase' }}>Mode</div>
          <div style={{ marginTop: 4, fontWeight: 800 }}>{getObjectiveLabel(mode.objective)}</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase' }}>Map Span</div>
          <div style={{ marginTop: 4, fontWeight: 800 }}>{mode.worldRadius * 2}m</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
        <div>`W/S` throttle, `A/D` yaw, `Arrow Up/Down` pitch, `Space` fire.</div>
        <div>{getFlightHint(mode)}</div>
      </div>
    </div>
  )
}

function LeaderboardPanel({ mode, leaderboard, userId, phase, lapTarget, scoreTarget, crafts }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 292,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        padding: 16,
        backdropFilter: 'blur(14px)',
        boxShadow: '0 20px 55px rgba(0, 0, 0, 0.24)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>Ready Board</div>
        <div style={{ ...uppercaseMetaStyle, color: mode.accent, fontSize: 10 }}>Live Queue</div>
      </div>
      {leaderboard.map((player, index) => {
        const craft = getCraft(crafts, player.craftId)
        return (
          <div
            key={player.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              gap: 10,
              alignItems: 'center',
              marginBottom: index === leaderboard.length - 1 ? 0 : 10,
              padding: '9px 10px',
              borderRadius: 14,
              background: index === 0 ? 'rgba(15, 23, 42, 0.78)' : 'rgba(15, 23, 42, 0.46)',
              border: index === 0 ? `1px solid ${mode.accent}33` : '1px solid transparent'
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 999, background: player.color, boxShadow: `0 0 0 3px ${player.color}22` }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>
                {index + 1}. {player.username}
                {player.id === userId ? ' (you)' : ''}
              </div>
              <div style={{ color: MUTED, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {craft.name}
              </div>
            </div>
            <div style={{ color: getProgressLabel({ objective: mode.objective, phase, player, lapTarget, scoreTarget }) === 'Not Ready' ? NOT_READY : READY, fontWeight: 800, fontSize: 12 }}>
              {getProgressLabel({ objective: mode.objective, phase, player, lapTarget, scoreTarget })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TelemetryBar({ mode, me, lapTarget }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(2, 12, 22, 0.88)',
        border: `1px solid ${BORDER}`,
        borderRadius: 999,
        padding: '12px 18px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 18,
        alignItems: 'center',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.28)'
      }}
    >
      <TelemetryPill label="Craft" value={me.craftName} accent={me.craftColor} />
      <TelemetryPill label="Hull" value={Math.max(0, Math.round(me.hp || 0))} />
      <TelemetryPill label="Throttle" value={`${Math.round((me.throttle || 0) * 100)}%`} />
      <TelemetryPill
        label={mode.objective === 'race' ? 'Race' : 'Combat'}
        value={mode.objective === 'race' ? `Laps ${me.laps || 0}/${lapTarget}` : `K/D ${me.score || 0}/${me.deaths || 0}`}
      />
    </div>
  )
}

function CraftCard({ craft, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(craft.id)}
      style={{
        borderRadius: 18,
        border: active ? `1px solid ${craft.color}` : `1px solid ${BORDER}`,
        background: active ? `${craft.color}18` : 'rgba(15, 23, 42, 0.78)',
        color: TEXT,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: active ? `0 16px 35px ${craft.color}22` : 'none'
      }}
    >
      <div style={{ fontWeight: 800 }}>{craft.name}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: MUTED, lineHeight: 1.45 }}>
        SPD {craft.speed} • TURN {craft.turn.toFixed(2)} • DMG {craft.damage}
      </div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        <div style={{ padding: '6px 8px', borderRadius: 10, background: 'rgba(2, 6, 12, 0.34)', fontSize: 11 }}>
          <div style={{ color: MUTED }}>Hull</div>
          <div style={{ marginTop: 2, fontWeight: 800 }}>{craft.hp}</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 10, background: 'rgba(2, 6, 12, 0.34)', fontSize: 11 }}>
          <div style={{ color: MUTED }}>Boost</div>
          <div style={{ marginTop: 2, fontWeight: 800 }}>{craft.boost || 'Std'}</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 10, background: 'rgba(2, 6, 12, 0.34)', fontSize: 11 }}>
          <div style={{ color: MUTED }}>Role</div>
          <div style={{ marginTop: 2, fontWeight: 800 }}>{craft.role || 'All-Round'}</div>
        </div>
      </div>
    </button>
  )
}

function LobbyOverlay({
  mode,
  phase,
  crafts,
  selectedCraft,
  onCraftSelect,
  me,
  isHost,
  allReady,
  onReadyToggle,
  onLaunch,
  onResetToLobby,
  winnerName
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(2, 6, 12, 0.56)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div
        style={{
          width: 'min(980px, 92vw)',
          borderRadius: 28,
          background: 'rgba(3, 10, 19, 0.94)',
          border: `1px solid ${mode.accent}44`,
          boxShadow: '0 28px 100px rgba(0, 0, 0, 0.45)',
          padding: 24,
          display: 'grid',
          gridTemplateColumns: '1.18fr 0.82fr',
          gap: 22
        }}
      >
        <div>
          <div style={{ ...uppercaseMetaStyle, color: mode.accent, marginBottom: 6 }}>Loadout + Ready</div>
          <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 0.94 }}>{phase === 'finished' ? 'Run It Again' : mode.title}</div>
          <div style={{ marginTop: 10, fontSize: 14, color: MUTED, lineHeight: 1.6 }}>{mode.subtitle}</div>
          {winnerName ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 14,
                color: BRIGHT,
                padding: '10px 12px',
                borderRadius: 14,
                background: 'rgba(15, 23, 42, 0.72)',
                border: `1px solid ${mode.accent}22`
              }}
            >
              Winner: {winnerName}
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 18 }}>
            {crafts.map((craft) => (
              <CraftCard key={craft.id} craft={craft} active={selectedCraft === craft.id} onSelect={onCraftSelect} />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 18, background: PANEL, border: `1px solid ${BORDER}` }}>
            <div style={{ ...uppercaseMetaStyle, fontSize: 11, color: MUTED }}>Flight Brief</div>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.65, color: TEXT }}>{getBriefing(mode)}</div>
          </div>

          <div style={{ padding: 16, borderRadius: 18, background: PANEL, border: `1px solid ${BORDER}` }}>
            <div style={{ ...uppercaseMetaStyle, fontSize: 11, color: MUTED }}>Current Loadout</div>
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, color: BRIGHT }}>{me.craftName}</div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(2, 6, 12, 0.36)' }}>
                <div style={{ color: MUTED, fontSize: 11 }}>Hull</div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>{Math.round(me.hp || 0)}</div>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(2, 6, 12, 0.36)' }}>
                <div style={{ color: MUTED, fontSize: 11 }}>{mode.objective === 'race' ? 'Launch' : 'Objective'}</div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>{mode.objective === 'race' ? 'Checkpoint Race' : 'Takedown Limit'}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              onClick={onReadyToggle}
              style={{
                ...baseButtonStyle,
                border: me.ready ? '1px solid #22c55e' : `1px solid ${BORDER}`,
                background: me.ready ? 'linear-gradient(135deg, #15803d, #22c55e)' : 'rgba(15, 23, 42, 0.88)',
                color: 'white'
              }}
            >
              {me.ready ? 'Ready Confirmed' : 'Mark Ready'}
            </button>

            {isHost ? (
              <button
                type="button"
                onClick={onLaunch}
                disabled={!allReady}
                style={{
                  ...baseButtonStyle,
                  border: '1px solid transparent',
                  background: allReady ? `linear-gradient(135deg, ${mode.accent}, #22d3ee)` : 'rgba(30, 41, 59, 0.78)',
                  color: allReady ? '#020617' : MUTED,
                  cursor: allReady ? 'pointer' : 'not-allowed',
                  boxShadow: allReady ? `0 18px 40px ${mode.accent}33` : 'none'
                }}
              >
                Launch {mode.title}
              </button>
            ) : null}

            {isHost && phase === 'finished' ? (
              <button type="button" onClick={onResetToLobby} style={overlayButtonStyle}>
                Back To Lobby
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function CountdownOverlay({ mode, countdown }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ textAlign: 'center', color: BRIGHT, textShadow: '0 12px 36px rgba(0, 0, 0, 0.45)' }}>
        <div style={{ fontSize: 18, letterSpacing: '0.2em', textTransform: 'uppercase', color: mode.accent }}>Launch Sequence</div>
        <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 0.9 }}>{countdown || 'GO'}</div>
      </div>
    </div>
  )
}

export default function FlightActivityHud({
  mode,
  status,
  leaderboard = [],
  userId,
  phase,
  me,
  crafts = [],
  selectedCraft,
  onCraftSelect,
  isHost = false,
  allReady = false,
  onReadyToggle,
  onLaunch,
  onResetToLobby,
  winnerName = null,
  countdown = 0,
  lapTarget = 3,
  scoreTarget = 10
}) {
  if (!mode || !me) return null

  const currentCraft = getCraft(crafts, me.craftId)
  const meWithCraft = {
    ...me,
    craftColor: currentCraft.color,
    craftName: currentCraft.name
  }

  return (
    <>
      <FlightInfoPanel mode={mode} status={status} />
      <LeaderboardPanel
        mode={mode}
        leaderboard={leaderboard}
        userId={userId}
        phase={phase}
        lapTarget={lapTarget}
        scoreTarget={scoreTarget}
        crafts={crafts}
      />
      <TelemetryBar mode={mode} me={meWithCraft} lapTarget={lapTarget} />

      {(phase === 'lobby' || phase === 'finished') ? (
        <LobbyOverlay
          mode={mode}
          phase={phase}
          crafts={crafts}
          selectedCraft={selectedCraft}
          onCraftSelect={onCraftSelect}
          me={meWithCraft}
          isHost={isHost}
          allReady={allReady}
          onReadyToggle={onReadyToggle}
          onLaunch={onLaunch}
          onResetToLobby={onResetToLobby}
          winnerName={winnerName}
        />
      ) : null}

      {phase === 'countdown' ? <CountdownOverlay mode={mode} countdown={countdown} /> : null}
    </>
  )
}
