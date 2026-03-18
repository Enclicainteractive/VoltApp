/**
 * MiniGolfUI3D.jsx  –  HTML UI panels for MiniGolf
 *
 * These components use HTML overlay for reliable event handling.
 * They must be rendered inside HtmlOverlay in the parent.
 */
import React from 'react'
import { BALL_COLOR_OPTIONS, MINIGOLF_PHASES } from './constants'
import {
  HtmlPanel,
  HtmlText,
  HtmlBar,
  HtmlButton,
  HtmlColorSwatch,
  HtmlDivider,
} from '../shared/HtmlOverlay'

// ─── LOBBY PANEL ─────────────────────────────────────────────────────────────
export function LobbyPanel3D({
  courses, players, readyMap, votes, selectedCourseId, leadingCourseId,
  currentUserId, canStart, onVoteCourse, onToggleReady, onStartGame
}) {
  const readyCount = players.filter(p => readyMap[p.id]).length
  const isReady = readyMap[currentUserId]

  return (
    <HtmlPanel x={0} y={0} w={560} h={480} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
      {/* Title */}
      <HtmlText x={0} y={12} text="⛳ MiniGolf – Lobby" fontSize={22} color="#f9fafb" fontWeight="bold" align="center" maxWidth={540} />
      <HtmlDivider x={12} y={42} w={536} />

      {/* Stats */}
      <HtmlText x={16} y={50} text={`Players: ${players.length}   Ready: ${readyCount}/${players.length}`} fontSize={13} color="#9ca3af" />
      <HtmlText x={16} y={68} text={`Leading vote: ${courses.find(c => c.id === leadingCourseId)?.name || 'No votes yet'}`} fontSize={13} color="#9ca3af" />

      {/* Course list */}
      <HtmlText x={16} y={90} text="Vote for Course" fontSize={14} color="#d1d5db" fontWeight="bold" />
      {courses.slice(0, 6).map((course, i) => {
        const isVoted = votes[currentUserId] === course.id
        const isLeading = course.id === leadingCourseId
        const isSelected = course.id === selectedCourseId
        const bgColor = isSelected ? '#1e3a5f' : isLeading ? '#14532d' : '#1f2937'
        return (
          <HtmlButton
            key={course.id}
            x={16} y={110 + i * 36} w={320} h={30}
            label={`${course.name}${isVoted ? '  ✓' : isLeading ? '  ★' : ''}`}
            color={bgColor}
            hoverColor={isSelected ? '#2563eb' : isLeading ? '#166534' : '#374151'}
            textColor={isVoted ? '#4ade80' : isLeading ? '#fbbf24' : '#e5e7eb'}
            fontSize={13}
            onClick={() => onVoteCourse(course.id)}
          />
        )
      })}

      {/* Player list */}
      <HtmlText x={360} y={90} text="Players" fontSize={14} color="#d1d5db" fontWeight="bold" />
      {players.slice(0, 8).map((p, i) => (
        <HtmlPanel key={p.id} x={356} y={110 + i * 36} w={188} h={30} anchor="top-left" color={readyMap[p.id] ? '#14532d' : '#1f2937'} opacity={0.9}>
          <HtmlText x={8} y={8} text={`${readyMap[p.id] ? '✓ ' : ''}${p.username || 'Player'}`} fontSize={12} color={readyMap[p.id] ? '#4ade80' : '#e5e7eb'} />
        </HtmlPanel>
      ))}

      <HtmlDivider x={12} y={340} w={536} />

      {/* Action buttons */}
      <HtmlButton
        x={16} y={352} w={180} h={36}
        label={isReady ? '✓ Ready!' : 'Mark Ready'}
        color={isReady ? '#14532d' : '#1d4ed8'}
        hoverColor={isReady ? '#166534' : '#2563eb'}
        onClick={onToggleReady}
      />
      {canStart && (
        <HtmlButton
          x={208} y={352} w={180} h={36}
          label="▶ Start Game"
          color="#7c3aed"
          hoverColor="#6d28d9"
          onClick={onStartGame}
        />
      )}

      {/* Ball color picker */}
      <HtmlText x={16} y={400} text="Ball Color:" fontSize={13} color="#9ca3af" />
      {BALL_COLOR_OPTIONS.slice(0, 12).map((opt, i) => (
        <HtmlColorSwatch
          key={opt.value}
          x={100 + i * 28} y={396}
          size={20}
          color={opt.value}
        />
      ))}
    </HtmlPanel>
  )
}

// ─── PLAYING HUD ──────────────────────────────────────────────────────────────
export function PlayingHUD3D({
  currentPlayer, holeIndex, par, strokeCount, players,
  aimAngle, power, isAiming, isAnimating,
  onSetPower, onShoot, onAimLeft, onAimRight,
  settings, onOpenSettings,
}) {
  const isMyTurn = true // caller filters

  return (
    <>
      {/* ── Top-left: hole info ── */}
      <HtmlPanel x={12} y={12} w={200} h={80} anchor="top-left" color="#0d1117" opacity={0.88} borderColor="#1f2937">
        <HtmlText x={12} y={10} text={`Hole ${holeIndex + 1}`} fontSize={16} color="#f9fafb" fontWeight="bold" />
        <HtmlText x={12} y={32} text={`Par ${par}`} fontSize={13} color="#9ca3af" />
        <HtmlText x={12} y={50} text={`Strokes: ${strokeCount}`} fontSize={13} color={strokeCount <= par ? '#4ade80' : '#f87171'} />
      </HtmlPanel>

      {/* ── Top-right: scoreboard ── */}
      <HtmlPanel x={12} y={12} w={180} h={Math.min(players.length * 26 + 36, 200)} anchor="top-right" color="#0d1117" opacity={0.88} borderColor="#1f2937">
        <HtmlText x={12} y={10} text="Scores" fontSize={14} color="#f9fafb" fontWeight="bold" />
        <HtmlDivider x={8} y={28} w={164} />
        {players.slice(0, 6).map((p, i) => (
          <HtmlText
            key={p.id}
            x={12} y={34 + i * 24}
            text={`${p.id === currentPlayer?.id ? '▶ ' : ''}${p.username || 'P'}: ${p.totalStrokes ?? 0}`}
            fontSize={12}
            color={p.id === currentPlayer?.id ? '#38bdf8' : '#e5e7eb'}
          />
        ))}
      </HtmlPanel>

      {/* ── Bottom: aim controls (only when it's your turn) ── */}
      {isMyTurn && !isAnimating && (
        <HtmlPanel x={0} y={12} w={360} h={100} anchor="bottom-center" color="#0d1117" opacity={0.92} borderColor="#1f2937">
          <HtmlText x={12} y={8} text={isAiming ? 'Aiming…' : 'Your Turn'} fontSize={14} color="#38bdf8" fontWeight="bold" />
          <HtmlText x={12} y={28} text={`Angle: ${Math.round((aimAngle * 180) / Math.PI)}°`} fontSize={12} color="#9ca3af" />

          {/* Power bar */}
          <HtmlText x={12} y={48} text="Power:" fontSize={12} color="#9ca3af" />
          <HtmlBar x={70} y={50} w={200} h={12} value={power} color="#f97316" bgColor="#1f2937" />
          <HtmlText x={278} y={48} text={`${Math.round(power * 100)}%`} fontSize={11} color="#e5e7eb" />

          {/* Aim buttons */}
          <HtmlButton x={12} y={68} w={50} h={24} label="◀" color="#374151" hoverColor="#4b5563" onClick={onAimLeft} />
          <HtmlButton x={68} y={68} w={50} h={24} label="▶" color="#374151" hoverColor="#4b5563" onClick={onAimRight} />
          <HtmlButton x={130} y={68} w={100} h={24} label="🏌️ Shoot!" color="#7c3aed" hoverColor="#6d28d9" onClick={onShoot} />
          <HtmlButton x={238} y={68} w={60} h={24} label="⚙" color="#374151" hoverColor="#4b5563" onClick={onOpenSettings} />
        </HtmlPanel>
      )}

      {/* Waiting indicator */}
      {!isMyTurn && !isAnimating && (
        <HtmlPanel x={0} y={12} w={240} h={40} anchor="bottom-center" color="#0d1117" opacity={0.88} borderColor="#374151">
          <HtmlText x={0} y={12} text={`Waiting for ${currentPlayer?.username || 'player'}…`} fontSize={13} color="#9ca3af" align="center" maxWidth={220} />
        </HtmlPanel>
      )}
    </>
  )
}

// ─── HOLE SUMMARY PANEL ───────────────────────────────────────────────────────
export function HoleSummaryPanel3D({ leaderboard, onAdvanceHole, isLastHole, holeIndex }) {
  return (
    <HtmlPanel x={0} y={0} w={400} h={Math.min(leaderboard.length * 36 + 120, 400)} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
      <HtmlText x={0} y={12} text={`Hole ${holeIndex + 1} Complete!`} fontSize={20} color="#f9fafb" fontWeight="bold" align="center" maxWidth={380} />
      <HtmlDivider x={12} y={38} w={376} />
      <HtmlText x={12} y={46} text="Leaderboard" fontSize={14} color="#9ca3af" />
      {leaderboard.map((entry, i) => (
        <HtmlPanel key={entry.playerId} x={12} y={66 + i * 36} w={376} h={30} anchor="top-left"
          color={i === 0 ? '#78350f' : '#1f2937'} opacity={0.9}>
          <HtmlText x={8} y={8}
            text={`${i + 1}. ${entry.username || 'Player'}  –  ${entry.strokes} stroke${entry.strokes !== 1 ? 's' : ''} (total: ${entry.totalStrokes})`}
            fontSize={12}
            color={i === 0 ? '#fbbf24' : '#e5e7eb'}
          />
        </HtmlPanel>
      ))}
      <HtmlButton
        x={100} y={leaderboard.length * 36 + 76} w={200} h={36}
        label={isLastHole ? '🏆 See Final Results' : '▶ Next Hole'}
        color="#7c3aed" hoverColor="#6d28d9"
        onClick={onAdvanceHole}
      />
    </HtmlPanel>
  )
}

// ─── FINISHED PANEL ───────────────────────────────────────────────────────────
export function FinishedPanel3D({ leaderboard, winner, onRematch }) {
  return (
    <HtmlPanel x={0} y={0} w={420} h={Math.min(leaderboard.length * 36 + 160, 480)} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
      <HtmlText x={0} y={12} text="🏆 Game Over!" fontSize={24} color="#fbbf24" fontWeight="bold" align="center" maxWidth={400} />
      {winner && (
        <HtmlText x={0} y={44} text={`Winner: ${winner.username || 'Player'}`} fontSize={16} color="#4ade80" align="center" maxWidth={400} />
      )}
      <HtmlDivider x={12} y={68} w={396} />
      <HtmlText x={12} y={76} text="Final Scores" fontSize={14} color="#9ca3af" />
      {leaderboard.map((entry, i) => (
        <HtmlPanel key={entry.playerId} x={12} y={96 + i * 36} w={396} h={30} anchor="top-left"
          color={i === 0 ? '#78350f' : '#1f2937'} opacity={0.9}>
          <HtmlText x={8} y={8}
            text={`${i + 1}. ${entry.username || 'Player'}  –  ${entry.totalStrokes} total strokes`}
            fontSize={12}
            color={i === 0 ? '#fbbf24' : '#e5e7eb'}
          />
        </HtmlPanel>
      ))}
      <HtmlButton
        x={110} y={leaderboard.length * 36 + 106} w={200} h={36}
        label="🔄 Play Again"
        color="#7c3aed" hoverColor="#6d28d9"
        onClick={onRematch}
      />
    </HtmlPanel>
  )
}

// ─── TURN INDICATOR ───────────────────────────────────────────────────────────
export function TurnIndicator3D({ player, holeIndex, par }) {
  if (!player) return null
  return (
    <HtmlPanel x={0} y={60} w={280} h={44} anchor="top-center" color="#0d1117" opacity={0.88} borderColor="#374151">
      <HtmlText x={0} y={12} text={`${player.username || 'Player'}'s turn  •  Hole ${holeIndex + 1}  •  Par ${par}`} fontSize={13} color="#38bdf8" align="center" maxWidth={260} />
    </HtmlPanel>
  )
}

// ─── SHOT RESULT TOAST ────────────────────────────────────────────────────────
export function ShotResultToast3D({ result }) {
  if (!result) return null
  const isGood = result.type === 'hole_in_one' || result.type === 'birdie' || result.type === 'eagle' || result.type === 'hole'
  const color = isGood ? '#4ade80' : result.type === 'out_of_bounds' ? '#f87171' : '#fbbf24'
  const label = result.label || result.type?.replace(/_/g, ' ') || ''

  return (
    <HtmlPanel x={0} y={100} w={220} h={44} anchor="top-center" color="#0d1117" opacity={0.95} borderColor={color}>
      <HtmlText x={0} y={12} text={label} fontSize={16} color={color} fontWeight="bold" align="center" maxWidth={200} />
    </HtmlPanel>
  )
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
export function SettingsPanel3D({ settings, onChangeSetting, onClose, ballColors = BALL_COLOR_OPTIONS }) {
  return (
    <HtmlPanel x={0} y={0} w={360} h={340} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
      <HtmlText x={12} y={12} text="⚙ Settings" fontSize={18} color="#f9fafb" fontWeight="bold" />
      <HtmlDivider x={8} y={36} w={344} />

      {/* Ball color */}
      <HtmlText x={12} y={44} text="Ball Color" fontSize={13} color="#9ca3af" />
      {ballColors.slice(0, 10).map((opt, i) => (
        <HtmlColorSwatch
          key={opt.value}
          x={12 + i * 30} y={62}
          size={22}
          color={opt.value}
          selected={settings?.ballColor === opt.value}
          onClick={() => onChangeSetting('ballColor', opt.value)}
        />
      ))}

      {/* Trail toggle */}
      <HtmlText x={12} y={100} text="Ball Trail" fontSize={13} color="#9ca3af" />
      <HtmlButton x={100} y={96} w={80} h={26}
        label={settings?.trail ? 'On' : 'Off'}
        color={settings?.trail ? '#14532d' : '#374151'}
        hoverColor={settings?.trail ? '#166534' : '#4b5563'}
        onClick={() => onChangeSetting('trail', !settings?.trail)}
      />

      {/* Particles toggle */}
      <HtmlText x={12} y={134} text="Particles" fontSize={13} color="#9ca3af" />
      <HtmlButton x={100} y={130} w={80} h={26}
        label={settings?.particles ? 'On' : 'Off'}
        color={settings?.particles ? '#14532d' : '#374151'}
        hoverColor={settings?.particles ? '#166534' : '#4b5563'}
        onClick={() => onChangeSetting('particles', !settings?.particles)}
      />

      {/* Camera mode */}
      <HtmlText x={12} y={168} text="Camera" fontSize={13} color="#9ca3af" />
      {['follow', 'overhead', 'free'].map((mode, i) => (
        <HtmlButton key={mode} x={100 + i * 84} y={164} w={78} h={26}
          label={mode.charAt(0).toUpperCase() + mode.slice(1)}
          color={settings?.cameraMode === mode ? '#1d4ed8' : '#374151'}
          hoverColor={settings?.cameraMode === mode ? '#2563eb' : '#4b5563'}
          fontSize={11}
          onClick={() => onChangeSetting('cameraMode', mode)}
        />
      ))}

      {/* Power sensitivity */}
      <HtmlText x={12} y={202} text="Power Sensitivity" fontSize={13} color="#9ca3af" />
      {[0.5, 1.0, 1.5, 2.0].map((val, i) => (
        <HtmlButton key={val} x={160 + i * 46} y={198} w={40} h={26}
          label={`${val}x`}
          color={settings?.powerSensitivity === val ? '#7c3aed' : '#374151'}
          hoverColor={settings?.powerSensitivity === val ? '#6d28d9' : '#4b5563'}
          fontSize={11}
          onClick={() => onChangeSetting('powerSensitivity', val)}
        />
      ))}

      <HtmlDivider x={8} y={238} w={344} />
      <HtmlButton x={130} y={250} w={100} h={32} label="✕ Close" color="#374151" hoverColor="#4b5563" onClick={onClose} />
    </HtmlPanel>
  )
}
