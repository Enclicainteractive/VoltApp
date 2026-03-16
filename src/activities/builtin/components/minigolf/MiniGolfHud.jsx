import React, { useMemo } from 'react'
import { LockClosedIcon, StarIcon } from '@heroicons/react/24/solid'
import { BALL_COLOR_OPTIONS, MINIGOLF_PHASES } from './constants'

const relativeLabel = (relativeToPar) => {
  if (relativeToPar === 0) return 'E'
  return relativeToPar > 0 ? `+${relativeToPar}` : `${relativeToPar}`
}

const environmentLabel = (environment) => {
  if (!environment) return 'Course'
  return environment.charAt(0).toUpperCase() + environment.slice(1)
}

const StarRating = ({ stars, maxStars = 3 }) => (
  <div className="mgx-stars">
    {Array.from({ length: maxStars }, (_, index) => index + 1).map((i) => (
      <span key={i} className={`mgx-star ${i <= stars ? 'filled' : 'empty'}`}>
        <StarIcon width={14} height={14} />
      </span>
    ))}
  </div>
)

const LobbyView = ({
  courses,
  players,
  readyMap,
  votes,
  selectedCourseId,
  leadingCourseId,
  leadingCourse,
  onVoteCourse,
  onToggleReady,
  onStartGame,
  currentUserId,
  canStart
}) => {
  const voteCounts = useMemo(() => courses.reduce((acc, course) => {
    acc[course.id] = Object.values(votes).filter((vote) => vote === course.id).length
    return acc
  }, {}), [courses, votes])
  const myVote = votes[currentUserId] || selectedCourseId
  const readyCount = players.filter((player) => readyMap[player.id]).length
  const unlockedCount = courses.filter((course) => course.unlocked).length
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) || leadingCourse || courses[0] || null
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    const readyDelta = Number(!!readyMap[b.id]) - Number(!!readyMap[a.id])
    if (readyDelta !== 0) return readyDelta
    return a.username.localeCompare(b.username)
  })

  return (
    <div className="mgx-grid">
      <div className="mgx-card mgx-lobby-hero">
        <div className="mgx-header">
          <div>
            <h2>MiniGolf</h2>
            <p>Vote the next course, ready up, and play through a deeper lineup of unlockable levels.</p>
          </div>
          <span className="mgx-pill">{players.length} players</span>
        </div>
        <div className="mgx-lobby-stats">
          <div className="mgx-stat-tile">
            <span>Unlocked</span>
            <strong>{unlockedCount}/{courses.length}</strong>
          </div>
          <div className="mgx-stat-tile">
            <span>Ready</span>
            <strong>{readyCount}/{players.length}</strong>
          </div>
          <div className="mgx-stat-tile">
            <span>Leading Vote</span>
            <strong>{leadingCourse?.name || 'No votes yet'}</strong>
          </div>
        </div>
      </div>

      <div className="mgx-card">
        <div className="mgx-featured-course">
          <div className="mgx-featured-copy">
            <div className="mgx-featured-badges">
              <span className="mgx-course-badge">{environmentLabel(selectedCourse?.environment)}</span>
              {selectedCourse?.id === leadingCourseId ? <span className="mgx-course-badge is-leading">Leading Vote</span> : null}
              {myVote === selectedCourse?.id ? <span className="mgx-course-badge is-selected">Your Vote</span> : null}
            </div>
            <h3>{selectedCourse?.name || 'Select Course'}</h3>
            <p>{selectedCourse?.description || 'Choose the next course to play.'}</p>
          </div>
          <div className="mgx-featured-stats">
            <span>{selectedCourse?.holeCount || 0} holes</span>
            <span>Par {selectedCourse?.parTotal || 0}</span>
            <span>{voteCounts[selectedCourse?.id] || 0} votes</span>
          </div>
        </div>

        <div className="mgx-vote-summary">
          {courses.filter((course) => course.unlocked).map((course) => (
            <div
              key={course.id}
              className={`mgx-vote-summary-item ${course.id === leadingCourseId ? 'is-leading' : ''} ${course.id === myVote ? 'is-selected' : ''}`}
            >
              <span>{course.name}</span>
              <strong>{voteCounts[course.id] || 0}</strong>
            </div>
          ))}
        </div>

        <div className="mgx-course-grid">
          {courses.map((course) => {
            const voteCount = voteCounts[course.id] || 0
            const voteShare = players.length ? Math.round((voteCount / players.length) * 100) : 0
            const unlockLabel = course.unlockRequirement?.courseName || 'previous course'

            if (!course.unlocked) {
              return (
                <div key={course.id} className="mgx-course-button locked" title={`Complete ${unlockLabel} to unlock`}>
                  <div className="mgx-lock-overlay">
                    <div className="mgx-course-header">
                      <strong>{course.name}</strong>
                      <span className="mgx-course-badge is-locked"><LockClosedIcon width={14} height={14} />Locked</span>
                    </div>
                    <p>{course.description}</p>
                    <div className="mgx-course-meta">
                      <span>{environmentLabel(course.environment)}</span>
                      <span>{course.holeCount} holes</span>
                      <span>Par {course.parTotal}</span>
                    </div>
                    <div className="mgx-unlock-hint">
                      Complete {unlockLabel} to unlock
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <button
                key={course.id}
                type="button"
                className={`mgx-course-button ${selectedCourseId === course.id ? 'selected' : ''} ${course.id === leadingCourseId ? 'leading' : ''} ${course.id === myVote ? 'my-vote' : ''}`}
                onClick={() => onVoteCourse(course.id)}
              >
                <div className="mgx-course-header">
                  <strong>{course.name}</strong>
                  <div className="mgx-course-badges">
                    <span className="mgx-course-badge">{environmentLabel(course.environment)}</span>
                    {course.id === leadingCourseId ? <span className="mgx-course-badge is-leading">Leading</span> : null}
                    {course.id === myVote ? <span className="mgx-course-badge is-selected">Your Vote</span> : null}
                  </div>
                </div>
                <div className="mgx-course-rating-row">
                  <StarRating stars={course.stars} maxStars={course.maxStars} />
                </div>
                <p>{course.description}</p>
                <div className="mgx-course-meta">
                  <span>{course.holeCount} holes</span>
                  <span>Par {course.parTotal}</span>
                  <span>{voteCount} votes</span>
                </div>
                <div className="mgx-vote-bar">
                  <div className="mgx-vote-fill" style={{ width: `${voteShare}%` }} />
                </div>
                {course.stars > 0 ? (
                  <div className="mgx-course-stars-badge">
                    <StarIcon width={12} height={12} />
                    {course.stars}/{course.maxStars}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mgx-card">
        <div className="mgx-header">
          <div>
            <h3>Lobby</h3>
            <p className="mgx-muted">Everyone must ready up before the next round begins.</p>
          </div>
          <div className="mgx-lobby-actions">
            <button type="button" className="mgx-action-button" disabled={!canStart} onClick={onStartGame}>
              Start Round
            </button>
            <span className="mgx-muted">
              {canStart ? `Starting on ${leadingCourse?.name || selectedCourse?.name || 'selected course'}` : 'Waiting for ready checks'}
            </span>
          </div>
        </div>
        <div className="mgx-player-list">
          {sortedPlayers.map((player) => (
            <div key={player.id} className="mgx-player-row">
              <div className="mgx-player-chip" style={{ background: player.color }} />
              <div className="mgx-player-copy">
                <strong>{player.username}{player.id === currentUserId ? ' (You)' : ''}</strong>
                <span className="mgx-muted">
                  {readyMap[player.id] ? 'Ready' : 'Not ready'}
                  {' • '}
                  {votes[player.id] ? `voted ${courses.find((course) => course.id === votes[player.id])?.name || 'course'}` : 'no vote yet'}
                </span>
              </div>
              {player.id === currentUserId ? (
                <button type="button" className="mgx-player-button mgx-action-button secondary" onClick={onToggleReady}>
                  {readyMap[player.id] ? 'Unready' : 'Ready'}
                </button>
              ) : <span className="mgx-muted">Waiting</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const PlayingView = ({
  course,
  hole,
  holeIndex,
  holeCount,
  leaderboard,
  currentTurnPlayer,
  isMyTurn,
  aimState,
  selectedBallColor,
  onSelectBallColor,
  progression,
  courseId
}) => {
  const holeStars = progression?.courseStars?.[courseId]?.[hole.id] || 0

  return (
    <div className="mgx-grid">
      <div className="mgx-card">
        <div className="mgx-header">
          <div>
            <h3>{course.name}</h3>
            <p>{hole.name}</p>
          </div>
          <div className="mgx-inline-meta">
            <span>Hole {holeIndex + 1}/{holeCount}</span>
            <span>Par {hole.par}</span>
            {holeStars > 0 ? <span className="mgx-hole-stars"><StarIcon width={12} height={12} />{holeStars}</span> : null}
          </div>
        </div>
        <div className="mgx-score-line">
          <span>{currentTurnPlayer ? `${currentTurnPlayer.username}'s turn` : 'Transitioning'}</span>
          <span>{isMyTurn ? 'You are live' : 'Spectating turn'}</span>
        </div>
      </div>

      <div className="mgx-card">
        <h3>Shot Control</h3>
        <div className="mgx-controls">
          <div className="mgx-drag-guide">
            <strong>{isMyTurn ? 'Drag to shoot' : 'Waiting for turn'}</strong>
            <p>{isMyTurn ? 'Click the course, pull away from the ball, and release.' : 'You can still rotate and watch the line-up.'}</p>
          </div>
          <div className="mgx-power-readout">
            <div className="mgx-inline-meta">
              <span>Heading</span>
              <span>{Math.round((aimState.angle * 180) / Math.PI)} deg</span>
            </div>
            <div className="mgx-inline-meta">
              <span>Power</span>
              <span>{Math.round(aimState.power * 100)}%</span>
            </div>
            <div className="mgx-power-track">
              <div className="mgx-power-fill" style={{ width: `${Math.round(aimState.power * 100)}%` }} />
            </div>
          </div>
          <div className="mgx-ball-picker">
            <div className="mgx-inline-meta">
              <span>Ball finish</span>
              <span>{isMyTurn ? 'Shared live' : 'Cosmetic synced'}</span>
            </div>
            <div className="mgx-color-row">
              {BALL_COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`mgx-color-swatch ${selectedBallColor === color ? 'selected' : ''}`}
                  style={{ '--mgx-ball-color': color }}
                  onClick={() => onSelectBallColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mgx-card">
        <h3>Leaderboard</h3>
        <div className="mgx-scoreboard">
          {leaderboard.map((entry) => (
            <div key={entry.id} className={`mgx-score-row ${entry.id === currentTurnPlayer?.id ? 'active' : ''}`}>
              <div className="mgx-player-chip" style={{ background: entry.color }} />
              <div className="mgx-player-copy">
                <strong>{entry.username}</strong>
                <span className="mgx-muted">{entry.finishedHole ? 'Holed out' : `${entry.strokesThisHole} shots this hole`}</span>
              </div>
              <strong>{relativeLabel(entry.relativeToPar)}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const SummaryView = ({ leaderboard, onAdvanceHole, lastHole }) => (
  <div className="mgx-grid">
    <div className="mgx-card">
      <div className="mgx-header">
        <h3>{lastHole ? 'Course Complete!' : 'Hole Complete'}</h3>
        {!lastHole ? (
          <button type="button" className="mgx-action-button" onClick={onAdvanceHole}>
            Next Hole
          </button>
        ) : null}
      </div>
      <div className="mgx-scoreboard">
        {leaderboard.map((entry) => (
          <div key={entry.id} className="mgx-score-row">
            <div className="mgx-player-chip" style={{ background: entry.color }} />
            <div className="mgx-player-copy">
              <strong>{entry.username}</strong>
              <span className="mgx-muted">{entry.totalStrokes} total strokes</span>
            </div>
            <strong>{relativeLabel(entry.relativeToPar)}</strong>
          </div>
        ))}
      </div>
      {lastHole ? (
        <div className="mgx-finish-reward">
          <p>Course Complete! Your progress has been saved.</p>
        </div>
      ) : null}
    </div>
  </div>
)

const FinishedView = ({ leaderboard, winner, onRematch }) => (
  <div className="mgx-grid">
    <div className="mgx-card">
      <div className="mgx-header">
        <div>
          <h3>Round Finished</h3>
          <p>{winner ? `${winner.username} wins the card.` : 'No winner resolved.'}</p>
        </div>
        <button type="button" className="mgx-action-button" onClick={onRematch}>
          Rematch
        </button>
      </div>
      <div className="mgx-scoreboard">
        {leaderboard.map((entry) => (
          <div key={entry.id} className={`mgx-score-row ${winner?.id === entry.id ? 'active' : ''}`}>
            <div className="mgx-player-chip" style={{ background: entry.color }} />
            <div className="mgx-player-copy">
              <strong>{entry.username}</strong>
              <span className="mgx-muted">{entry.totalStrokes} strokes</span>
            </div>
            <strong>{relativeLabel(entry.relativeToPar)}</strong>
          </div>
        ))}
      </div>
    </div>
  </div>
)

const MiniGolfHud = (props) => {
  const {
    phase,
    courses,
    players,
    readyMap,
    votes,
    selectedCourseId,
    leadingCourseId,
    leadingCourse,
    currentUserId,
    canStart,
    onVoteCourse,
    onToggleReady,
    onStartGame,
    course,
    hole,
    holeIndex,
    holeCount,
    leaderboard,
    currentTurnPlayer,
    isMyTurn,
    aimState,
    selectedBallColor,
    onSelectBallColor,
    onAdvanceHole,
    winner,
    onRematch,
    progression,
    courseId
  } = props

  if (phase === MINIGOLF_PHASES.LOBBY) {
    return (
      <LobbyView
        courses={courses}
        players={players}
        readyMap={readyMap}
        votes={votes}
        selectedCourseId={selectedCourseId}
        leadingCourseId={leadingCourseId}
        leadingCourse={leadingCourse}
        onVoteCourse={onVoteCourse}
        onToggleReady={onToggleReady}
        onStartGame={onStartGame}
        currentUserId={currentUserId}
        canStart={canStart}
      />
    )
  }

  if (phase === MINIGOLF_PHASES.PLAYING) {
    return (
      <PlayingView
        course={course}
        hole={hole}
        holeIndex={holeIndex}
        holeCount={holeCount}
        leaderboard={leaderboard}
        currentTurnPlayer={currentTurnPlayer}
        isMyTurn={isMyTurn}
        aimState={aimState}
        selectedBallColor={selectedBallColor}
        onSelectBallColor={onSelectBallColor}
        progression={progression}
        courseId={courseId}
      />
    )
  }

  if (phase === MINIGOLF_PHASES.HOLE_SUMMARY) {
    const isLastHole = holeIndex >= holeCount - 1
    return <SummaryView leaderboard={leaderboard} onAdvanceHole={onAdvanceHole} lastHole={isLastHole} />
  }

  return <FinishedView leaderboard={leaderboard} winner={winner} onRematch={onRematch} />
}

export default MiniGolfHud
