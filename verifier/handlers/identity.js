
var Handler = require('./base')
var inherits = require('util').inherits
var Identity = require('midentity').Identity

function IdentityHandler() {}

inherits(IdentityHandler, Handler)

IdentityHandler.prototype.verify = function(obj) {
  var identity;
  try {
    identity = Identity.fromJSON(obj.parsed.data.value)
  } catch (err) {
    console.warn('Failed to parse identity object', obj)
    // throw err;
    return false
  }

  var prev = obj.from;
  // TODO: make sure they had the right to change this
}

module.exports = IdentityHandler
