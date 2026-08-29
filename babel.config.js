// WatermelonDB 0.28 ships no babel plugin — decorators work natively via
// the standard decorator syntax (tsconfig experimentalDecorators).
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"]
  }
}
