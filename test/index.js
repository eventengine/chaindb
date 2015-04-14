
var Q = require('q');
var test = require('tape');
var Butler = require('../');
var makeDB = require('../makedb');
var Blockchain = require('blockloader').Blockchain;
var once = require('once');

test('save identity, lookup', function(t) {
  var alfred = new Butler({
    api: new Blockchain({ networkName: 'testnet', dir: './test/blocks' }),
    block: 330403,
    path: './test.db',
    networkName: 'testnet'
  });

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
      '0366e54d422f24d1f619632042c33829a83003aef882842c8b450c80d41ab154e1',
      '02367e6f9a96f1d79da28c1c2683a2b27a2524ac0cfaa6df67c10feb40a3575f6c',
      '038bf6fa3210e2395abaa6530a8f1d981c74fa4ed4d4223ded5fd502c02baa8938'
    ].map(function(key) {
      return alfred.lookup(key)
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
