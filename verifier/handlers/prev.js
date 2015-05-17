
var Q = require('q')
var Handler = require('./base')
var inherits = require('util').inherits
var toKey = require('midentity').toKey

function Prev() {
  Handler.call(this);
}

inherits(Prev, Handler)

Prev.prototype.verify = function(obj) {
  var data = obj.parsed.data.value

  if (!('_prev' in data)) return true

  var store = this.store

  return store.byDHTKey(data._prev)
    .then(function(prev) {
      if (!prev) return false

      if ((obj.from && !prev.from) || (!obj.from && prev.from)) return false
      if (obj.from) {
        // check obj.from and prev.from are the same person
      }

      return true
    })
    //   var prevData = prev.parsed.data.value
    //   var pubKey = prev._pubkey
    //   if (!pubKey) return false

    //   if (pubKey === obj._pubkey) return true

    //   return Q.all([
    //     store.byPubKey(obj._pubkey),
    //     store.byPubKey(prev._pubkey)
    //   ])
    // })
    // .spread(function(ident, prevIdent) {
    //   // may not be as simple as this
    //   return ident === prevIdent
    // })
}

module.exports = Prev
