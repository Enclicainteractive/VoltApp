export const RETRO_RIFT_TEXTURE_PACKS = {
  'archive-stacks': {
    id: 'archive-stacks',
    name: 'Archive Stacks',
    summary: 'Cold concrete and server-room surface set for data-vault maps.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG CC0 Materials', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'basalt-industrial': {
    id: 'basalt-industrial',
    name: 'Basalt Industrial',
    summary: 'Volcanic brick, scorched floor, and foundry trim references.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'forge-cinder': {
    id: 'forge-cinder',
    name: 'Forge Cinder',
    summary: 'Warm metal, furnace brick, and oxidized plate surfaces.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'harbor-concrete': {
    id: 'harbor-concrete',
    name: 'Harbor Concrete',
    summary: 'Weathered dock concrete, painted steel, and cold storage trim.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'ice-array': {
    id: 'ice-array',
    name: 'Ice Array',
    summary: 'Frosted panels and frozen aggregate for bright arena reads.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'moss-catacomb': {
    id: 'moss-catacomb',
    name: 'Moss Catacomb',
    summary: 'Mossy stone, damp grout, and crypt floor references.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'neon-sewer': {
    id: 'neon-sewer',
    name: 'Neon Sewer',
    summary: 'Wet concrete, tiled drainage, and slick metal highlights.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'reactor-core': {
    id: 'reactor-core',
    name: 'Reactor Core',
    summary: 'Clean industrial paneling with bright sci-fi trim cues.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'rust-yard': {
    id: 'rust-yard',
    name: 'Rust Yard',
    summary: 'Oxidized steel and dusty concrete for heavy industrial maps.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  },
  'violet-stone': {
    id: 'violet-stone',
    name: 'Violet Stone',
    summary: 'Fantasy-leaning stone and reflective trim for surreal arenas.',
    sources: [
      { label: 'Poly Haven CC0 License', url: 'https://polyhaven.com/license', license: 'CC0' },
      { label: 'ambientCG PBR Library', url: 'https://ambientcg.com/', license: 'CC0' }
    ]
  }
}

export const getRetroRiftTexturePack = (texturePackId) => (
  RETRO_RIFT_TEXTURE_PACKS[texturePackId] || RETRO_RIFT_TEXTURE_PACKS['basalt-industrial']
)
