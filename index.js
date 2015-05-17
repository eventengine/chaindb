
var Q = require('q');
var bitcoin = require('bitcoinjs-lib');
var mi = require('midentity');
var utils = require('tradle-utils');
var Identity = mi.Identity;
var AddressBook = mi.AddressBook;
var TxWalker = require('tx-walker');
var DataLoader = require('bitjoe-js/lib/dataLoader');
var Verifier = require('./verifier');
var Parser = require('chained-obj').Parser;
var Keeper = require('bitkeeper-js');
var keeperConf = require('./conf/keeper');
var makeDB = require('./makedb');
var typeforce = require('typeforce');
var crypto = require('crypto');
var debug = require('debug')('butler');
var once = require('once');
var dezalgo = require('dezalgo');
var extend = require('extend');
var inherits = require('util').inherits;
var defaultHandlers = require('./defaultHandlers');
var EventEmitter = require('events').EventEmitter;
// var PromiseStream = require('./promisestream');
var BLOCK_KEY = 'lastblock';
var PREFIX = 'tradle';
var SYNC_INTERVAL = 20000;
var STARTING_BLOCK = {
  testnet: 330399
};

var noop = function() {};

function Butler(options) {
  typeforce({
    path: 'String',
    networkName: 'String'
  }, options);

  this._options = extend(true, {
    fromBlock: STARTING_BLOCK[networkName] || 0
  }, options);

  bindAll(this);

  var networkName = options.networkName;
  this._walkerOpts = {
    batchSize: 5,
    throttle: 2000,
    networkName: networkName,
    api: options.api
  };

  this._keeper = new Keeper(keeperConf);
  this._dataLoader = new DataLoader({
    prefix: PREFIX,
    networkName: networkName,
    keeper: this._keeper
  })

  this._db = makeDB(options.path);
  this._byDHTKey = this._db.sublevel('byDHTKey');
  // this._byDHTKey.ensureIndex('_type');
  this._byPubKey = this._db.sublevel('bypubkey');
  this._byFingerprint = this._db.sublevel('byfingerprint');
  this._byTxId = this._db.sublevel('txs');
  // this._byType = {};

  var storeInfo = {
    store: this
  };

  this._verifier = new Verifier(storeInfo);
  for (var type in defaultHandlers) {
    defaultHandlers[type].forEach(this.addHandler.bind(this, type));
  }

  this._load();
  this.on('error', this.destroy);
}

inherits(Butler, EventEmitter);
module.exports = Butler;

Butler.prototype.addHandler = function(type, Handler) {
  // TODO: type should be based on version hash, not just name
  if (typeof type === 'function') {
    Handler = type;
    type = '';
  }

  this._verifier.add(type, new Handler({
    store: this
  }));
}

Butler.prototype._load = function(cb) {
  var self = this;

  cb = once(cb || noop);
  this._db.get(BLOCK_KEY, function(err, val) {
    var block;
    if (err) {
      if (err.name === 'NotFoundError') {
        block = self._options.fromBlock;
      }
      else self.emit('error', err);
    }
    else block = val;

    self._setBlock(block);
    self._ready = true;
    self.emit('ready');
    cb();
  });
}

Butler.prototype._setBlock = function(block) {
  if (block < this._block) {
    debugger;
    throw new Error('Can\'t go back a block');
  }

  this._block = block;
  return this._db.put(BLOCK_KEY, block);
}

Butler.prototype.scheduleSync = function() {
  if (this._paused || this._destroyed) return;

  clearTimeout(this._syncTimeout);
  this._syncTimeout = setTimeout(this.sync.bind(this), SYNC_INTERVAL);
}

Butler.prototype.pause = function() {
  this._paused = true;
  clearTimeout(this._syncTimeout);
}

Butler.prototype.run = function() {
  this._paused = false;
  if (this._ready) this.sync();
  else this.once('ready', this.sync);
}

Butler.prototype.sync = function(cb) {
  var self = this;
  var identities = [];
  var origCB = cb || noop;

  cb = once(dezalgo(function(err) {
    self._syncing = false;
    origCB(err);
    self._dataLoader.removeListener('file:public', processOne);
    self.scheduleSync();
  }));

  clearTimeout(this._syncTimeout);

  if (this._syncing) return cb(new Error('sync in progress'));
  if (this._paused) return cb(new Error('I\'m paused, unpause me first'));

  this._syncing = true;
  this._dataLoader.on('file:public', processOne);

  var err;
  var blockNum;
  var loading = [];
  var loadPromise = Q.resolve();
  var parsePromise = Q.resolve();

  // Todo: RxJS stream manipulation seems made for this
  var walker = this._walker = new TxWalker(this._walkerOpts)
    .from(this._block + 1)
    .on('OP_RETURN', function(tx, data) {
      loading.push(tx);
    })
    .on('blockstart', function(block, height) {
      blockNum = height;
    })
    .on('blockend', function(block, height) {
      if (!loading.length) return;

      var batch = loading.slice();
      loading.length = 0;
      loadPromise = loadPromise.then(function() {
          return self._dataLoader.load(batch)
        })
        .then(function() {
          return parsePromise;
        })
        .then(function() {
          return self._setBlock(height);
        })
    })
    .on('error', function(e) {
      err = e;
      debug('Error reading from the blockchain', err);
      walker.stop();
    })
    .on('stop', function() {
      delete self._walker
      if (err) cb(err)
      else {
        loadPromise
          .then(function() {
            cb()
          })
          .catch(cb)
      }
    })
    .start();

  function processOne(chainedObj) {
    chainedObj.block = self._block;
    parsePromise = parsePromise.then(function() {
      return self._processChainedObj(chainedObj);
    })
  }
}

/**
 * process one chained obj
 * @param  {Object} chainedObj see chainedobj.md for an example
 * @return {[type]}            [description]
 */
Butler.prototype._processChainedObj = function(chainedObj) {
  var self = this;
  var identity;
  var json;
  var valid

  return Q.ninvoke(Parser, 'parse', chainedObj.file)
    .then(function(parsed) {
      json = parsed.data.value;
      chainedObj.parsed = parsed;
      if (json._type !== Identity.TYPE) {
        var getFrom = chainedObj.tx.addresses.from.map(self.byFingerprint, self);
        return Q.race(getFrom);
      }
    })
    .then(function(from) {
      // only identities are allowed to be created without an identity
      if (!from && json._type !== Identity.TYPE) return false

      chainedObj.from = from;
      return self._verifier.verify(chainedObj);
    })
    .then(function(_valid) {
      valid = _valid
      if (valid) {
        return self._save(chainedObj);
      }
    })
    .catch(function(err) {
      if (err && /Save Error/.test(err.message)) throw err

      // ignore chainedObj
      return valid
    })
}

/**
 * save object to local db
 * @param  {Object} chainedObj metadata and data for object stored on chain (see chainedobj.md)
 * @param  {Identity} identity of obj creator
 * @return {Promise}
 */
Butler.prototype._save = function(chainedObj, identity) {
  var self = this;

  chainedObj = extend({}, chainedObj);
  chainedObj.tx.body = chainedObj.tx.body.toBuffer();

  var dhtKey = chainedObj.key;
  var pubKeyBatch = [];
  var fingerprintBatch = [];
  identity.keys().forEach(function(key) {
    pubKeyBatch.push({ type: 'put', key: key.pubKeyString(), value: dhtKey })
    fingerprintBatch.push({ type: 'put', key: key.fingerprint(), value: dhtKey })
  });

  var type = chainedObj.parsed.data.value._type;
  chainedObj._type = type;
  // var typeDB = this._byType[type] = this._byType[type] || this._db.sublevel(type);

  return Q.all([
      self._byDHTKey.put(dhtKey, chainedObj),
      self._byPubKey.batch(pubKeyBatch),
      self._byFingerprint.batch(fingerprintBatch),
      self._byTxId.put(chainedObj.tx.id, dhtKey)
    ])
    .catch(function(err) {
      throw new Error('Save Error: ' + err.message);
    })
    .then(function() {
      self.emit('saved', chainedObj);
    });
}

/**
 * Lookup an identity by one of its public keys
 * @param  {String|Buffer|midentity Key}   pubKey
 * @return {Q.Promise} { identity: midentity.Identity, tx: bitcoin.Transaction }
 */
Butler.prototype.byPubKey = function(pubKey) {
  var self = this;

  pubKey = pubKeyString(pubKey);
  return this._byPubKey.get(pubKey)
    .then(function(hash) {
      return self._byDHTKey.get(hash)
    })
    .then(function(info) {
      var latest = info.history.pop();
      latest.identity = Identity.fromJSON(latest.identity);
      return latest;
    })
}

Butler.prototype.byDHTKey = function(key) {
  return this._byDHTKey.get(key)
}

Butler.prototype.byFingerprint = function(key) {
  return this._byFingerprint.get(key)
}

Butler.prototype.block = function(height) {
  var data = [];
  return this._byDHTKey.createReadStream()
    .progress(function(info) {
      if (info.block === height) {
        data.push(info)
      }
    })
    .then(function() {
      return data;
    })
}

Butler.prototype.blocks = function() {
  var blocks = Object.create(null);
  return this._byDHTKey.createReadStream()
    .progress(function(info) {
      var block = blocks[info.block] = blocks[info.block] || [];
      block.push.apply(block, hexTxs(info))
    })
    .then(function() {
      return toSortedArr(blocks)
    })
}

Butler.prototype.transactions = function(height) {
  var txs = {};
  var load;
  if (typeof block !== 'undefined') {
    load = this.block(height)
      .then(function(data) {
        data.forEach(addTxs)
      })
  }
  else {
    load = this._byDHTKey.createReadStream()
      .progress(addTxs)
  }

  return load.then(function() {
    return txs;
  })

  function addTxs(info) {
    info.history.forEach(function(data) {
      var tx = toTx(data.tx)
      txs[tx.getId()] = tx.toHex();
    })
  }
}


Butler.prototype.createReadStream = function() {
  return this._byDHTKey.createValueStream();
}

Butler.prototype.destroy = function() {
  if (this._destroyed) return Q.resolve();

  var self = this;

  this._destroyed = true;
  var tasks = [
    this._db.close(),
    this._keeper.destroy()
  ];

  var walker = this._walker;
  if (walker) {
    var defer = Q.defer();
    walker.once('stop', done);
    walker.once('error', done);
    tasks.push(defer.promise);
    walker.stop();

    function done() {
      self.removeAllListeners()
      walker.removeAllListeners();
      defer.resolve();
    }
  }

  return Q.allSettled(tasks);
}

function hexTxs(info) {
  return info.history.map(function(record) {
    return parseBuf(getTxBody(record.tx)).toString('hex')
  })
}

function getTxBody(txInfo) {
  return txInfo.tx;
}

function toTx(txFromDb) {
  var txBuf = parseBuf(getTxBody(txFromDb));
  return bitcoin.Transaction.fromBuffer(txBuf);
}

function parseBuf(bufFromDb) {
  return new Buffer(bufFromDb.data);
}

function toSortedArr(obj) {
  return Object.keys(obj)
    .sort(function(a, b) { return a - b })
    .map(function(key) {
      return obj[key]
    })
}

// function getHash(str) {
//   return crypto.createHash('sha256').update(str).digest('hex');
// }

function pubKeyString(pubKey) {
  if (typeof pubKey === 'string') return pubKey;
  if (typeof pubKey.pubKeyString === 'function') return pubKey.pubKeyString();
  if (Buffer.isBuffer(pubKey)) return pubKey.toString('hex');

  throw new Error('unsupported pubkey format');
}

function bindAll(ctx) {
  for (var p in ctx) {
    var val = ctx[p];
    if (typeof val === 'function') {
      ctx[p] = ctx[p].bind(ctx);
    }
  }

  if (ctx.prototype) {
    bindAll(ctx.prototype);
  }
}
