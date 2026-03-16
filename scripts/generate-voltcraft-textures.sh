#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/public/textures/voltcraft"
mkdir -p "$OUT_DIR"

# Check for ImageMagick
if ! command -v magick &> /dev/null; then
  echo "ImageMagick not found. Installing..."
  apt-get update && apt-get install -y imagemagick
fi

# ============ BASIC BLOCKS ============

# Grass Top
magick -size 16x16 xc:'#6da622' \
  -fill '#90c845' -draw 'rectangle 0,0 15,3' \
  -fill '#7eb635' -draw 'rectangle 0,4 15,15' \
  -fill '#a5db58' -draw 'rectangle 1,1 3,2 rectangle 6,0 8,1 rectangle 11,2 13,3 rectangle 4,5 5,6 rectangle 9,6 11,7 rectangle 2,10 4,11 rectangle 12,12 14,13' \
  -fill '#4f7e17' -draw 'rectangle 0,6 1,7 rectangle 7,4 9,5 rectangle 13,8 15,9 rectangle 5,12 6,13 rectangle 10,10 11,11' \
  "$OUT_DIR/grass-top.png"

# Grass Side
magick -size 16x16 xc:'#7a4a22' \
  -fill '#69b228' -draw 'rectangle 0,0 15,3' \
  -fill '#8a5628' -draw 'rectangle 0,4 15,15' \
  -fill '#95d54f' -draw 'rectangle 0,2 2,3 rectangle 5,1 7,2 rectangle 11,2 15,3' \
  -fill '#9b6230' -draw 'rectangle 1,5 3,6 rectangle 8,4 10,5 rectangle 12,7 15,8 rectangle 3,10 6,11 rectangle 10,12 13,13' \
  -fill '#613717' -draw 'rectangle 0,8 1,9 rectangle 5,6 6,7 rectangle 8,11 9,12 rectangle 14,14 15,15' \
  "$OUT_DIR/grass-side.png"

# Dirt
magick -size 16x16 xc:'#7a4a22' \
  -fill '#92592a' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,2 15,4 rectangle 2,7 5,8 rectangle 9,6 13,8 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 13,10 15,12' \
  -fill '#5c3415' -draw 'rectangle 0,4 1,5 rectangle 5,2 6,3 rectangle 10,9 11,10 rectangle 4,13 5,14 rectangle 12,6 13,7' \
  "$OUT_DIR/dirt.png"

# Stone
magick -size 16x16 xc:'#8f959d' \
  -fill '#b2b8bf' -draw 'rectangle 1,1 4,2 rectangle 7,0 9,2 rectangle 13,1 15,3 rectangle 3,6 5,7 rectangle 9,5 13,7 rectangle 1,11 4,12 rectangle 7,12 10,14 rectangle 12,10 14,12' \
  -fill '#70767d' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/stone.png"

# Cobblestone
magick -size 16x16 xc:'#737882' \
  -fill '#969ca6' -draw 'rectangle 1,1 3,3 rectangle 6,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 7,5 10,7 rectangle 12,7 15,9 rectangle 0,11 2,13 rectangle 5,11 8,14 rectangle 11,12 14,14' \
  -fill '#575c65' -draw 'rectangle 4,3 5,4 rectangle 10,3 11,4 rectangle 5,9 6,10 rectangle 9,9 10,10 rectangle 3,14 4,15' \
  "$OUT_DIR/cobblestone.png"

# Sand
magick -size 16x16 xc:'#e7d17a' \
  -fill '#f4df96' -draw 'rectangle 1,1 4,2 rectangle 8,0 11,2 rectangle 13,3 15,4 rectangle 3,7 6,8 rectangle 9,6 12,8 rectangle 1,12 4,13 rectangle 8,11 10,13 rectangle 13,12 15,14' \
  -fill '#c6ae5d' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 7,9 8,10 rectangle 11,14 12,15 rectangle 14,8 15,9' \
  "$OUT_DIR/sand.png"

# Sandstone
magick -size 16x16 xc:'#d0bc72' \
  -fill '#ebd790' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#b69c59' -draw 'rectangle 0,2 15,3 rectangle 0,7 15,8 rectangle 0,12 15,13' \
  -fill '#9c8446' -draw 'rectangle 3,1 4,4 rectangle 10,6 11,9 rectangle 6,11 7,14 rectangle 13,0 14,3' \
  "$OUT_DIR/sandstone.png"

# Clay
magick -size 16x16 xc:'#9aa8b0' \
  -fill '#b7c4cc' -draw 'rectangle 1,1 4,3 rectangle 7,0 10,2 rectangle 12,2 15,4 rectangle 2,8 5,10 rectangle 8,6 12,8 rectangle 0,12 3,14 rectangle 9,12 13,14' \
  -fill '#74838a' -draw 'rectangle 5,4 6,5 rectangle 11,5 12,6 rectangle 6,10 7,11 rectangle 14,12 15,13' \
  "$OUT_DIR/clay.png"

# Snow
magick -size 16x16 xc:'#eef4fb' \
  -fill '#ffffff' -draw 'rectangle 0,0 15,5 rectangle 1,8 5,10 rectangle 8,7 15,9 rectangle 4,12 11,15' \
  -fill '#d8e2ec' -draw 'rectangle 0,6 2,7 rectangle 6,5 9,6 rectangle 12,10 15,11 rectangle 0,13 3,15' \
  -fill '#b9c8d3' -draw 'rectangle 7,11 8,12 rectangle 13,5 14,6' \
  "$OUT_DIR/snow.png"

# Gravel
magick -size 16x16 xc:'#9e8d7a' \
  -fill '#b5a595' -draw 'rectangle 1,1 3,2 rectangle 6,0 8,2 rectangle 11,1 14,3 rectangle 2,6 4,7 rectangle 8,5 11,7 rectangle 1,11 3,12 rectangle 6,12 9,14 rectangle 12,10 15,12' \
  -fill '#7a6b5c' -draw 'rectangle 0,4 1,5 rectangle 4,3 5,4 rectangle 9,8 10,9 rectangle 3,13 4,14 rectangle 13,14 15,15' \
  "$OUT_DIR/gravel.png"

# ============ ORES ============

# Coal Ore
magick -size 16x16 xc:'#7f868d' \
  -fill '#a1a8b0' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#2a2e33' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#4d545a' -draw 'rectangle 0,5 1,6 rectangle 7,2 8,3 rectangle 14,8 15,9' \
  "$OUT_DIR/coal-ore.png"

# Iron Ore
magick -size 16x16 xc:'#858b92' \
  -fill '#a6adb5' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#d09c62' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#7c552f' -draw 'rectangle 5,5 5,5 rectangle 11,5 11,5 rectangle 7,10 7,10 rectangle 13,13 13,13' \
  "$OUT_DIR/iron-ore.png"

# Gold Ore
magick -size 16x16 xc:'#8a8254' \
  -fill '#b5a870' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#ffd700' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#b8860b' -draw 'rectangle 5,5 5,5 rectangle 11,5 11,5 rectangle 7,10 7,10 rectangle 13,13 13,13' \
  "$OUT_DIR/gold-ore.png"

# Diamond Ore
magick -size 16x16 xc:'#6b7d8a' \
  -fill '#8fa0ad' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#4ecca3' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#2d8b74' -draw 'rectangle 5,5 5,5 rectangle 11,5 11,5 rectangle 7,10 7,10 rectangle 13,13 13,13' \
  "$OUT_DIR/diamond-ore.png"

# Redstone Ore
magick -size 16x16 xc:'#7f868d' \
  -fill '#a1a8b0' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#ff0000' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#cc0000' -draw 'rectangle 5,5 5,5 rectangle 11,5 11,5 rectangle 7,10 7,10 rectangle 13,13 13,13' \
  "$OUT_DIR/redstone-ore.png"

# Lapis Ore
magick -size 16x16 xc:'#7f868d' \
  -fill '#a1a8b0' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#3b82f6' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#1d4ed8' -draw 'rectangle 5,5 5,5 rectangle 11,5 11,5 rectangle 7,10 7,10 rectangle 13,13 13,13' \
  "$OUT_DIR/lapis-ore.png"

# Emerald Ore
magick -size 16x16 xc:'#7f868d' \
  -fill '#a1a8b0' -draw 'rectangle 1,1 4,2 rectangle 8,0 10,1 rectangle 12,2 15,3 rectangle 2,7 5,8 rectangle 9,10 12,12 rectangle 1,13 4,14' \
  -fill '#10b981' -draw 'rectangle 4,4 6,6 rectangle 10,4 12,6 rectangle 6,9 8,11 rectangle 12,12 14,14 rectangle 2,11 3,12' \
  -fill '#047857' -draw 'rectangle 5,5 5,5 rectangle 11,5 11,5 rectangle 7,10 7,10 rectangle 13,13 13,13' \
  "$OUT_DIR/emerald-ore.png"

# ============ BLOCKS ============

# Coal Block
magick -size 16x16 xc:'#2a2a2a' \
  -fill '#3a3a3a' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#111111' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#666666' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/coal-block.png"

# Iron Block
magick -size 16x16 xc:'#e2e8f0' \
  -fill '#f1f5f9' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#cbd5e1' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#94a3b8' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/iron-block.png"

# Gold Block
magick -size 16x16 xc:'#fbbf24' \
  -fill '#fcd34d' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#f59e0b' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#d97706' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/gold-block.png"

# Diamond Block
magick -size 16x16 xc:'#22d3ee' \
  -fill '#67e8f9' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#06b6d4' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#0891b2' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/diamond-block.png"

# Lapis Block
magick -size 16x16 xc:'#3b82f6' \
  -fill '#60a5fa' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#2563eb' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#1d4ed8' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/lapis-block.png"

# Emerald Block
magick -size 16x16 xc:'#10b981' \
  -fill '#34d399' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#059669' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#047857' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/emerald-block.png"

# Redstone Block
magick -size 16x16 xc:'#dc2626' \
  -fill '#ef4444' -draw 'rectangle 0,0 15,1 rectangle 0,5 15,6 rectangle 0,10 15,11' \
  -fill '#b91c1c' -draw 'rectangle 2,2 5,4 rectangle 9,2 13,4 rectangle 1,7 4,9 rectangle 8,7 12,9 rectangle 3,12 6,14 rectangle 10,12 14,14' \
  -fill '#991b1b' -draw 'rectangle 6,3 7,4 rectangle 13,8 14,9 rectangle 7,13 8,14' \
  "$OUT_DIR/redstone-block.png"

# ============ WOOD & LEAVES ============

# Oak Log Side
magick -size 16x16 xc:'#8b5a2b' \
  -fill '#6c421d' -draw 'rectangle 2,0 3,15 rectangle 7,0 8,15 rectangle 12,0 13,15' \
  -fill '#a9723d' -draw 'rectangle 0,3 15,3 rectangle 0,11 15,11' \
  "$OUT_DIR/oak-log-side.png"

# Oak Log Top
magick -size 16x16 xc:'#cf9d58' \
  -fill none -stroke '#7c4a20' -strokewidth 2 -draw 'rectangle 2,2 13,13' \
  -fill none -stroke '#a8703a' -strokewidth 1 -draw 'rectangle 5,5 10,10' \
  -fill '#d8ae70' -draw 'rectangle 6,6 9,9' \
  "$OUT_DIR/oak-log-top.png"

# Spruce Log Side
magick -size 16x16 xc:'#3d2817' \
  -fill '#2a1a0f' -draw 'rectangle 2,0 3,15 rectangle 7,0 8,15 rectangle 12,0 13,15' \
  -fill '#5c3d26' -draw 'rectangle 0,3 15,3 rectangle 0,11 15,11' \
  "$OUT_DIR/spruce-log-side.png"

# Spruce Log Top
magick -size 16x16 xc:'#4a3728' \
  -fill none -stroke '#2a1a0f' -strokewidth 2 -draw 'rectangle 2,2 13,13' \
  -fill none -stroke '#3d2817' -strokewidth 1 -draw 'rectangle 5,5 10,10' \
  -fill '#5c4532' -draw 'rectangle 6,6 9,9' \
  "$OUT_DIR/spruce-log-top.png"

# Birch Log Side
magick -size 16x16 xc:'#c4a35a' \
  -fill '#a08240' -draw 'rectangle 2,0 3,15 rectangle 7,0 8,15 rectangle 12,0 13,15' \
  -fill '#d4b870' -draw 'rectangle 0,3 15,3 rectangle 0,11 15,11' \
  "$OUT_DIR/birch-log-side.png"

# Birch Log Top
magick -size 16x16 xc:'#d4c48a' \
  -fill none -stroke '#a08240' -strokewidth 2 -draw 'rectangle 2,2 13,13' \
  -fill none -stroke '#c4a35a' -strokewidth 1 -draw 'rectangle 5,5 10,10' \
  -fill '#e0d4a0' -draw 'rectangle 6,6 9,9' \
  "$OUT_DIR/birch-log-top.png"

# Jungle Log Side
magick -size 16x16 xc:'#4a3728' \
  -fill '#2e1f15' -draw 'rectangle 2,0 3,15 rectangle 7,0 8,15 rectangle 12,0 13,15' \
  -fill '#6e5040' -draw 'rectangle 0,3 15,3 rectangle 0,11 15,11' \
  "$OUT_DIR/jungle-log-side.png"

# Jungle Log Top
magick -size 16x16 xc:'#5e4a38' \
  -fill none -stroke '#2e1f15' -strokewidth 2 -draw 'rectangle 2,2 13,13' \
  -fill none -stroke '#4a3728' -strokewidth 1 -draw 'rectangle 5,5 10,10' \
  -fill '#7e6a58' -draw 'rectangle 6,6 9,9' \
  "$OUT_DIR/jungle-log-top.png"

# Oak Planks
magick -size 16x16 xc:'#c58a47' \
  -fill '#dfaa67' -draw 'rectangle 0,0 15,2 rectangle 0,6 15,8 rectangle 0,12 15,14' \
  -fill '#8b5a2b' -draw 'rectangle 0,3 15,3 rectangle 0,9 15,9 rectangle 0,15 15,15' \
  -fill '#b57838' -draw 'rectangle 4,0 5,5 rectangle 11,6 12,11 rectangle 7,12 8,15' \
  "$OUT_DIR/oak-planks.png"

# Spruce Planks
magick -size 16x16 xc:'#6d4c30' \
  -fill '#8a6448' -draw 'rectangle 0,0 15,2 rectangle 0,6 15,8 rectangle 0,12 15,14' \
  -fill '#4a3020' -draw 'rectangle 0,3 15,3 rectangle 0,9 15,9 rectangle 0,15 15,15' \
  -fill '#5a4030' -draw 'rectangle 4,0 5,5 rectangle 11,6 12,11 rectangle 7,12 8,15' \
  "$OUT_DIR/spruce-planks.png"

# Birch Planks
magick -size 16x16 xc:'#d4c48a' \
  -fill '#e8dca8' -draw 'rectangle 0,0 15,2 rectangle 0,6 15,8 rectangle 0,12 15,14' \
  -fill '#b0a06a' -draw 'rectangle 0,3 15,3 rectangle 0,9 15,9 rectangle 0,15 15,15' \
  -fill '#c0b080' -draw 'rectangle 4,0 5,5 rectangle 11,6 12,11 rectangle 7,12 8,15' \
  "$OUT_DIR/birch-planks.png"

# Jungle Planks
magick -size 16x16 xc:'#5c4835' \
  -fill '#7e6a55' -draw 'rectangle 0,0 15,2 rectangle 0,6 15,8 rectangle 0,12 15,14' \
  -fill '#3a2e20' -draw 'rectangle 0,3 15,3 rectangle 0,9 15,9 rectangle 0,15 15,15' \
  -fill '#4a3e30' -draw 'rectangle 4,0 5,5 rectangle 11,6 12,11 rectangle 7,12 8,15' \
  "$OUT_DIR/jungle-planks.png"

# Oak Leaves
magick -size 16x16 xc:none \
  -fill '#2f7a2c' -draw 'rectangle 0,1 4,5 rectangle 6,0 9,3 rectangle 11,1 15,5 rectangle 1,7 5,10 rectangle 8,6 13,9 rectangle 4,11 9,15 rectangle 11,10 15,14' \
  -fill '#59b53b' -draw 'rectangle 1,2 3,4 rectangle 7,1 8,2 rectangle 12,2 14,4 rectangle 2,8 4,9 rectangle 9,7 11,8 rectangle 5,12 8,14 rectangle 12,11 14,13' \
  -fill '#8ee562' -draw 'rectangle 8,12 8,12 rectangle 13,3 13,3 rectangle 3,9 3,9' \
  "$OUT_DIR/oak-leaves.png"

# Spruce Leaves
magick -size 16x16 xc:none \
  -fill '#1a4d1a' -draw 'rectangle 0,0 4,4 rectangle 6,1 9,3 rectangle 11,0 15,4 rectangle 1,6 5,9 rectangle 8,5 13,8 rectangle 4,10 9,14 rectangle 11,9 15,13' \
  -fill '#2d7a2d' -draw 'rectangle 1,1 3,3 rectangle 7,2 8,3 rectangle 12,1 14,3 rectangle 2,7 4,8 rectangle 9,6 11,7 rectangle 5,11 8,13 rectangle 12,10 14,12' \
  -fill '#4da64d' -draw 'rectangle 8,11 8,11 rectangle 13,2 13,2 rectangle 3,8 3,8' \
  "$OUT_DIR/spruce-leaves.png"

# Birch Leaves
magick -size 16x16 xc:none \
  -fill '#7cb342' -draw 'rectangle 0,1 4,5 rectangle 6,0 9,3 rectangle 11,1 15,5 rectangle 1,7 5,10 rectangle 8,6 13,9 rectangle 4,11 9,15 rectangle 11,10 15,14' \
  -fill '#9ccc65' -draw 'rectangle 1,2 3,4 rectangle 7,1 8,2 rectangle 12,2 14,4 rectangle 2,8 4,9 rectangle 9,7 11,8 rectangle 5,12 8,14 rectangle 12,11 14,13' \
  -fill '#b2d88e' -draw 'rectangle 8,12 8,12 rectangle 13,3 13,3 rectangle 3,9 3,9' \
  "$OUT_DIR/birch-leaves.png"

# Jungle Leaves
magick -size 16x16 xc:none \
  -fill '#2e7d32' -draw 'rectangle 0,1 4,5 rectangle 6,0 9,3 rectangle 11,1 15,5 rectangle 1,7 5,10 rectangle 8,6 13,9 rectangle 4,11 9,15 rectangle 11,10 15,14' \
  -fill '#4caf50' -draw 'rectangle 1,2 3,4 rectangle 7,1 8,2 rectangle 12,2 14,4 rectangle 2,8 4,9 rectangle 9,7 11,8 rectangle 5,12 8,14 rectangle 12,11 14,13' \
  -fill '#81c784' -draw 'rectangle 8,12 8,12 rectangle 13,3 13,3 rectangle 3,9 3,9' \
  "$OUT_DIR/jungle-leaves.png"

# ============ FUNCTIONAL BLOCKS ============

# Glass
magick -size 16x16 xc:none \
  -fill '#dceff8' -draw 'rectangle 1,1 14,14' \
  -fill '#a7d4ea' -draw 'rectangle 2,2 13,13' \
  -fill none -stroke '#78aecb' -strokewidth 1 -draw 'rectangle 1,1 14,14' \
  -fill '#ffffff80' -draw 'rectangle 3,3 5,5 rectangle 9,4 11,6 rectangle 6,10 8,12' \
  "$OUT_DIR/glass.png"

# Glass Pane
magick -size 16x16 xc:none \
  -fill '#dceff8' -draw 'rectangle 0,0 15,1 rectangle 0,14 15,15 rectangle 0,0 1,15 rectangle 14,0 15,15' \
  -fill '#a7d4ea' -draw 'rectangle 2,2 13,13' \
  -fill none -stroke '#78aecb' -strokewidth 1 -draw 'rectangle 0,0 15,1 rectangle 0,14 15,15 rectangle 0,0 1,15 rectangle 14,0 15,15' \
  "$OUT_DIR/glass-pane.png"

# Brick
magick -size 16x16 xc:'#996039' \
  -fill '#bd7e52' -draw 'rectangle 0,0 7,3 rectangle 8,4 15,7 rectangle 0,8 7,11 rectangle 8,12 15,15' \
  -fill '#7a4726' -draw 'rectangle 7,0 8,15 rectangle 0,7 15,8' \
  -fill '#d69666' -draw 'rectangle 2,1 5,2 rectangle 10,5 13,6 rectangle 1,9 4,10 rectangle 11,13 14,14' \
  "$OUT_DIR/brick.png"

# Nether Brick
magick -size 16x16 xc:'#2d1f1f' \
  -fill '#4a3535' -draw 'rectangle 0,0 7,3 rectangle 8,4 15,7 rectangle 0,8 7,11 rectangle 8,12 15,15' \
  -fill '#1a1212' -draw 'rectangle 7,0 8,15 rectangle 0,7 15,8' \
  -fill '#5e4545' -draw 'rectangle 2,1 5,2 rectangle 10,5 13,6 rectangle 1,9 4,10 rectangle 11,13 14,14' \
  "$OUT_DIR/nether-brick.png"

# Obsidian
magick -size 16x16 xc:'#1a1a2e' \
  -fill '#2d2d4a' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,2 15,4 rectangle 2,7 5,8 rectangle 9,6 12,8 rectangle 1,11 3,12 rectangle 6,12 9,14 rectangle 12,10 15,12' \
  -fill '#0d0d1a' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 10,9 11,10 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/obsidian.png"

# Bedrock
magick -size 16x16 xc:'#1a1a1a' \
  -fill '#2d2d2d' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,2 15,4 rectangle 2,7 5,8 rectangle 9,6 12,8 rectangle 1,11 3,12 rectangle 6,12 9,14 rectangle 12,10 15,12' \
  -fill '#0d0d0d' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 10,9 11,10 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/bedrock.png"

# ============ INTERACTIVE BLOCKS ============

# Crafting Table Top
magick -size 16x16 xc:'#8b5a2b' \
  -fill '#d8a24a' -draw 'rectangle 1,0 14,4' \
  -fill '#5c3416' -draw 'rectangle 0,5 15,15' \
  -fill '#b87a2b' -draw 'rectangle 2,2 4,3 rectangle 7,1 10,3 rectangle 12,2 13,3' \
  -fill '#3d2410' -draw 'rectangle 3,7 4,15 rectangle 7,7 8,15 rectangle 11,7 12,15' \
  "$OUT_DIR/crafting-table-top.png"

# Crafting Table Side
magick -size 16x16 xc:'#88552a' \
  -fill '#b87d3d' -draw 'rectangle 1,1 5,14 rectangle 10,2 14,13' \
  -fill '#5e3518' -draw 'rectangle 6,0 8,15 rectangle 0,6 15,7' \
  -fill '#d49a57' -draw 'rectangle 2,3 4,5 rectangle 11,8 13,10' \
  "$OUT_DIR/crafting-table-side.png"

# Furnace Front
magick -size 16x16 xc:'#9098a1' \
  -fill '#bfc6cf' -draw 'rectangle 3,2 12,5' \
  -fill '#252525' -draw 'rectangle 4,9 11,13' \
  -fill '#6d737b' -draw 'rectangle 0,1 2,3 rectangle 13,2 15,4 rectangle 1,13 4,15 rectangle 11,12 14,14' \
  "$OUT_DIR/furnace-front.png"

# Furnace Side
magick -size 16x16 xc:'#8e969e' \
  -fill '#b7bfc8' -draw 'rectangle 1,1 4,4 rectangle 10,2 14,5 rectangle 1,9 4,12 rectangle 8,11 12,14' \
  -fill '#6d747c' -draw 'rectangle 5,5 6,6 rectangle 11,8 12,9 rectangle 6,13 7,14' \
  "$OUT_DIR/furnace-side.png"

# Furnace Top
magick -size 16x16 xc:'#9ca4ae' \
  -fill '#c8d0d9' -draw 'rectangle 2,2 13,4 rectangle 5,8 10,10' \
  -fill '#727982' -draw 'rectangle 0,5 15,5 rectangle 0,12 15,12' \
  "$OUT_DIR/furnace-top.png"

# Chest
magick -size 16x16 xc:'#8b6914' \
  -fill '#a88230' -draw 'rectangle 1,1 14,3 rectangle 1,10 14,14' \
  -fill '#6a4a10' -draw 'rectangle 0,4 15,5 rectangle 0,10 15,11' \
  -fill '#c9a040' -draw 'rectangle 5,4 10,10' \
  -fill '#4a3008' -draw 'rectangle 6,6 9,8' \
  "$OUT_DIR/chest.png"

# ============ REDSTONE ============

# Redstone Torch Off
magick -size 16x16 xc:none \
  -fill '#666666' -draw 'rectangle 7,4 8,14' \
  -fill '#888888' -draw 'rectangle 6,3 9,4' \
  "$OUT_DIR/redstone-torch-off.png"

# Redstone Torch On
magick -size 16x16 xc:none \
  -fill '#ff0000' -draw 'rectangle 7,4 8,14' \
  -fill '#ff6666' -draw 'rectangle 6,3 9,4' \
  "$OUT_DIR/redstone-torch-on.png"

# Lever
magick -size 16x16 xc:'#8b8b8b' \
  -fill '#a0a0a0' -draw 'rectangle 6,8 9,14' \
  -fill '#6b6b6b' -draw 'rectangle 7,1 8,9' \
  "$OUT_DIR/lever.png"

# Stone Button
magick -size 16x16 xc:'#8b8b8b' \
  -fill '#a0a0a0' -draw 'rectangle 2,6 13,9' \
  -fill '#6b6b6b' -draw 'rectangle 0,7 1,8 rectangle 14,7 15,8' \
  "$OUT_DIR/button.png"

# Stone Pressure Plate
magick -size 16x16 xc:'#8b8b8b' \
  -fill '#a0a0a0' -draw 'rectangle 0,6 15,9' \
  -fill '#6b6b6b' -draw 'rectangle 0,5 1,6 rectangle 14,5 15,6' \
  "$OUT_DIR/pressure-plate.png"

# ============ FENCE & DOORS ============

# Oak Fence
magick -size 16x16 xc:none \
  -fill '#8b6914' -draw 'rectangle 0,2 2,14 rectangle 5,8 6,14 rectangle 9,2 10,14 rectangle 14,8 15,14' \
  -fill '#6a4a10' -draw 'rectangle 2,0 13,1 rectangle 2,14 13,15' \
  "$OUT_DIR/fence-oak.png"

# Fence Gate
magick -size 16x16 xc:none \
  -fill '#8b6914' -draw 'rectangle 2,0 3,15 rectangle 5,2 6,13 rectangle 9,2 10,13 rectangle 12,0 13,15' \
  -fill '#6a4a10' -draw 'rectangle 0,0 15,1 rectangle 0,14 15,15' \
  "$OUT_DIR/fence-gate-oak.png"

# Oak Door
magick -size 16x16 xc:'#8b6914' \
  -fill '#a88230' -draw 'rectangle 1,0 6,3 rectangle 9,0 14,3 rectangle 1,6 14,7 rectangle 1,13 14,14' \
  -fill '#6a4a10' -draw 'rectangle 0,3 15,4 rectangle 0,11 15,12' \
  -fill '#c9a040' -draw 'rectangle 7,4 8,11' \
  "$OUT_DIR/door-oak.png"

# Trapdoor
magick -size 16x16 xc:'#8b6914' \
  -fill '#a88230' -draw 'rectangle 0,0 15,3 rectangle 0,12 15,15' \
  -fill '#6a4a10' -draw 'rectangle 0,3 15,4 rectangle 0,11 15,12' \
  -fill '#c9a040' -draw 'rectangle 6,5 9,10' \
  "$OUT_DIR/trapdoor-oak.png"

# ============ FLUIDS ============

# Water
magick -size 16x16 xc:'#2570d8' \
  -fill '#60a5fa' -draw 'rectangle 0,2 4,4 rectangle 7,1 11,3 rectangle 12,4 15,6 rectangle 2,8 7,10 rectangle 10,9 15,11 rectangle 0,13 5,15 rectangle 8,12 12,14' \
  -fill '#8fc7ff' -draw 'rectangle 4,4 5,5 rectangle 12,2 13,3 rectangle 6,11 7,12 rectangle 13,12 14,13' \
  "$OUT_DIR/water.png"

# Lava
magick -size 16x16 xc:'#ea580c' \
  -fill '#f97316' -draw 'rectangle 0,2 4,4 rectangle 7,1 11,3 rectangle 12,4 15,6 rectangle 2,8 7,10 rectangle 10,9 15,11 rectangle 0,13 5,15 rectangle 8,12 12,14' \
  -fill '#fb923c' -draw 'rectangle 4,4 5,5 rectangle 12,2 13,3 rectangle 6,11 7,12 rectangle 13,12 14,13' \
  "$OUT_DIR/lava.png"

# ============ WOOL ============

# White Wool
magick -size 16x16 xc:'#f5f5f5' \
  -fill '#ffffff' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#d4d4d4' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool.png"

# Red Wool
magick -size 16x16 xc:'#ef4444' \
  -fill '#f87171' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#dc2626' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-red.png"

# Orange Wool
magick -size 16x16 xc:'#f97316' \
  -fill '#fb923c' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#ea580c' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-orange.png"

# Yellow Wool
magick -size 16x16 xc:'#eab308' \
  -fill '#fcd34d' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#d97706' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-yellow.png"

# Lime Wool
magick -size 16x16 xc:'#84cc16' \
  -fill '#a3e635' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#65a30d' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-lime.png"

# Green Wool
magick -size 16x16 xc:'#22c55e' \
  -fill '#4ade80' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#16a34a' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-green.png"

# Cyan Wool
magick -size 16x16 xc:'#06b6d4' \
  -fill '#22d3ee' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#0891b2' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-cyan.png"

# Blue Wool
magick -size 16x16 xc:'#3b82f6' \
  -fill '#60a5fa' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#2563eb' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-blue.png"

# Purple Wool
magick -size 16x16 xc:'#a855f7' \
  -fill '#c084fc' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#9333ea' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-purple.png"

# Magenta Wool
magick -size 16x16 xc:'#d946ef' \
  -fill '#e879f9' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#c026d3' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-magenta.png"

# Pink Wool
magick -size 16x16 xc:'#ec4899' \
  -fill '#f472b6' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#db2777' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-pink.png"

# Brown Wool
magick -size 16x16 xc:'#92400e' \
  -fill '#b45309' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#78350f' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-brown.png"

# Light Gray Wool
magick -size 16x16 xc:'#9ca3af' \
  -fill '#d1d5db' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#6b7280' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-light-gray.png"

# Gray Wool
magick -size 16x16 xc:'#4b5563' \
  -fill '#6b7280' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#374151' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-gray.png"

# Black Wool
magick -size 16x16 xc:'#171717' \
  -fill '#374151' -draw 'rectangle 1,1 4,3 rectangle 7,0 9,2 rectangle 12,1 15,3 rectangle 2,6 4,8 rectangle 9,5 12,7 rectangle 1,11 3,13 rectangle 7,12 10,14 rectangle 12,10 15,12' \
  -fill '#0a0a0a' -draw 'rectangle 0,4 1,5 rectangle 5,3 6,4 rectangle 11,8 12,9 rectangle 4,13 5,14 rectangle 14,14 15,15' \
  "$OUT_DIR/wool-black.png"

# ============ ITEMS ============

# Torch
magick -size 16x16 xc:none \
  -fill '#5d3516' -draw 'rectangle 7,2 8,14' \
  -fill '#c88a3c' -draw 'rectangle 6,4 9,11' \
  -fill '#ffdb76' -draw 'rectangle 5,0 10,5' \
  -fill '#fff2b1' -draw 'rectangle 6,1 9,3' \
  "$OUT_DIR/torch.png"

# Coal
magick -size 16x16 xc:none \
  -fill '#111111' -draw 'rectangle 4,4 12,12' \
  -fill '#2d2d2d' -draw 'rectangle 5,5 11,11' \
  -fill '#5a5a5a' -draw 'rectangle 6,6 8,8 rectangle 9,8 10,9' \
  "$OUT_DIR/coal.png"

# Iron Ingot
magick -size 16x16 xc:none \
  -fill '#c7cbd3' -draw 'rectangle 3,6 12,9 rectangle 5,4 10,5 rectangle 5,10 10,11 rectangle 4,5 11,10' \
  -fill '#edf0f5' -draw 'rectangle 5,6 10,8' \
  -fill '#8b9098' -draw 'rectangle 3,9 12,10' \
  "$OUT_DIR/iron-ingot.png"

# Gold Ingot
magick -size 16x16 xc:none \
  -fill '#fcd34d' -draw 'rectangle 3,6 12,9 rectangle 5,4 10,5 rectangle 5,10 10,11 rectangle 4,5 11,10' \
  -fill '#fef3c7' -draw 'rectangle 5,6 10,8' \
  -fill '#d97706' -draw 'rectangle 3,9 12,10' \
  "$OUT_DIR/gold-ingot.png"

# Diamond
magick -size 16x16 xc:none \
  -fill '#22d3ee' -draw 'rectangle 4,2 11,13' \
  -fill '#67e8f9' -draw 'rectangle 5,3 10,4 rectangle 6,4 9,5 rectangle 7,5 8,11' \
  -fill '#06b6d4' -draw 'rectangle 5,11 10,12 rectangle 6,12 9,13' \
  "$OUT_DIR/diamond.png"

# Emerald
magick -size 16x16 xc:none \
  -fill '#10b981' -draw 'rectangle 4,2 11,13' \
  -fill '#34d399' -draw 'rectangle 5,3 10,4 rectangle 6,4 9,5 rectangle 7,5 8,11' \
  -fill '#059669' -draw 'rectangle 5,11 10,12 rectangle 6,12 9,13' \
  "$OUT_DIR/emerald.png"

# Redstone
magick -size 16x16 xc:none \
  -fill '#ff0000' -draw 'rectangle 3,3 12,12' \
  -fill '#ff6666' -draw 'rectangle 4,4 11,5 rectangle 5,5 10,6 rectangle 6,6 9,10' \
  -fill '#cc0000' -draw 'rectangle 5,10 10,11 rectangle 6,11 9,12' \
  "$OUT_DIR/redstone.png"

# Lapis Lazuli
magick -size 16x16 xc:none \
  -fill '#3b82f6' -draw 'rectangle 3,3 12,12' \
  -fill '#60a5fa' -draw 'rectangle 4,4 11,5 rectangle 5,5 10,6 rectangle 6,6 9,10' \
  -fill '#1d4ed8' -draw 'rectangle 5,10 10,11 rectangle 6,11 9,12' \
  "$OUT_DIR/lapis.png"

# Stick
magick -size 16x16 xc:none \
  -fill '#8b5a2b' -draw 'rectangle 7,1 8,13 rectangle 6,12 7,14 rectangle 8,3 9,5' \
  -fill '#b27a45' -draw 'rectangle 7,0 8,2 rectangle 7,6 8,8' \
  "$OUT_DIR/stick.png"

# Bow
magick -size 16x16 xc:none \
  -fill '#8b5a2b' -draw 'arc 2,2 14,14 270,90' \
  -fill '#ffffff' -draw 'line 3,8 12,8' \
  "$OUT_DIR/bow.png"

# Arrow
magick -size 16x16 xc:none \
  -fill '#8b5a2b' -draw 'rectangle 2,7 13,8' \
  -fill '#888888' -draw 'polygon 13,7 15,8 13,9' \
  -fill '#ff0000' -draw 'rectangle 0,6 2,9' \
  "$OUT_DIR/arrow.png"

# Flint
magick -size 16x16 xc:none \
  -fill '#4a4a4a' -draw 'polygon 4,2 12,4 10,12 6,14' \
  -fill '#6a6a6a' -draw 'polygon 6,4 10,6 8,10' \
  "$OUT_DIR/flint.png"

# Flint and Steel
magick -size 16x16 xc:none \
  -fill '#888888' -draw 'rectangle 2,1 13,14' \
  -fill '#aaaaaa' -draw 'rectangle 3,2 12,13' \
  -fill '#4a4a4a' -draw 'polygon 8,4 12,8 8,12' \
  "$OUT_DIR/flint-and-steel.png"

# Bucket
magick -size 16x16 xc:none \
  -fill '#888888' -draw 'rectangle 4,3 11,4 rectangle 3,4 12,12' \
  -fill '#aaaaaa' -draw 'rectangle 5,5 10,11' \
  -fill '#666666' -draw 'rectangle 2,2 5,3 rectangle 10,2 13,3' \
  "$OUT_DIR/bucket.png"

# Water Bucket
magick -size 16x16 xc:none \
  -fill '#888888' -draw 'rectangle 4,3 11,4 rectangle 3,4 12,12' \
  -fill '#3b82f6' -draw 'rectangle 5,5 10,11' \
  -fill '#666666' -draw 'rectangle 2,2 5,3 rectangle 10,2 13,3' \
  "$OUT_DIR/water-bucket.png"

# Lava Bucket
magick -size 16x16 xc:none \
  -fill '#888888' -draw 'rectangle 4,3 11,4 rectangle 3,4 12,12' \
  -fill '#ea580c' -draw 'rectangle 5,5 10,11' \
  -fill '#666666' -draw 'rectangle 2,2 5,3 rectangle 10,2 13,3' \
  "$OUT_DIR/lava-bucket.png"

# ============ FOOD ============

# Apple
magick -size 16x16 xc:none \
  -fill '#c73d39' -draw 'rectangle 4,3 11,10 rectangle 2,5 13,8 rectangle 5,1 10,2 rectangle 6,11 9,12' \
  -fill '#f06963' -draw 'rectangle 5,4 7,5 rectangle 9,4 10,5 rectangle 4,7 5,8' \
  -fill '#6a3d1d' -draw 'rectangle 7,12 8,15' \
  "$OUT_DIR/apple.png"

# Golden Apple
magick -size 16x16 xc:none \
  -fill '#ffd700' -draw 'rectangle 4,3 11,10 rectangle 2,5 13,8 rectangle 5,1 10,2 rectangle 6,11 9,12' \
  -fill '#ffec8b' -draw 'rectangle 5,4 7,5 rectangle 9,4 10,5 rectangle 4,7 5,8' \
  -fill '#6a3d1d' -draw 'rectangle 7,12 8,15' \
  "$OUT_DIR/golden-apple.png"

# Bread
magick -size 16x16 xc:none \
  -fill '#c9a040' -draw 'rectangle 2,2 13,13' \
  -fill '#e8c060' -draw 'rectangle 3,3 12,5 rectangle 3,10 12,12' \
  -fill '#8b6914' -draw 'rectangle 4,6 11,9' \
  "$OUT_DIR/bread.png"

# Raw Porkchop
magick -size 16x16 xc:none \
  -fill '#ff9999' -draw 'rectangle 3,2 12,13' \
  -fill '#cc6666' -draw 'rectangle 4,3 11,12' \
  -fill '#ffcccc' -draw 'rectangle 5,4 10,5 rectangle 5,10 10,11' \
  "$OUT_DIR/porkchop-raw.png"

# Cooked Porkchop
magick -size 16x16 xc:none \
  -fill '#8b4513' -draw 'rectangle 3,2 12,13' \
  -fill '#a0522d' -draw 'rectangle 4,3 11,12' \
  -fill '#cd853f' -draw 'rectangle 5,4 10,5 rectangle 5,10 10,11' \
  "$OUT_DIR/porkchop-cooked.png"

# Raw Chicken
magick -size 16x16 xc:none \
  -fill '#ffcccc' -draw 'rectangle 3,2 12,13' \
  -fill '#ff9999' -draw 'rectangle 4,3 11,12' \
  -fill '#ffdddd' -draw 'rectangle 5,4 10,5 rectangle 5,10 10,11' \
  "$OUT_DIR/chicken-raw.png"

# Cooked Chicken
magick -size 16x16 xc:none \
  -fill '#8b4513' -draw 'rectangle 3,2 12,13' \
  -fill '#a0522d' -draw 'rectangle 4,3 11,12' \
  -fill '#cd853f' -draw 'rectangle 5,4 10,5 rectangle 5,10 10,11' \
  "$OUT_DIR/chicken-cooked.png"

# Raw Beef
magick -size 16x16 xc:none \
  -fill '#cc0000' -draw 'rectangle 3,2 12,13' \
  -fill '#990000' -draw 'rectangle 4,3 11,12' \
  -fill '#ff3333' -draw 'rectangle 5,4 10,5 rectangle 5,10 10,11' \
  "$OUT_DIR/beef-raw.png"

# Steak
magick -size 16x16 xc:none \
  -fill '#8b4513' -draw 'rectangle 3,2 12,13' \
  -fill '#a0522d' -draw 'rectangle 4,3 11,12' \
  -fill '#cd853f' -draw 'rectangle 5,4 10,5 rectangle 5,10 10,11' \
  "$OUT_DIR/steak.png"

# Carrot
magick -size 16x16 xc:none \
  -fill '#ff6600' -draw 'rectangle 5,1 10,14' \
  -fill '#00ff00' -draw 'rectangle 4,0 6,2 rectangle 9,0 11,2' \
  -fill '#ff9933' -draw 'rectangle 6,12 9,14' \
  "$OUT_DIR/carrot.png"

# Potato
magick -size 16x16 xc:none \
  -fill '#c9a060' -draw 'rectangle 4,3 11,12' \
  -fill '#a08040' -draw 'rectangle 5,4 10,11' \
  -fill '#8b6914' -draw 'circle 6,6 7,7 circle 9,8 10,9 circle 7,9 8,10' \
  "$OUT_DIR/potato.png"

# Baked Potato
magick -size 16x16 xc:none \
  -fill '#c9a060' -draw 'rectangle 4,3 11,12' \
  -fill '#d4b070' -draw 'rectangle 5,4 10,11' \
  -fill '#8b4513' -draw 'circle 6,6 7,7 circle 9,8 10,9' \
  "$OUT_DIR/potato-baked.png"

# ============ MISC ITEMS ============

# String
magick -size 16x16 xc:none \
  -fill '#cccccc' -draw 'line 2,4 13,4' \
  -fill '#aaaaaa' -draw 'line 2,8 13,8' \
  -fill '#888888' -draw 'line 2,12 13,12' \
  "$OUT_DIR/string.png"

# Feather
magick -size 16x16 xc:none \
  -fill '#ffffff' -draw 'rectangle 7,0 8,14' \
  -fill '#cccccc' -draw 'ellipse 8,12 4,3 0 360' \
  -fill '#888888' -draw 'line 7,2 7,10' \
  "$OUT_DIR/feather.png"

# Bone
magick -size 16x16 xc:none \
  -fill '#f5f5dc' -draw 'rectangle 4,2 11,13' \
  -fill '#e8e8c8' -draw 'rectangle 5,3 10,12' \
  -fill '#cccccc' -draw 'circle 5,4 6,5 circle 10,11 11,12' \
  "$OUT_DIR/bone.png"

# Gunpowder
magick -size 16x16 xc:none \
  -fill '#333333' -draw 'circle 4,4 5,5 circle 10,3 11,4 circle 7,7 8,8 circle 12,10 13,11 circle 2,11 3,12' \
  -fill '#555555' -draw 'circle 6,2 7,3 circle 11,6 12,7 circle 3,8 4,9 circle 8,11 9,12' \
  "$OUT_DIR/gunpowder.png"

# Spider Eye
magick -size 16x16 xc:none \
  -fill '#1a1a1a' -draw 'circle 8,9 7,7' \
  -fill '#ff0000' -draw 'circle 8,8 4,4' \
  -fill '#ffffff' -draw 'circle 6,6 2,2' \
  "$OUT_DIR/spider-eye.png"

# Rotten Flesh
magick -size 16x16 xc:none \
  -fill '#8b0000' -draw 'rectangle 2,3 13,12' \
  -fill '#a52a2a' -draw 'rectangle 3,4 12,11' \
  -fill '#6b0000' -draw 'rectangle 4,5 11,10' \
  "$OUT_DIR/rotten-flesh.png"

# Ender Pearl
magick -size 16x16 xc:none \
  -fill '#1a1a2e' -draw 'circle 8,8 6,6' \
  -fill '#2d2d4a' -draw 'circle 6,6 4,4' \
  -fill '#4a4a6a' -draw 'circle 9,9 2,2' \
  "$OUT_DIR/ender-pearl.png"

# Blaze Rod
magick -size 16x16 xc:none \
  -fill '#ff6600' -draw 'rectangle 6,1 9,14' \
  -fill '#ff9933' -draw 'rectangle 7,2 8,13' \
  -fill '#ffcc00' -draw 'circle 7,3 1,1 circle 8,12 1,1' \
  "$OUT_DIR/blaze-rod.png"

# Blaze Powder
magick -size 16x16 xc:none \
  -fill '#ff6600' -draw 'circle 4,4 3,3 circle 10,5 2,2 circle 7,10 3,3 circle 12,12 2,2' \
  -fill '#ff9933' -draw 'circle 6,7 2,2 circle 11,3 1,1 circle 9,12 2,2' \
  "$OUT_DIR/blaze-powder.png"

# Ghast Tear
magick -size 16x16 xc:none \
  -fill '#ffffff' -draw 'ellipse 8,8 5,6 0 360' \
  -fill '#eeeeee' -draw 'ellipse 8,8 4,5 0 360' \
  -fill '#dddddd' -draw 'circle 6,6 2,2' \
  "$OUT_DIR/ghast-tear.png"

# Magma Cream
magick -size 16x16 xc:none \
  -fill '#ff6600' -draw 'circle 8,8 5,5' \
  -fill '#ff9933' -draw 'circle 8,8 3,3' \
  -fill '#ffff00' -draw 'circle 7,7 1,1' \
  "$OUT_DIR/magma-cream.png"

# Brewing Stand
magick -size 16x16 xc:'#8b8b8b' \
  -fill '#6b6b6b' -draw 'rectangle 3,2 12,3 rectangle 4,3 5,13 rectangle 10,3 11,13' \
  -fill '#5b5b5b' -draw 'circle 8,8 3,3' \
  "$OUT_DIR/brewing-stand.png"

# Cauldron
magick -size 16x16 xc:'#4a4a4a' \
  -fill '#6a6a6a' -draw 'rectangle 2,2 13,3 rectangle 1,3 2,13 rectangle 13,3 14,13 rectangle 2,13 13,14' \
  -fill '#3a3a3a' -draw 'rectangle 3,3 12,13' \
  "$OUT_DIR/cauldron.png"

# Eye of Ender
magick -size 16x16 xc:none \
  -fill '#1a1a2e' -draw 'circle 8,8 6,6' \
  -fill '#4a4a8a' -draw 'circle 8,8 4,4' \
  -fill '#000000' -draw 'circle 8,8 2,2' \
  "$OUT_DIR/eye-of-ender.png"

# Ink Sack
magick -size 16x16 xc:none \
  -fill '#1a1a1a' -draw 'circle 8,9 5,5' \
  -fill '#3a3a3a' -draw 'circle 8,8 3,3' \
  -fill '#8b0000' -draw 'circle 7,5 2,2' \
  "$OUT_DIR/ink-sac.png"

# Rose
magick -size 16x16 xc:none \
  -fill '#ff0000' -draw 'circle 8,8 4,4' \
  -fill '#00ff00' -draw 'line 8,12 8,15' \
  -fill '#006400' -draw 'polygon 8,12 6,15 10,15' \
  "$OUT_DIR/rose.png"

# Sunflower
magick -size 16x16 xc:none \
  -fill '#ffd700' -draw 'circle 8,7 4,4' \
  -fill '#8b4513' -draw 'circle 8,7 2,2' \
  -fill '#00ff00' -draw 'line 8,11 8,15' \
  "$OUT_DIR/sunflower.png"

# Lilac
magick -size 16x16 xc:none \
  -fill '#9400d3' -draw 'circle 5,5 2,2 circle 10,5 2,2 circle 8,8 3,3 circle 5,11 2,2 circle 10,11 2,2' \
  -fill '#00ff00' -draw 'line 8,13 8,15' \
  "$OUT_DIR/lilac.png"

# Torchflower
magick -size 16x16 xc:none \
