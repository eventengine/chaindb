
var extend = require('extend')
var typeforce = require('typeforce')
var Q = require('q')
var constants = require('../constants').OMNI_TYPE

function Verifier (options) {
  this._options = extend({}, options)
  this._handlers = {}
}

Verifier.prototype.verify = function (obj) {
  var self = this

  // not sure which order makes more sense
  var type = obj.parsed.data.value._type
  return this._verify(obj, type)
    .then(function (verified) {
      if (!verified || !type || type === constants.OMNI_TYPE) {
        return verified
      }

      return self._verify(obj, constants.OMNI_TYPE)
    })
}

Verifier.prototype._verify = function (obj, type) {
  type = type || ''

  var handlers = this._handlers[type]
  if (!handlers) return Q.resolve(false)

  return handlers.reduce(function (memo, plugin) {
    return Q(memo).then(function () {
      return plugin.verify(obj)
    })
  }, Q(true))
}

// mix in array methods
;['push', 'pop', 'shift', 'unshift', 'splice', 'indexOf'].forEach(function (method) {
  Verifier.prototype[method] = function (type) {
    typeforce('String', type)

    var handlers = this._handlers[type] = this._handlers[type] || []
    return handlers[method].apply(handlers, [].slice.call(arguments, 1))
  }
})

Verifier.prototype.add = Verifier.prototype.push

module.exports = Verifier
