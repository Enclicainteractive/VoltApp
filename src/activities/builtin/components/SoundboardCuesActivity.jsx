import React from 'react'
import {
  BoltIcon,
  SpeakerWaveIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'

const CueGlyph = ({ cue }) => {
  if (cue.includes('victory') || cue.includes('achievement') || cue.includes('level')) {
    return <SparklesIcon width={22} height={22} />
  }
  if (cue.includes('error') || cue.includes('invalid')) {
    return <BoltIcon width={22} height={22} />
  }
  return <SpeakerWaveIcon width={22} height={22} />
}

// All available sound cues for testing
const ALL_CUES = [
  // Session sounds
  'session_created',
  'session_joined',
  'session_left',
  
  // Game phase sounds
  'round_start',
  'round_end',
  'game_start',
  'game_end',
  
  // Score & status
  'score_update',
  'ready_check',
  'player_ready',
  'player_not_ready',
  
  // Player actions
  'player_join',
  'player_leave',
  'your_turn',
  
  // Timer sounds
  'countdown',
  'timer_start',
  'timer_end',
  
  // Game result sounds
  'victory',
  'defeat',
  'draw',
  'round_win',
  'round_loss',
  'sudden_death',
  'overtime',
  
  // Turn/Move sounds
  'turn_switch',
  'move_valid',
  'move_invalid',
  
  // Combo/Streak sounds
  'combo',
  'streak',
  
  // Gameplay sounds
  'powerup',
  'damage',
  'heal',
  
  // RPG/Progression sounds
  'level_up',
  'achievement_unlock',
  'xp_gain',
  'coin_collect',
  
  // UI sounds
  'button_click',
  'menu_open',
  'menu_close',
  'popup_open',
  'popup_close',
  'selection_change',
  
  // Multiplayer sounds
  'spectator_join',
  'spectator_leave',
  'host_transfer',
  
  // Game state sounds
  'intermission',
  'pause',
  'resume',
  
  // Error sound
  'error'
]

const SoundboardCuesActivity = ({ sdk }) => {
  const fire = (cue) => {
    // Try to play the cue using the SDK
    if (sdk?.playCue) {
      sdk.playCue(cue)
    }
    // Emit event for testing
    sdk.emitEvent('sound:cue', { cue }, { cue })
    console.log(`[SoundboardCues] Fired cue: ${cue}`)
  }

  const fireAll = () => {
    ALL_CUES.forEach((cue, index) => {
      setTimeout(() => fire(cue), index * 500)
    })
  }

  return (
    <div className="builtin-activity-body soundboard-cues">
      <div className="soundboard-header">
        <h2>
          <SpeakerWaveIcon width={24} height={24} />
          <span>Soundboard Cues</span>
        </h2>
        <p>Trigger the shared cue library and verify how activities sound under real session conditions.</p>
        <button className="fire-all-btn" onClick={fireAll}>
          <BoltIcon width={18} height={18} />
          <span>Fire All Cues</span>
        </button>
      </div>
      
      <div className="soundboard-grid">
        {ALL_CUES.map(cue => (
          <button 
            key={cue} 
            className="cue-button"
            onClick={() => fire(cue)}
          >
            <span className="cue-icon">
              <CueGlyph cue={cue} />
            </span>
            <span className="cue-name">{cue.replace(/_/g, ' ')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default SoundboardCuesActivity
