
var through2 = require('through2')
var Q = require('q')
var bitcoin = require('bitcoinjs-lib')
var mi = require('midentity')
var Identity = mi.Identity
var Verifier = require('./verifier')
var Parser = require('chained-obj').Parser
var makeDB = require('./makedb')
var typeforce = require('typeforce')
var debug = require('debug')('chaindb')
var extend = require('extend')
var inherits = require('util').inherits
var defaultHandlers = require('./defaultHandlers')
var normalizeJSON = require('./normalizeJSON')
var EventEmitter = require('events').EventEmitter
// var PromiseStream = require('./promisestream')
var BLOCK_KEY = 'lastblock'
// var SYNC_INTERVAL = 20000
// var STARTING_BLOCK = {
//   testnet: 447188
// }

// var noop = function () {}

function ChainDB (options) {
  typeforce({
    path: 'String',
    networkName: 'String',
    leveldown: 'Function'
    // chainloader: can set after init
  }, options)

  EventEmitter.call(this)

  var networkName = options.networkName
  this._options = extend(true, {
    // fromBlock: STARTING_BLOCK[networkName] || 0
  }, options)

  bindAll(this)

  this._walkerOpts = {
    batchSize: options.batchSize || 5,
    throttle: 2000,
    networkName: networkName,
    api: options.blockchain
  }

  this.identity = options.identity
  if (options.chainloader) this.setChainloader(options.chainloader)

  var db = makeDB(options.path, { db: options.leveldown })
  var sub = db.sub
  this._db = db.db
  this._byDHTKey = sub.sublevel('byDHTKey')
  // this._byDHTKey.ensureIndex('_type')
  this._byPubKey = sub.sublevel('bypubkey')
  this._byFingerprint = sub.sublevel('byfingerprint')
  this._byTxId = sub.sublevel('txs')
  // this._byType = {}

  var storeInfo = {
    store: this
  }

  this._verifier = new Verifier(storeInfo)
  for (var type in defaultHandlers) {
    defaultHandlers[type].forEach(this.addHandler.bind(this, type))
  }

  // this._load()
  // this._streams = []
  this.on('error', this.destroy)
}

inherits(ChainDB, EventEmitter)
module.exports = ChainDB

ChainDB.prototype.readTxStream = function (stream) {
  var self = this
  // this._streams.push(stream)

  stream.pipe(through2.obj(function (txInfo, enc, done) {
      this.push(txInfo.tx)
      done()
    }))
    .pipe(this.chainloader)
    .pipe(mkParser())
    .pipe(basicIdCheck())
    .pipe(this._verifier)
    .pipe(through2.obj(function (chainedObj, enc, done) {
      self._save(chainedObj)
      if (chainedObj.tx.height > self._block + 1) {
        console.log('block ' + (self._block + 1) + ' finished?')
        // self.push(self._block + 1)
        // self._setBlock(self._block + 1)
      }

      done()
    }))
    // .on('data', noop)
    // .on('end', function () {
    //   self._streams.splice(self._streams.indexOf(stream), 1)
    // })
}

ChainDB.prototype.setChainloader = function (chainloader) {
  this.chainloader = chainloader
  chainloader.lookupWith(this._lookup.bind(this))
  return this
}

ChainDB.prototype._lookup = function (fingerprint, cb) {
  var key = this.identity && this.identity.keys({ fingerprint: fingerprint })[0]
  if (key) {
    return cb(null, {
      key: key,
      identity: this.identity
    })
  }

  this.byFingerprint(fingerprint)
    .then(function (identity) {
      identity = Identity.fromJSON(identity)
      cb(null, {
        key: identity.keys({ fingerprint: fingerprint })[0],
        identity: identity
      })
    })
    .catch(cb)
    .done()
}

ChainDB.prototype.addHandler = function (type, Handler) {
  // TODO: type should be based on version hash, not just name
  if (typeof type === 'function') {
    Handler = type
    type = ''
  }

  this._verifier.add(type, new Handler({
    store: this
  }))
}

// ChainDB.prototype._load = function (cb) {
//   var self = this

//   cb = once(cb || noop)
//   this._db.get(BLOCK_KEY, function (err, val) {
//     var block
//     if (err) {
//       if (err.name === 'NotFoundError') {
//         block = self._options.fromBlock - 1
//       }
//       else self.emit('error', err)
//     }
//     else block = val

//     self._setBlock(block)
//     self._ready = true
//     self.emit('ready')
//     cb()
//   })
// }

ChainDB.prototype._setBlock = function (block) {
  if (block < this._block) {
    throw new Error("Can't go back a block")
  }

  this._block = block
  return this._db.put(BLOCK_KEY, block)
}

// ChainDB.prototype.scheduleSync = function () {
//   if (this._paused || this._destroyed) return

//   clearTimeout(this._syncTimeout)
//   this._syncTimeout = setTimeout(this.sync.bind(this),
//     this._options.syncInterval || SYNC_INTERVAL)
// }

// ChainDB.prototype.pause = function () {
//   this._paused = true
//   clearTimeout(this._syncTimeout)
// }

// ChainDB.prototype.run = function () {
//   // this._paused = false
//   if (!this.chainloader) throw new Error('you must set a chainloader (use setChainloader)')

//   if (this._ready) this.sync()
//   else this.once('ready', this.sync)
// }

// ChainDB.prototype.sync = function (cb) {
//   var self = this
//   var origCB = cb || noop

//   cb = once(dezalgo(function (err) {
//     self._syncing = false
//     origCB(err)
//     self.chainloader.removeListener('file', processOne)
//     self.scheduleSync()
//   }))

//   clearTimeout(this._syncTimeout)

//   if (this._syncing) return cb(new Error('sync in progress'))
//   if (this._paused) return cb(new Error("I'm paused, unpause me first"))

//   this._syncing = true
//   this.chainloader.on('file', processOne)

//   var err
//   // var blockNum
//   var loading = []
//   var loadPromise = Q.resolve()
//   var parsePromise = Q.resolve()

//   // Todo: RxJS stream manipulation seems made for this
//   var walker = this._walker = new TxWalker(this._walkerOpts)
//   walker.from(this._block + 1)
//     .on('OP_RETURN', function (tx, data) {
//       loading.push(tx)
//     })
//     // .on('blockstart', function (block, height) {
//     //   blockNum = height
//     // })
//     .on('blockend', function (block, height) {
//       if (!loading.length) {
//         loadPromise = loadPromise.then(function () {
//           self._setBlock(height)
//         })

//         return loadPromise
//       }

//       var batch = loading.slice()
//       loading.length = 0
//       loadPromise = loadPromise.then(function () {
//           return self.chainloader.load(batch)
//         })
//         .then(function () {
//           return parsePromise
//         })
//         .then(function () {
//           return self._setBlock(height)
//         })
//     })
//     .on('error', function (e) {
//       err = e
//       debug('Error reading from the blockchain', err)
//       walker.stop()
//     })
//     .on('stop', function () {
//       delete self._walker
//       if (err) cb(err)
//       else {
//         loadPromise
//           .then(function () {
//             cb()
//           })
//           .catch(cb)
//       }
//     })
//     .start()

//   function processOne (chainedObj) {
//     // the block currently being processed is the "next" block
//     chainedObj.block = self._block + 1
//     parsePromise = parsePromise.then(function () {
//       return self._processChainedObj(chainedObj)
//     })
//   }
// }

// /**
//  * process one chained obj
//  * @param  {Object} chainedObj see chainedobj.md for an example
//  * @return {[type]}            [description]
//  */
// ChainDB.prototype._processChainedObj = function (chainedObj) {
//   var self = this
//   var json
//   var isIdentity
//   var valid

//   return Q.ninvoke(Parser, 'parse', chainedObj.data)
//     .then(function (parsed) {
//       json = parsed.data.value
//       isIdentity = json._type === Identity.TYPE
//       chainedObj.parsed = parsed
//       var from = chainedObj.from
//       // only identities are allowed to be created without an identity
//       if (!from && !isIdentity) return false

//       chainedObj.from = from && from.identity
//       chainedObj.to = chainedObj.to && chainedObj.to.identity
//       return self._verifier.verify(chainedObj)
//     })
//     .then(function (_valid) {
//       valid = _valid
//       if (valid) {
//         return self._save(chainedObj)
//       }
//     })
//     .catch(function (err) {
//       if (err && /Save Error/.test(err.message)) throw err

//       // ignore chainedObj
//       return valid
//     })
// }

/**
 * save object to local db
 * @param  {Object} chainedObj metadata and data for object stored on chain (see chainedobj.md)
 * @param  {Identity} identity of obj creator
 * @return {Promise}
 */
ChainDB.prototype._save = function (chainedObj) {
  var self = this

  chainedObj = extend(true, {}, chainedObj)
  chainedObj.permission = chainedObj.permission && chainedObj.permission.body()
  chainedObj.tx.body = chainedObj.tx.body.toBuffer()
  chainedObj.from = chainedObj.from && chainedObj.from.toJSON()
  chainedObj.to = chainedObj.to && chainedObj.to.toJSON()

  var dhtKey = chainedObj.key
  var tasks = [
    self._byDHTKey.put(dhtKey, chainedObj),
    self._byTxId.put(chainedObj.tx.id, dhtKey)
  ]

  var data = chainedObj.parsed.data.value
  var type = data._type
  if (type === Identity.TYPE) {
    var from = Identity.fromJSON(data)
    var pubKeyBatch = []
    var fingerprintBatch = []
    from.keys().forEach(function (key) {
      pubKeyBatch.push({ type: 'put', key: key.pubKeyString(), value: dhtKey })
      fingerprintBatch.push({ type: 'put', key: key.fingerprint(), value: dhtKey })
    })

    tasks.push(
      self._byPubKey.batch(pubKeyBatch),
      self._byFingerprint.batch(fingerprintBatch)
    )
  }

  chainedObj._type = type
  // var typeDB = this._byType[type] = this._byType[type] || this._db.sublevel(type)

  return Q.all(tasks)
    .catch(function (err) {
      throw new Error('Save Error: ' + err.message)
    })
    .then(function () {
      self.emit('saved', chainedObj)
    })
}

/**
 * Lookup an identity by one of its public keys
 * @param  {String|Buffer|midentity Key}   pubKey
 * @return {Q.Promise} { identity: midentity.Identity, tx: bitcoin.Transaction }
 */
ChainDB.prototype.byPubKey = function (pubKey) {
  pubKey = pubKeyString(pubKey)
  return this._getVia(pubKey, this._byPubKey)
}

ChainDB.prototype._getVia = function (key, db) {
  var self = this
  return db.get(key)
    .then(function (hash) {
      return self.byDHTKey(hash)
    })
    .then(function (chainedObj) {
      return chainedObj.parsed.data.value
    })
}

ChainDB.prototype.byDHTKey = function (key) {
  return this._byDHTKey.get(key)
    .then(normalizeJSON)
}

ChainDB.prototype.byFingerprint = function (fingerprint) {
  return this._getVia(fingerprint, this._byFingerprint)
}

ChainDB.prototype.keyForFingerprint = function (fingerprint) {
  return this._byFingerprint.get(fingerprint)
}

ChainDB.prototype.block = function (height) {
  var data = []
  return this._byDHTKey.createReadStream()
    .progress(function (info) {
      if (info.block === height) {
        data.push(info)
      }
    })
    .then(function () {
      return data
    })
}

ChainDB.prototype.blocks = function () {
  var blocks = Object.create(null)
  return this._byDHTKey.createReadStream()
    .progress(function (info) {
      var block = blocks[info.block] = blocks[info.block] || []
      block.push.apply(block, hexTxs(info))
    })
    .then(function () {
      return toSortedArr(blocks)
    })
}

ChainDB.prototype.transactions = function (blockHeight) {
  var txs = {}
  var load
  if (typeof blockHeight !== 'undefined') {
    load = this.block(blockHeight)
      .then(function (data) {
        data.forEach(addTxs)
      })
  } else {
    load = this._byDHTKey.createReadStream()
      .progress(addTxs)
  }

  return load.then(function () {
    return txs
  })

  function addTxs (info) {
    var tx = toTx(info.tx)
    txs[tx.getId()] = tx.toHex()
  }
}

ChainDB.prototype.createReadStream = function () {
  return this._byDHTKey.createValueStream()
}

ChainDB.prototype.destroy = function () {
  return this._db.close()
}

function hexTxs (info) {
  return getTxBuf(info.tx).toString('hex')
  // return info.history.map(function (record) {
  //   return parseBuf(getTxBody(record.tx)).toString('hex')
  // })
}

function getTxBody (txInfo) {
  return txInfo.body
}

function getTxBuf (txInfo) {
  return parseBuf(getTxBody(txInfo))
}

function toTx (txFromDb) {
  var txBuf = parseBuf(getTxBody(txFromDb))
  return bitcoin.Transaction.fromBuffer(txBuf)
}

function parseBuf (bufFromDb) {
  return new Buffer(bufFromDb.data)
}

function toSortedArr (obj) {
  return Object.keys(obj)
    .sort(function (a, b) { return a - b })
    .map(function (key) {
      return obj[key]
    })
}

// function getHash(str) {
//   return crypto.createHash('sha256').update(str).digest('hex')
// }

function pubKeyString (pubKey) {
  if (typeof pubKey === 'string') return pubKey
  if (typeof pubKey.pubKeyString === 'function') return pubKey.pubKeyString()
  if (Buffer.isBuffer(pubKey)) return pubKey.toString('hex')

  throw new Error('unsupported pubkey format')
}

function bindAll (ctx) {
  for (var p in ctx) {
    var val = ctx[p]
    if (typeof val === 'function') {
      ctx[p] = ctx[p].bind(ctx)
    }
  }

  if (ctx.prototype) {
    bindAll(ctx.prototype)
  }
}

function mkParser () {
  return through2.obj(function (chainedObj, enc, done) {
    var ps = this
    Parser.parse(chainedObj.data, function (err, parsed) {
      if (err) {
        debug('invalid chained-obj', chainedObj.key)
        return done()
      }

      chainedObj.parsed = parsed
      ps.push(chainedObj)
      done()
    })

  })
}

function basicIdCheck () {
  return through2.obj(function (chainedObj, enc, done) {
    var parsed = chainedObj.parsed
    var json = parsed.data.value
    var isIdentity = json._type === Identity.TYPE
    var from = chainedObj.from
    // only identities are allowed to be created without an identity
    if (!from && !isIdentity) return done()

    chainedObj.from = from && from.identity
    chainedObj.to = chainedObj.to && chainedObj.to.identity
    this.push(chainedObj)
    done()
  })
}
