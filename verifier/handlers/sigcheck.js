var Q = require('q')
var omit = require('object.omit')
var Builder = require('chained-obj').Builder
var Handler = require('./base')
var inherits = require('util').inherits
var mi = require('midentity')
var Identity = mi.Identity
// var toKey = mi.toKey

function SigCheck (options) {
  Handler.call(this, options)
}

inherits(SigCheck, Handler)

SigCheck.prototype.verify = function (chainedObj) {
  var data = chainedObj.parsed.data.value
  var sig = data._sig
  if (typeof sig === 'undefined') return true

  var identity = chainedObj.from
  if (!identity) return false

  var purpose = data._type === Identity.TYPE ? 'update' : 'sign'
  var keys = identity.keys({
    purpose: purpose
  })

  var unsigned = omit(data, '_sig')
  var rebuild = new Builder().data(unsigned)
  chainedObj.parsed.attachments.forEach(rebuild.attach, rebuild)
  return Q.ninvoke(rebuild, 'hash')
    .then(function (hash) {
      return keys.some(function (key) {
        return key.verify(unsigned, sig)
      })
    })
}

module.exports = SigCheck
