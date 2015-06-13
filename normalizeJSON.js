
module.exports = function normalize (json) {
  for (var p in json) {
    var val = json[p]
    if (val && typeof val === 'object') {
      if (val.type === 'Buffer' && val.data && Object.keys(val).length === 2) {
        json[p] = new Buffer(val.data)
      } else {
        json[p] = normalize(val)
      }
    }
  }

  return json
}
