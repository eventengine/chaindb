
var Q = require('q')
var utils = require('tradle-utils')
var bitcoin = require('bitcoinjs-lib')
var Parser = require('chained-obj').Parser

// see chainedobj.md
module.exports = function wrap(buf, cb) {
  var wrapper = {}
  utils.getInfoHash(buf, function(err, infoHash) {
    if (err) return cb(err)

    wrapper.key = infoHash
    wrapper.from = null
    wrapper.to = null
    wrapper.file = buf
    wrapper.permission = null
    wrapper.tx = {
      id: '...',
      body: new bitcoin.Transaction(),
      addresses: {
        from: ['abc'],
        to: ['123']
      }
    }

    cb(null, wrapper)
  })
}