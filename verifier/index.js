
var util = require('util')
var extend = require('extend')
// var typeforce = require('typeforce')
var Q = require('q')
var constants = require('../constants').OMNI_TYPE
var Transform = require('stream').Transform
var debug = require('debug')('verifier')

util.inherits(Verifier, Transform)

function Verifier (options) {
  Transform.call(this, {
    objectMode: true
  })

  this._options = extend({}, options)
  this._handlers = {}
}

Verifier.prototype._transform = function (chainedObj, enc, done) {
  var self = this
  this.verify(chainedObj)
    .then(function () {
      self.push(chainedObj)
      done()
    })
    .catch(function (err) {
      debug('failed to verify', chainedObj.key, err)
      done()
    })
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

// mix in array methods (don't, they conflict with stream methods)
// ;['push', 'pop', 'shift', 'unshift', 'splice', 'indexOf'].forEach(function (method) {
//   Verifier.prototype[method] = function (type) {
//     typeforce('String', type)

//     var handlers = this._handlers[type] = this._handlers[type] || []
//     return handlers[method].apply(handlers, [].slice.call(arguments, 1))
//   }
// })

Verifier.prototype.add = function (type, handlers) {
  if (!Array.isArray(handlers)) handlers = [handlers]
  var tHandlers = this._handlers[type] = this._handlers[type] || []
  tHandlers.push.apply(tHandlers, handlers)
}

module.exports = Verifier
