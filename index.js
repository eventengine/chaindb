
var Q = require('q');
var istream = require('./istream');
var bitcoin = require('bitcoinjs-lib');
var mi = require('midentity');
var Identity = mi.Identity;
var AddressBook = mi.AddressBook;
var TxWalker = require('tx-walker');
var DataLoader = require('bitjoe-js/lib/dataLoader');
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
var EventEmitter = require('events').EventEmitter;
// var PromiseStream = require('./promisestream');
// var INDICES = ['pubkeys'];
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
    block: STARTING_BLOCK[networkName] || 0
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
  this._byHash = this._db.sublevel('byhash');
  this._byPubKey = this._db.sublevel('bypubkey');

  // INDICES.forEach(function(i) {
  //   this._db.ensureIndex(i);
  // }, this);

  this._load();
  this.on('error', this.destroy);
}

inherits(Butler, EventEmitter);
module.exports = Butler;

Butler.prototype._load = function(cb) {
  var self = this;

  cb = once(cb || noop);
  this._db.get(BLOCK_KEY, function(err, val) {
    var block;
    if (err) {
      if (err.name === 'NotFoundError') {
        block = self._options.block;
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
    parsePromise = parsePromise.then(function() {
      return self._processChainedObj(chainedObj);
    })
  }
}

Butler.prototype._processChainedObj = function(chainedObj) {
  var self = this;
  var identity;

  return Q.ninvoke(Parser, 'parse', chainedObj.file)
    .then(function(parsed) {
      var json = JSON.parse(parsed.data.value);
      if (json._type !== Identity.TYPE) return;

      try {
        identity = Identity.fromJSON(json);
      } catch (err) {
        console.warn('Failed to parse identity object', json);
        return;
      }

      return self._validate(identity);
    })
    .then(function(valid) {
      if (valid) {
        chainedObj.identity = identity;
        return self._saveIdentity(chainedObj);
      }
    })
}

Butler.prototype._validate = function(identity) {
  return Q.resolve(true);
}

Butler.prototype._saveIdentity = function(info) {
  var self = this;
  var identity = info.identity;

  info = extend({}, info);
  delete info.identity;

  info.tx = info.tx.body.toBuffer();
  var hash = getHash(identity.toString());
  var latest = {
    identity: identity.toJSON(),
    tx: info.tx
  }

  return this._byHash.get(hash)
    .catch(function(err) {
      if (err.name !== 'NotFoundError') throw err;

      info.history = [];
      return info;
    })
    .then(function(info) {
      info.history.push(latest);
    })
    .then(function() {
      var batch = identity.keys().map(function(key) {
        return { type: 'put', key: key.pubKeyString(), value: hash }
      });

      return Q.all([
        self._byHash.put(hash, info),
        self._byPubKey.batch(batch)
      ])
    })
    .catch(function(err) {
      debugger;
      throw err;
    })
    .then(function() {
      self.emit('identity', info);
    });
}

/**
 * Lookup an identity by one of its public keys
 * @param  {String|Buffer|midentity Key}   pubKey
 * @return {Q.Promise} { identity: midentity.Identity, tx: bitcoin.Transaction }
 */
Butler.prototype.lookup = function(pubKey) {
  var self = this;

  pubKey = pubKeyString(pubKey);
  return this._byPubKey.get(pubKey)
    .then(function(hash) {
      return self._byHash.get(hash)
    })
    .then(function(info) {
      var latest = info.history.pop();
      latest.identity = Identity.fromJSON(latest.identity);
      latest.tx = bitcoin.Transaction.fromBuffer(new Buffer(latest.tx.data));
      return latest;
    })
}

Butler.prototype.createReadStream = function() {
  return this._byHash.createValueStream();
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

function getHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

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
