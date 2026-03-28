export const SURVIVAL_STARTER_RESOURCES = {
  dirt: 24,
  cobblestone: 10,
  oak_planks: 16,
  torch: 12,
  glass: 4,
}

export const BLOCK_DROP_TABLE = {
  grass: { dirt: 1 },
  dirt: { dirt: 1 },
  stone: { cobblestone: 1 },
  cobblestone: { cobblestone: 1 },
  sand: { sand: 1 },
  gravel: { gravel: 1, gunpowder: 0.18 },
  oak_log: { oak_log: 1 },
  oak_planks: { oak_planks: 1 },
  leaves: { oak_log: 0.18 },
  coal_ore: { coal_ore: 1, coal: 1 },
  iron_ore: { iron_ore: 1 },
  gold_ore: { gold_ore: 1 },
  diamond_ore: { diamond_ore: 1 },
  copper_ore: { copper_ore: 1 },
  copper_block: { copper_block: 1 },
  copper_wire: { copper_wire: 1 },
  copper_wire_on: { copper_wire: 1 },
  copper_power_source: { power_source: 1 },
  copper_power_source_on: { power_source: 1 },
  glowstone: { glowstone: 1, glow_dust: 2 },
  tnt: { tnt: 1, gunpowder: 2 },
  crafting_table: { crafting_table: 1 },
  furnace: { furnace: 1 },
  chest: { chest: 1 },
  glass: { glass: 1 },
  brick: { brick: 1 },
  obsidian: { obsidian: 1 },
  snow: { snow: 1 },
  sandstone: { sandstone: 1 },
  netherrack: { netherrack: 1 },
  wool: { wool: 1 },
  wool_red: { wool_red: 1 },
  wool_blue: { wool_blue: 1 },
  wool_green: { wool_green: 1 },
}

export const SURVIVAL_RECIPES = [
  {
    key: 'oak_planks_bundle',
    output: 'oak_planks',
    outputCount: 4,
    label: 'Plank Bundle',
    ingredients: [{ item: 'oak_log', count: 1 }],
    description: 'Cut one log into four planks.',
  },
  {
    key: 'torch_crate',
    output: 'torch',
    outputCount: 8,
    label: 'Torch Crate',
    ingredients: [{ item: 'oak_planks', count: 1 }, { item: 'coal', count: 1 }],
    description: 'Craft a bright pack of torches for cave runs.',
  },
  {
    key: 'flint_and_steel',
    output: 'flint_and_steel',
    outputCount: 1,
    label: 'Flint & Steel',
    ingredients: [{ item: 'iron_ore', count: 1 }, { item: 'gravel', count: 1 }],
    description: 'Ignites TNT and key redstone-style contraptions.',
  },
  {
    key: 'furnace',
    output: 'furnace',
    outputCount: 1,
    label: 'Field Furnace',
    ingredients: [{ item: 'cobblestone', count: 8 }],
    description: 'A rugged utility block for base camps.',
  },
  {
    key: 'crafting_table',
    output: 'crafting_table',
    outputCount: 1,
    label: 'Crafting Table',
    ingredients: [{ item: 'oak_planks', count: 4 }],
    description: 'Sets up a proper workbench for expeditions.',
  },
  {
    key: 'copper_wire',
    output: 'copper_wire',
    outputCount: 6,
    label: 'Copper Wire',
    ingredients: [{ item: 'copper_block', count: 1 }],
    description: 'Links nearby power devices together.',
  },
  {
    key: 'power_source',
    output: 'power_source',
    outputCount: 1,
    label: 'Power Source',
    ingredients: [{ item: 'copper_block', count: 1 }, { item: 'glowstone', count: 1 }],
    description: 'Drives powered wire circuits.',
  },
  {
    key: 'tnt',
    output: 'tnt',
    outputCount: 1,
    label: 'TNT',
    ingredients: [{ item: 'sand', count: 4 }, { item: 'gunpowder', count: 2 }],
    description: 'Clear rock or make very poor life choices.',
  },
  {
    key: 'glass_panel',
    output: 'glass',
    outputCount: 4,
    label: 'Glass Panel',
    ingredients: [{ item: 'sand', count: 2 }],
    description: 'Refined building panels for lookout towers.',
  },
]

export const QUESTS = [
  {
    id: 'campfire',
    title: 'Bootstrap Camp',
    description: 'Collect early materials and prep a starter base.',
    objectives: [
      { type: 'collect', item: 'oak_log', target: 3, label: 'Gather oak logs' },
      { type: 'collect', item: 'cobblestone', target: 12, label: 'Mine cobblestone' },
      { type: 'craft', item: 'crafting_table', target: 1, label: 'Craft a table' },
    ],
    rewards: { torch: 8, glass: 2 },
    xpReward: 14,
  },
  {
    id: 'prospector',
    title: 'Deep Prospector',
    description: 'Head underground and pull out useful ore.',
    objectives: [
      { type: 'collect', item: 'coal', target: 4, label: 'Collect coal' },
      { type: 'collect', item: 'iron_ore', target: 3, label: 'Mine iron ore' },
      { type: 'collect', item: 'copper_ore', target: 4, label: 'Mine copper ore' },
    ],
    rewards: { copper_block: 2, torch: 10 },
    xpReward: 20,
  },
  {
    id: 'grid',
    title: 'Power Grid',
    description: 'Build and connect a functional electrical line.',
    objectives: [
      { type: 'craft', item: 'power_source', target: 1, label: 'Craft a power source' },
      { type: 'place', item: 'power_source', target: 1, label: 'Place the power source' },
      { type: 'place', item: 'copper_wire', target: 6, label: 'Lay copper wire' },
    ],
    rewards: { copper_wire: 6, glowstone: 1 },
    xpReward: 24,
  },
  {
    id: 'explorer',
    title: 'Survey Run',
    description: 'Travel across the world and chart multiple biomes.',
    objectives: [
      { type: 'discover_biome_count', target: 3, label: 'Discover three biomes' },
      { type: 'visit_height', target: 34, label: 'Reach a high ridge' },
      { type: 'travel_distance', target: 260, label: 'Travel across the frontier' },
    ],
    rewards: { tnt: 1, glass: 6, torch: 6 },
    xpReward: 32,
  },
]

export const WORLD_HINTS = {
  plains: 'Wide build space and easy starter terrain.',
  forest: 'Reliable timber and denser ground cover.',
  lush: 'Richer greenery and softer cave approaches.',
  desert: 'Open sightlines, sand stores, and little cover.',
  badlands: 'Harsh plateaus with layered terracotta ridges.',
  tundra: 'Cold surfaces, pale ridges, and slower scouting.',
  mountains: 'Good for lookout towers and ore runs.',
  alpine: 'High snowcaps and the steepest terrain.',
}

export function formatItemLabel(item) {
  return String(item || '').replace(/_/g, ' ')
}

export function createStarterResources() {
  return { ...SURVIVAL_STARTER_RESOURCES }
}

export function getDropRewards(blockName) {
  const normalized = blockName === 'power_source' ? 'copper_power_source' : blockName
  const rawRewards = BLOCK_DROP_TABLE[normalized] || BLOCK_DROP_TABLE[blockName] || {}
  const rewards = {}
  Object.entries(rawRewards).forEach(([item, amount]) => {
    if (amount >= 1) {
      rewards[item] = (rewards[item] || 0) + amount
      return
    }
    const guaranteed = Math.floor(amount)
    const fractional = amount - guaranteed
    let total = guaranteed
    if (fractional > 0 && Math.random() < fractional) total += 1
    if (total > 0) rewards[item] = (rewards[item] || 0) + total
  })
  return rewards
}

export function addResources(base, rewards) {
  const next = { ...(base || {}) }
  Object.entries(rewards || {}).forEach(([item, amount]) => {
    next[item] = Math.max(0, Math.round((next[item] || 0) + amount))
    if (next[item] <= 0) delete next[item]
  })
  return next
}

export function removeResources(base, costs) {
  const next = { ...(base || {}) }
  Object.entries(costs || {}).forEach(([item, amount]) => {
    next[item] = Math.max(0, Math.round((next[item] || 0) - amount))
    if (next[item] <= 0) delete next[item]
  })
  return next
}

export function getRecipeCostMap(recipe) {
  const costs = {}
  ;(recipe?.ingredients || []).forEach(({ item, count }) => {
    costs[item] = (costs[item] || 0) + count
  })
  return costs
}

export function canCraftRecipe(recipe, resources) {
  const costs = getRecipeCostMap(recipe)
  return Object.entries(costs).every(([item, count]) => (resources?.[item] || 0) >= count)
}

export function getMissingIngredients(recipe, resources) {
  const costs = getRecipeCostMap(recipe)
  return Object.entries(costs)
    .filter(([item, count]) => (resources?.[item] || 0) < count)
    .map(([item, count]) => `${count - (resources?.[item] || 0)} ${formatItemLabel(item)}`)
}

export function getQuestProgressValue(objective, stats) {
  if (!objective) return 0
  if (objective.type === 'collect') return stats.collected?.[objective.item] || 0
  if (objective.type === 'craft') return stats.crafted?.[objective.item] || 0
  if (objective.type === 'place') return stats.placed?.[objective.item] || 0
  if (objective.type === 'discover_biome_count') return stats.discoveredBiomes?.size || 0
  if (objective.type === 'visit_height') return stats.maxHeight || 0
  if (objective.type === 'travel_distance') return Math.floor(stats.travelDistance || 0)
  return 0
}

export function getQuestCompletion(quest, stats) {
  const objectives = (quest?.objectives || []).map((objective) => {
    const value = getQuestProgressValue(objective, stats)
    const target = objective.target || 1
    return {
      ...objective,
      value,
      target,
      done: value >= target,
    }
  })
  return {
    objectives,
    done: objectives.length > 0 && objectives.every((objective) => objective.done),
  }
}

export function getTopResources(resources, limit = 12) {
  return Object.entries(resources || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
}
