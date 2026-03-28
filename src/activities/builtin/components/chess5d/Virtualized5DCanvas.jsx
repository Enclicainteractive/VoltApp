/**
 * Virtualized 5D Chess Canvas - Fixed version with proper rendering
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import {
  renderBoard,
  renderTimelineArrow,
  renderPresentLine,
  getBoardPosition,
  preloadPieceImages,
  CELL_SIZE,
  BOARD_SIZE,
  BOARD_GAP_X,
  TIMELINE_GAP_Y,
  LABEL_HEIGHT,
  MARGIN_LEFT,
  MARGIN_TOP,
  COLORS
} from './CanvasRenderer'

const Virtualized5DCanvas = React.memo(({
  state,
  zoom,
  pan,
  selectedPiece,
  validMoves,
  lastMove,
  checkBoardSet,
  presentTurn,
  timelineActiveMap,
  onCellClick,
  width = 800,
  height = 600
}) => {
  const canvasRef = useRef(null)
  const frameCountRef = useRef(0)
  
  // Preload piece images
  useEffect(() => {
    preloadPieceImages()
  }, [])
  
  // Calculate visible boards
  const visibleBoards = useMemo(() => {
    if (!state?.timelines || state.timelines.length === 0) return []
    
    const boards = []
    const { timelines } = state
    
    // Simple: render all boards (virtualization can be added later if needed)
    timelines.forEach((tl, timelineIndex) => {
      const isActive = timelineActiveMap?.[tl.id] ?? true
      
      tl.boards.forEach((board, boardIndex) => {
        const pos = getBoardPosition(timelineIndex, boardIndex, board.turnNumber)
        const isPlayable = board.isPlayable && isActive
        const isPresent = Math.abs(board.turnNumber - presentTurn) < 0.01 && 
                        isActive && board.activeFor === state.currentTurn
        const boardKey = `${timelineIndex},${boardIndex}`
        const isInCheck = checkBoardSet?.has(boardKey) ?? false
        
        // Get valid moves for this board
        let boardValidMoves = []
        if (isPlayable && selectedPiece) {
          boardValidMoves = validMoves
            .filter(m => m.timelineIndex === timelineIndex && m.boardIndex === boardIndex)
            .map(m => ({ ...m }))
        }
        
        boards.push({
          timelineIndex,
          boardIndex,
          board,
          pos,
          isActive,
          isPlayable,
          isPresent,
          isInCheck,
          validMoves: boardValidMoves
        })
      })
    })
    
    return boards
  }, [state, selectedPiece, validMoves, checkBoardSet, presentTurn, timelineActiveMap])
  
  // Main render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    frameCountRef.current++
    
    // Clear
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 0, width, height)
    
    // Apply transform
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    
    // Draw timeline arrows
    if (state?.timelines) {
      state.timelines.forEach((tl, ti) => {
        if (tl.createdBy !== null && ti > 0) {
          const parentCreationOrder = tl.creationOrder - 1
          const parentTl = state.timelines.find(t => 
            t.createdBy === tl.createdBy && t.creationOrder === parentCreationOrder
          )
          if (parentTl) {
            const parentIdx = state.timelines.indexOf(parentTl)
            const pos1 = getBoardPosition(parentIdx, 0, 0)
            const pos2 = getBoardPosition(ti, 0, 0)
            
            renderTimelineArrow(ctx, 
              pos1.x - 50,
              pos1.y + LABEL_HEIGHT + BOARD_SIZE / 2,
              pos2.y + LABEL_HEIGHT + BOARD_SIZE / 2,
              {
                color: timelineActiveMap?.[tl.id] ? COLORS.activeTimeline : '#555555',
                isActive: timelineActiveMap?.[tl.id] ?? true,
                timelineId: tl.id
              }
            )
          }
        }
      })
    }
    
    // Draw present line
    const totalHeight = Math.max(1, state?.timelines?.length || 1) * (BOARD_SIZE + TIMELINE_GAP_Y + LABEL_HEIGHT) + 100
    renderPresentLine(ctx, MARGIN_LEFT + presentTurn * (BOARD_SIZE + BOARD_GAP_X) + BOARD_SIZE / 2, -50, totalHeight, {
      animationOffset: frameCountRef.current
    })
    
    // Draw boards
    visibleBoards.forEach(({
      timelineIndex,
      boardIndex,
      board,
      pos,
      isActive,
      isPlayable,
      isPresent,
      isInCheck,
      validMoves: boardValidMoves
    }) => {
      // Last move on this board
      let boardLastMove = null
      if (lastMove) {
        const isFrom = lastMove.from.timelineIndex === timelineIndex && lastMove.from.boardIndex === boardIndex
        const isTo = lastMove.to.timelineIndex === timelineIndex && lastMove.to.boardIndex === boardIndex
        if (isFrom || isTo) {
          boardLastMove = lastMove
        }
      }
      
      // Selected cell
      const isSelected = selectedPiece &&
        selectedPiece.timelineIndex === timelineIndex &&
        selectedPiece.boardIndex === boardIndex
      
      renderBoard(ctx, board.board, pos.x, pos.y, {
        isSelected,
        selectedCell: isSelected ? { x: selectedPiece.x, y: selectedPiece.y } : null,
        validMoves: boardValidMoves,
        lastMove: boardLastMove,
        isInCheck,
        isPlayable,
        isPresent,
        isActive,
        activeFor: board.activeFor,
        turnNumber: board.turnNumber,
        timelineId: state.timelines[timelineIndex].id,
        boardIndex
      })
      
      // Timeline label (only first board)
      if (boardIndex === 0) {
        ctx.save()
        ctx.font = 'bold 12px monospace'
        ctx.fillStyle = isActive ? COLORS.activeTimeline : COLORS.inactiveText
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        
        const labelX = pos.x - 60
        const labelY = pos.y + LABEL_HEIGHT + BOARD_SIZE / 2
        
        // Arrow
        ctx.beginPath()
        ctx.moveTo(labelX + 8, labelY - 10)
        ctx.lineTo(labelX + 20, labelY)
        ctx.lineTo(labelX + 8, labelY + 10)
        ctx.fillStyle = isActive ? COLORS.activeTimeline : COLORS.inactiveText
        ctx.fill()
        
        // Label
        ctx.fillText(`T${state.timelines[timelineIndex].id}`, labelX, labelY)
        ctx.restore()
      }
    })
    
    ctx.restore()
  }, [state, visibleBoards, zoom, pan, width, height, selectedPiece, validMoves, lastMove, checkBoardSet, presentTurn, timelineActiveMap])
  
  // Render on mount and when deps change
  useEffect(() => {
    render()
  }, [render])
  
  // Handle click
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas || !onCellClick) return
    
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    
    const worldX = (clientX - pan.x) / zoom
    const worldY = (clientY - pan.y) / zoom
    
    for (const board of visibleBoards) {
      const { pos, timelineIndex, boardIndex } = board
      const boardX = pos.x
      const boardY = pos.y + LABEL_HEIGHT
      
      if (worldX >= boardX && worldX < boardX + BOARD_SIZE &&
          worldY >= boardY && worldY < boardY + BOARD_SIZE) {
        const cellX = Math.floor((worldX - boardX) / CELL_SIZE)
        const cellY = Math.floor((worldY - boardY) / CELL_SIZE)
        
        if (cellX >= 0 && cellX < 8 && cellY >= 0 && cellY < 8) {
          onCellClick(timelineIndex, boardIndex, cellY, cellX)
          return
        }
      }
    }
  }, [visibleBoards, zoom, pan, onCellClick])
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: width,
        height: height,
        cursor: 'pointer'
      }}
    />
  )
})

Virtualized5DCanvas.displayName = 'Virtualized5DCanvas'

export default Virtualized5DCanvas
