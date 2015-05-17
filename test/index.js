
var Q = require('q');
var test = require('tape');
var once = require('once');
var Blockchain = require('blockloader').Blockchain;
var Identity = require('midentity').Identity
var dickChainey = require('chained-obj')
var Parser = dickChainey.Parser
var Builder = dickChainey.Builder
var Butler = require('../');
var makeDB = require('../makedb');
var wrap = require('./helpers/chainedObjWrapper')
// var PrevHandler = require('./verifier/handlers/prev')
// var IdentityHandler = require('./verifier/handlers/identity')
// var defaultHandlers = require('../defaultHandlers')

test('save identity, lookup', function(t) {
  var alfred = new Butler({
    api: new Blockchain({ networkName: 'testnet', dir: './test/blocks' }),
    fromBlock: 330403,
    path: './test.db',
    networkName: 'testnet'
  });

  var alInfo = {
    store: alfred
  }

  // for (var type in defaultHandlers) {
  //   defaultHandlers[type].forEach(alfred.addHandler, alfred)
  // }

  alfred.run();
  alfred.on('identity', function(info) {
    console.log('loaded identity from blockchain')
    lookup()
  });

  alfred.on('identity:new', function(info) {

  });

  alfred.on('identity:update', function(info) {

  });

  alfred.createReadStream()
    .on('data', function() {
      console.log('loaded identity from local db')
      lookup()
    });

  var lookup = once(function lookup() {
    Q.all([
      // pubkeys of the same identity
      '0366e54d422f24d1f619632042c33829a83003aef882842c8b450c80d41ab154e1',
      '02367e6f9a96f1d79da28c1c2683a2b27a2524ac0cfaa6df67c10feb40a3575f6c',
      '038bf6fa3210e2395abaa6530a8f1d981c74fa4ed4d4223ded5fd502c02baa8938'
    ].map(function(key) {
      return alfred.byPubKey(key)
        .then(function(info) {
          console.log(info.identity.name())
        })
    }))
    .then(function() {
      return alfred.destroy()
    })
    .done(function() {
      t.end();
    })
  })
});

test('process chained object', function(t) {
  t.plan(1)
  var alfred = new Butler({
    api: new Blockchain({ networkName: 'testnet', dir: './test/blocks' }),
    fromBlock: 330403,
    path: './test.db',
    networkName: 'testnet'
  });

  var b = new Builder()
  b.data({
    _type: 'thang',
    a: 1
  })

  b.build(function(err, buf) {
    if (err) throw err

    wrap(buf, function(err, wrapped) {
      alfred._processChainedObj(wrapped)
        .then(function(processed) {
          t.notOk(processed)
          alfred.destroy()
        })
        .done()
    })
  })
})
