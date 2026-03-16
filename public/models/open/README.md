Open moderation models vendored for client-side use.

- nsfwjs MobileNetV2
  - Source package: `nsfwjs`
  - Files: `nsfwjs/model.min.js`, `nsfwjs/group1-shard1of1.min.js`
  - License: see package license in `node_modules/nsfwjs/LICENSE`

Text moderation currently uses `@tensorflow-models/toxicity` from the TFJS Models project:
- Repo: https://github.com/tensorflow/tfjs-models/tree/master/toxicity
- The model is loaded by the package at runtime and cached by the browser.
- For full self-hosting of toxicity model weights, configure a hosted model URL and switch `ensureToxicityModel` in `src/services/localSafetyService.js` to `tf.loadGraphModel(<your_local_url>)`.
