var Handler = require('./base')
var inherits = require('util').inherits
var Identity = require('midentity').Identity

function IdentityHandler () {}

inherits(IdentityHandler, Handler)

IdentityHandler.prototype.verify = function (obj) {
  try {
    obj.from = Identity.fromJSON(obj.parsed.data.value)
    return true
  } catch (err) {
    console.warn('Failed to parse identity object', obj)
    // throw err
    return false
  }
}

module.exports = IdentityHandler
