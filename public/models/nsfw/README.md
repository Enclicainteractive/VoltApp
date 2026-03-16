Open NSFW TF.js models (local-only)

Source repository:
- https://github.com/infinitered/nsfwjs

Installed variants:
- `mobilenet_v2` (default): `model.json` + `group1-shard1of1`
- `mobilenet_v2_mid`: `mobilenet_v2_mid/model.json` + 2 shards
- `inception_v3`: `inception_v3/model.json` + 6 shards

Runtime selection:
- Default is `mobilenet_v2`.
- To switch variant in browser devtools:
  - `localStorage.setItem('nsfw_model_variant', 'mobilenet_v2_mid')`
  - `localStorage.setItem('nsfw_model_variant', 'inception_v3')`
  - reload page

Class mapping used by app:
- NSFWJS output classes are `[Drawing, Hentai, Neutral, Porn, Sexy]`
- App NSFW score = `max(Hentai, Porn, Sexy)`

