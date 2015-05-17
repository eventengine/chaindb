
var Identity = require('midentity').Identity
var constants = require('./constants')

module.exports = Object.create(null)
module.exports[constants.OMNI_TYPE] = [
  require('./verifier/handlers/sigcheck'),
  require('./verifier/handlers/prev')
]

module.exports[Identity.TYPE] = [
  require('./verifier/handlers/identity')
]
