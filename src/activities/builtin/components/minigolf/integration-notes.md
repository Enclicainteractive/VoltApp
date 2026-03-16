MiniGolf HUD props expected by the activity shell:

- `phase`, `courses`, `players`, `readyMap`, `votes`, `selectedCourseId`, `currentUserId`, `canStart`
- `course`, `hole`, `holeIndex`, `holeCount`, `leaderboard`, `currentTurnPlayer`, `isMyTurn`
- `aimState`, `winner`

HUD callbacks:

- `onVoteCourse(courseId)`
- `onToggleReady()`
- `onStartGame()`
- `onAimToggle()`
- `onPowerChange(power)`
- `onShoot()`
- `onAdvanceHole()`
- `onRematch()`

Scene props expected by the activity shell:

- `courseId`, `holeIndex`
- `players` as `{ id, username, color, position }[]`
- `activePlayerId`
- `aimState`
- `isMyTurn`
- `shotPlayback`
- `onShotPlaybackComplete()`
