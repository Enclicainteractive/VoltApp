import React from 'react'

// SVG Icons for all builtin activities

// OurVids - video player with play button
export const OurVidsIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="3" width="20" height="15" rx="2"/>
    <path d="M8 21h8M12 18v3"/>
    <polygon points="10,8 10,14 16,11" fill="currentColor" stroke="none"/>
  </svg>
)

// ReadyCheck - checkmark shield
export const ReadyCheckIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
)

// Soundboard - audio waveform with buttons
export const SoundboardCuesIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="3"/>
    <circle cx="7" cy="8" r="2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="8" r="2" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="8" r="2" fill="currentColor" stroke="none"/>
    <circle cx="7" cy="13" r="2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="13" r="2" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="13" r="2" fill="currentColor" stroke="none"/>
    <path d="M5 18h14" strokeWidth="2"/>
  </svg>
)

// Sequencer - grid with active cells
export const SequencerIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2"/>
    <rect x="4" y="8" width="3" height="8" rx="1" fill="currentColor" stroke="none"/>
    <rect x="9" y="5" width="3" height="11" rx="1" fill="currentColor" stroke="none"/>
    <rect x="14" y="10" width="3" height="6" rx="1" fill="currentColor" stroke="none"/>
    <rect x="19" y="7" width="1" height="3" rx="0.5" fill="currentColor" stroke="none"/>
    <path d="M2 17h20" strokeWidth="1.5" opacity="0.4"/>
  </svg>
)

// Bytebeat - oscilloscope wave
export const BytebeatIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2"/>
    <polyline points="3,12 5,12 6,6 8,18 10,8 12,16 14,10 16,14 18,12 21,12" strokeWidth="2"/>
  </svg>
)

// DAW Studio - piano keys + waveform
export const DAWStudioIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2"/>
    <rect x="4" y="14" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/>
    <rect x="8" y="14" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/>
    <rect x="12" y="14" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/>
    <rect x="16" y="14" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/>
    <rect x="5.5" y="14" width="2" height="4" rx="0.3" fill="currentColor" stroke="none" opacity="0.5"/>
    <rect x="13.5" y="14" width="2" height="4" rx="0.3" fill="currentColor" stroke="none" opacity="0.5"/>
    <polyline points="3,8 5,4 7,10 9,5 11,9 13,3 15,8 17,6 19,9 21,7" strokeWidth="1.5" opacity="0.8"/>
  </svg>
)

// SketchDuel - pencil with clock
export const SketchDuelIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    <path d="m15 5 4 4"/>
    <circle cx="17" cy="18" r="4"/>
    <path d="M17 16v2l1.3 1.3"/>
  </svg>
)

// CollaborativeDrawing - brush with multiple marks
export const CollaborativeDrawingIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 17c0-1 .4-1.8 1.4-2.6L12 8l4 4-6.6 6.6C8.6 19.6 7.8 20 7 20c-1.7 0-3-1.3-3-3z"/>
    <path d="M12 8l2-2"/>
    <path d="M14 6l2-2 4 4-2 2"/>
    <circle cx="19" cy="5" r="1" fill="currentColor" stroke="none"/>
    <path d="M6 20s1-3 3-5"/>
  </svg>
)

// PixelArt - pixel grid with colored squares
export const PixelArtIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2"/>
    <rect x="4" y="4" width="4" height="4" fill="currentColor" rx="0.5" stroke="none"/>
    <rect x="10" y="4" width="4" height="4" fill="currentColor" rx="0.5" stroke="none" opacity="0.4"/>
    <rect x="4" y="10" width="4" height="4" fill="currentColor" rx="0.5" stroke="none" opacity="0.6"/>
    <rect x="10" y="10" width="4" height="4" fill="currentColor" rx="0.5" stroke="none"/>
    <rect x="16" y="10" width="4" height="4" fill="currentColor" rx="0.5" stroke="none" opacity="0.3"/>
    <rect x="4" y="16" width="4" height="4" fill="currentColor" rx="0.5" stroke="none" opacity="0.2"/>
    <rect x="16" y="16" width="4" height="4" fill="currentColor" rx="0.5" stroke="none" opacity="0.7"/>
  </svg>
)

// PokerNight - playing cards with chip
export const PokerNightIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="5" width="11" height="15" rx="2"/>
    <rect x="10" y="4" width="11" height="15" rx="2"/>
    <path d="M13 7h5M13 10h5M13 13h3"/>
    <circle cx="6" cy="19" r="3" fill="currentColor" stroke="currentColor"/>
    <circle cx="6" cy="19" r="1.5" stroke="white" strokeWidth="1" fill="none"/>
  </svg>
)

// MiniGolf - golf hole with club
export const MiniGolfIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 21h10"/>
    <path d="M9 21V7"/>
    <path d="M9 7l8 2.5-8 2.5"/>
    <circle cx="17" cy="18" r="2.5"/>
    <path d="M17 15.5V10"/>
    <ellipse cx="17" cy="20.5" rx="3" ry="0.8" opacity="0.4"/>
  </svg>
)

// ChessArena - chess king piece
export const ChessArenaIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3v4M10 5h4"/>
    <path d="M9 7h6l1.5 8H7.5L9 7z"/>
    <path d="M7 15h10"/>
    <ellipse cx="12" cy="19" rx="5" ry="2"/>
    <rect x="7" y="17" width="10" height="2"/>
  </svg>
)

// TicTacToe - X and O on grid
export const TicTacToeIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>
    <path d="M5 5l4 4m0-4L5 9"/>
    <circle cx="17.5" cy="17.5" r="2.5"/>
  </svg>
)

// ConnectFour - disc grid
export const ConnectFourIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="4" width="20" height="17" rx="2"/>
    <circle cx="7" cy="9" r="2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="9" r="2" fill="currentColor" stroke="none" opacity="0.5"/>
    <circle cx="17" cy="9" r="2" fill="currentColor" stroke="none"/>
    <circle cx="7" cy="15" r="2" fill="currentColor" stroke="none" opacity="0.5"/>
    <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="15" r="2" fill="currentColor" stroke="none" opacity="0.5"/>
    <path d="M12 2v2M8 2v2M16 2v2" strokeWidth="2"/>
  </svg>
)

// VoltVerse - 3D world/globe with grid
export const VoltVerseIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2c-4 3-6 6-6 10s2 7 6 10M12 2c4 3 6 6 6 10s-2 7-6 10"/>
    <path d="M12 2v20" opacity="0.3"/>
  </svg>
)

// VoltVerse Creator - world with edit pencil
export const VoltVerseCreatorIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>
    <path d="M12 3v9M4 7.5l8 4.5 8-4.5"/>
    <circle cx="18" cy="18" r="4" fill="currentColor" fillOpacity="0.15" stroke="currentColor"/>
    <path d="M18 16v2l1.3 1.3" strokeWidth="1.5"/>
  </svg>
)

// VoltCraft - voxel cube with terrain layers
export const VoltCraftIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M12 12 20 7.5M12 12 4 7.5M12 12v9" />
    <path d="M8 9.5h4M7 14h5" opacity="0.55" />
  </svg>
)

// MousePositions - cursor with motion trail
export const MousePositionsIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 4l7 17 2.5-6.5L20 12z" fill="currentColor" fillOpacity="0.15"/>
    <path d="M4 4l7 17 2.5-6.5L20 12z"/>
    <circle cx="18" cy="18" r="1.5" fill="currentColor" stroke="none" opacity="0.4"/>
    <circle cx="20" cy="15" r="1" fill="currentColor" stroke="none" opacity="0.25"/>
  </svg>
)

// SharedCounter - hashtag with increment arrows
export const SharedCounterIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18"/>
    <path d="M19 5l2 2-2 2" strokeWidth="2"/>
    <path d="M19 15l2 2-2 2" strokeWidth="2"/>
  </svg>
)

// HostControls - terminal/command line
export const HostControlsIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="3" width="20" height="18" rx="2"/>
    <path d="M6 9l3 3-3 3"/>
    <path d="M12 15h6"/>
    <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

// WhiteboardStrokes - whiteboard with drawn lines
export const WhiteboardStrokesIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="16" rx="2"/>
    <path d="M12 18v4M8 22h8"/>
    <path d="M6 7c2 0 3 3 5 3s3-3 5-3" strokeWidth="2"/>
    <path d="M7 12h4" strokeWidth="2" opacity="0.5"/>
    <circle cx="17" cy="11" r="2" stroke="currentColor" fill="none" opacity="0.5"/>
  </svg>
)

// LatencyMeter - signal bars with pulse
export const LatencyMeterIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="16" width="3" height="4" rx="0.5" fill="currentColor" stroke="none"/>
    <rect x="8" y="12" width="3" height="8" rx="0.5" fill="currentColor" stroke="none" opacity="0.7"/>
    <rect x="13" y="8" width="3" height="12" rx="0.5" fill="currentColor" stroke="none" opacity="0.85"/>
    <rect x="18" y="4" width="3" height="16" rx="0.5" fill="currentColor" stroke="none"/>
    <path d="M1 12h3M20 2l1.5 1.5" strokeWidth="1.5" opacity="0.4"/>
  </svg>
)

// VideoSync - play button on screen with sync arrows
export const VideoSyncIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <polygon points="10,7 10,13 15,10" fill="currentColor" stroke="none"/>
    <path d="M7 20l3-3M17 20l-3-3"/>
    <path d="M12 17v5"/>
    <path d="M8 22h8"/>
  </svg>
)

// P2PLobby - network nodes connected
export const P2PLobbyIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="5" r="3"/>
    <circle cx="5" cy="18" r="3"/>
    <circle cx="19" cy="18" r="3"/>
    <path d="M10 7.5L7 15.5"/>
    <path d="M14 7.5l3 8"/>
    <path d="M8 18h8"/>
    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none"/>
    <circle cx="19" cy="18" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

// Voltmeter - gauge/meter dial
export const VoltmeterIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
    <path d="M12 12l4-6" strokeWidth="2"/>
    <path d="M6 18h12" opacity="0.3"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
    <path d="M5 15l1-1M19 15l-1-1M12 5v2" strokeWidth="1.5" opacity="0.5"/>
  </svg>
)

// Default - gear/settings
export const DefaultActivityIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

// ---- Category Icons ----

// CollabCategoryIcon - two people collaborating
export const CollabCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="9" cy="7" r="3"/>
    <circle cx="17" cy="7" r="3"/>
    <path d="M2 21v-2a5 5 0 0 1 5-5h4"/>
    <path d="M17 14a5 5 0 0 1 5 5v2"/>
    <path d="M13 17l2 2 4-4" strokeWidth="2"/>
  </svg>
)

// PartyCategoryIcon - party/celebration popper
export const PartyCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5.8 11.3L2 22l10.7-3.8"/>
    <path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01"/>
    <path d="M9.1 8.9L4 19.8 15.1 14.9"/>
    <path d="M12 2l1 4M20 7l-4 1M18 14l3 2"/>
    <circle cx="7.5" cy="4.5" r="1.5" fill="currentColor" stroke="none" opacity="0.5"/>
    <circle cx="19" cy="3" r="1" fill="currentColor" stroke="none" opacity="0.4"/>
    <circle cx="21" cy="14" r="1" fill="currentColor" stroke="none" opacity="0.3"/>
  </svg>
)

// UtilityCategoryIcon - wrench/tools
export const UtilityCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
)

// MusicCategoryIcon - music notes
export const MusicCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>
)

// CreativeCategoryIcon - art palette
export const CreativeCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.51-.2-.98-.52-1.34-.31-.35-.48-.82-.48-1.32 0-1.1.9-2 2-2h2.36c3.08 0 5.64-2.56 5.64-5.64C23 5.78 18.22 2 12 2z"/>
    <circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="10" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
)

// DiagnosticsCategoryIcon - signal/chart with pulse
export const DiagnosticsCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

// MediaCategoryIcon - play button on screen
export const MediaCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <polygon points="10,7 10,13 16,10" fill="currentColor" stroke="none"/>
    <path d="M8 21h8M12 17v4"/>
  </svg>
)

// GamesCategoryIcon - game controller
export const GamesCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 11h4M8 9v4"/>
    <path d="M15 12h.01M18 10h.01"/>
    <rect x="2" y="6" width="20" height="12" rx="4"/>
    <path d="M6 18l-2 3M18 18l2 3"/>
  </svg>
)

// CustomCategoryIcon - puzzle piece
export const CustomCategoryIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.452-.968-.908a2.5 2.5 0 0 0-4.722 0c-.166.456-.498.838-.968.908a.98.98 0 0 1-.837-.276L9.742 14c-.23-.23-.556-.338-.878-.29a2.5 2.5 0 0 1-2.728-3.574c.166-.456.055-.972-.288-1.233a.98.98 0 0 0-.588-.193H4.5A2.5 2.5 0 0 1 2 6.21V4.5A2.5 2.5 0 0 1 4.5 2h15A2.5 2.5 0 0 1 22 4.5v1.71a2.5 2.5 0 0 1-2.561 2.64z"/>
  </svg>
)

// Icon mapping for activities
export const ActivityIconMap = {
  'our-vids': OurVidsIcon,
  'ready-check': ReadyCheckIcon,
  'soundboard-cues': SoundboardCuesIcon,
  'sequencer': SequencerIcon,
  'bytebeat': BytebeatIcon,
  'sketch-duel': SketchDuelIcon,
  'pixel-art': PixelArtIcon,
  'poker-night': PokerNightIcon,
  'minigolf': MiniGolfIcon,
  'chess-arena': ChessArenaIcon,
  'tic-tac-toe': TicTacToeIcon,
  'connect-four': ConnectFourIcon,
  'collaborative-drawing': CollaborativeDrawingIcon,
  'voltcraft': VoltCraftIcon,
  'colabcreate': DAWStudioIcon,
  'daw-sequencer': DAWStudioIcon,
  'daw-studio': DAWStudioIcon,
  'voltverse': VoltVerseIcon,
  'voltverse-creator': VoltVerseCreatorIcon,
  'mouse-positions': MousePositionsIcon,
  'shared-counter': SharedCounterIcon,
  'host-controls': HostControlsIcon,
  'whiteboard-strokes': WhiteboardStrokesIcon,
  'latency-meter': LatencyMeterIcon,
  'video-sync': VideoSyncIcon,
  'p2p-lobby': P2PLobbyIcon,
  'voltmeter': VoltmeterIcon,
}

// Category icon mapping
export const CategoryIconMap = {
  collab: CollabCategoryIcon,
  party: PartyCategoryIcon,
  utility: UtilityCategoryIcon,
  music: MusicCategoryIcon,
  creative: CreativeCategoryIcon,
  diagnostics: DiagnosticsCategoryIcon,
  media: MediaCategoryIcon,
  board: GamesCategoryIcon,
  games: GamesCategoryIcon,
  social: CollabCategoryIcon,
  custom: CustomCategoryIcon,
}

// Helper to get icon component
export const getActivityIcon = (activityKey) => {
  return ActivityIconMap[activityKey] || DefaultActivityIcon
}

// Helper to get category icon component
export const getCategoryIcon = (categoryKey) => {
  return CategoryIconMap[(categoryKey || 'custom').toLowerCase()] || CustomCategoryIcon
}

export default ActivityIconMap
