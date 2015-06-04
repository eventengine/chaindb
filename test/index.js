var Q = require('q')
var test = require('tape')
var leveldown = require('leveldown')
var Blockchain = require('blockloader').Blockchain
// var Identity = require('midentity').Identity
var dickChainey = require('chained-obj')
// var Parser = dickChainey.Parser
var Builder = dickChainey.Builder
var Butler = require('../')
// var makeDB = require('../makedb')
var Identity = require('midentity').Identity
var wrap = require('./helpers/chainedObjWrapper')
var KeeperAPI = require('bitkeeper-client-js')
// var fakeKeeper = require('tradle-test-helpers').FakeKeeper
var FIRST_BLOCK = 446896
// var PrevHandler = require('./verifier/handlers/prev')
// var IdentityHandler = require('./verifier/handlers/identity')
// var defaultHandlers = require('../defaultHandlers')

function newAlfred () {
  return new Butler({
    api: new Blockchain({ networkName: 'testnet', dir: './test/blocks' }),
    batchSize: 1,
    fromBlock: FIRST_BLOCK,
    path: './test.db',
    networkName: 'testnet',
    leveldown: leveldown,
    keeper: new KeeperAPI('http://localhost:25667')
    // keeper: fakeKeeper.forMap({
    //   // TODO: add keys
    // })
  })
}

test('save identity, lookup', function (t) {
  var alfred = newAlfred()

  // var alInfo = {
  //   store: alfred
  // }

  // for (var type in defaultHandlers) {
  //   defaultHandlers[type].forEach(alfred.addHandler, alfred)
  // }

  alfred.run()
  alfred.on('identity', function (info) {
    console.log('loaded identity from blockchain')
    lookup(true)
  })

  alfred.on('identity:new', function (info) {})

  alfred.on('identity:update', function (info) {})

  alfred.createReadStream()
    .on('data', function () {
      console.log('loaded identity from local db')
    })

  lookup()

  function lookup (catchErr) {
    Q.all([
      // pubkeys of the same identity
      // dsa
      'AAAAAACA+JvwLLKG6yXYO+4JaVFe6RGGXBg2GxODKVbFClkwVJtsZNvFsZLZCtEGLjrFSqW2Lq1Dz3E4jSqu+d0bwVvsW/l6NNm6Kf0EpWpQli4gFQeYNuw32qMwqVjWSm0GNYtIQatC1+SP0AtMCP3rZYct1z64wxRMKz5NgZimtWK1g20AAAAUlZ0ALefhE8BF7e9HbmtFx8BLzVEAAACAiHAMNBmy7yNmC0zuKWrmGAv21O5srTRTS8B+xzratDkOyWGvtYUBg/NQQODLnzAx1sA4Csr7yKriMmp4+Q0xA5WDsZaF/o8NIjcUa59oJjQsxtiSBi3oa+FofH/o1h3IvhAF8jNKmeTAhkmV28DFywAYcXMwNdaL2J6AK/Xzn8UAAACACluUumYaf9JigiyFPtW/6zmwI7cW3qBIm0O+lhxKYCGsa+/9Wu4x0Hu9psD1JlG7JTh2x31bPIiZivZ+oDDyTb2i7GnjzbQvUm4W0r+55BNUx6jF+MwGPtEFkIJS10yl5EqTSBPRDg9oAUY4tWvWoAR1QHUhcq8GDqjtXcjLPFE=',
      // ec
      '023b5e329146126b12b4af089d6b47bd517cedb0f806ac6d266be4c0a7327bcc2a',
      // bitcoin
      '020931aea7c71da1158285c7bb4c2f1ce7a3f7293f84002bb1394417740cd1ef55',
      // testnet
      '03a2c59522ca841543dc6b2fe64c43337f3494ac3a8a5cc1c901be94d7e28c1f6c'
      ].map(function (key) {
        return alfred.byPubKey(key)
          .then(function (info) {
            var from = Identity.fromJSON(info.from)
            console.log(from.name())
          })
      }))
      .then(function () {
        return alfred.destroy()
      })
      .catch(function (err) {
        if (!catchErr) throw err
      })
      .done(function () {
        t.end()
      })
  }

})

test('process chained object', function (t) {
  t.plan(1)

  var alfred = newAlfred()
  var b = new Builder()
  b.data({
    _type: 'thang',
    a: 1
  })

  b.build(function (err, buf) {
    if (err) throw err

    wrap(buf, function (err, wrapped) {
      if (err) throw err

      alfred._processChainedObj(wrapped)
        .then(function (processed) {
          t.notOk(processed)
          return alfred.destroy()
        })
        .done()
    })
  })
})
