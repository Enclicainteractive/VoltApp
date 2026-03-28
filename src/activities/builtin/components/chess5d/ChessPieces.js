/**
 * Chess Piece Symbols for DOM rendering
 * Unicode chess symbols - no canvas needed
 */

export const PIECE_SYMBOLS = {
  wk: '\u2654', // White King ♔
  wq: '\u2655', // White Queen ♕
  wr: '\u2656', // White Rook ♖
  wb: '\u2657', // White Bishop ♗
  wn: '\u2658', // White Knight ♘
  wp: '\u2659', // White Pawn ♙
  bk: '\u265A', // Black King ♚
  bq: '\u265B', // Black Queen ♛
  br: '\u265C', // Black Rook ♜
  bb: '\u265D', // Black Bishop ♝
  bn: '\u265E', // Black Knight ♞
  bp: '\u265F' // Black Pawn ♟
}

export const getPieceSymbol = (piece) => {
  if (!piece) return ''
  return PIECE_SYMBOLS[piece] || ''
}
