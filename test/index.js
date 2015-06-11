var fs = require('fs')
var path = require('path')
var Q = require('q')
var test = require('tape')
var extend = require('extend')
var memdown = require('memdown')
var dickChainey = require('chained-obj')
var Builder = dickChainey.Builder
var Butler = require('../')
var mi = require('midentity')
var Keys = mi.Keys
var Identity = mi.Identity
var DataLoader = require('chainloader')
var wrap = require('./helpers/chainedObjWrapper')
var fakeKeeper = require('tradle-test-helpers').FakeKeeper
var fakeWallet = require('tradle-test-helpers').fakeWallet
var fakePut = require('./helpers/fakePut')
var Fakechain = require('blockloader').Fakechain
var ted = fs.readFileSync(path.join(__dirname, '/fixtures/ted'))
// var tedPub = JSON.parse(ted)
var tedPriv = require('./fixtures/ted-priv')
// var FIRST_BLOCK = 446896
var FIRST_BLOCK = 447188
var tedBlockHexPath = path.join(__dirname, '/fixtures/blocks/' + FIRST_BLOCK)
var tedBlock = fs.readFileSync(tedBlockHexPath)
var dbCount = 0
var PREFIX = 'tradle'

// IDENTITIES
var tedIdent = Identity.fromJSON(tedPriv)
var billIdent = new Identity()
  .name('Bill')
  .addKey(new Keys.Bitcoin({
    networkName: 'testnet',
    purpose: 'payment',
    priv: 'Kx6qnk7QFVNLJP8fgwgUtDW7RhgtpiQz8DdVAww1pQhnPk2FAQjb'
  }))

var tedWallet = fakeWallet({
  priv: tedIdent.keys({ networkName: 'testnet' })[0].priv(),
  unspents: [100000]
})

var billWallet = fakeWallet({
  blockchain: tedWallet.blockchain,
  priv: billIdent.keys({ networkName: 'testnet' })[0].priv(),
  unspents: [100000]
})

// END IDENTITIES

var DEFAULTS = {
  batchSize: 1,
  fromBlock: FIRST_BLOCK,
  networkName: 'testnet',
  leveldown: memdown
  // keeper: new KeeperAPI('http://localhost:25667')
}

function newAlfred (options) {
  var opts = extend({}, DEFAULTS, options)
  if (!opts.chain) {
    opts.chain = new Fakechain({ networkName: 'testnet' })
  }

  if (!opts.keeper) {
    opts.keeper = fakeKeeper.empty()
  }

  if (!opts.path) {
    opts.path = './test' + (dbCount++) + '.db'
  }

  var butler = new Butler(opts)
    .setChainloader(new DataLoader({
      prefix: PREFIX,
      networkName: opts.networkName,
      keeper: opts.keeper
    }))

  return butler
}

// test('prime chain', function () {

// })

test('"put" identity on chain, then "put" identity-signed object', function (t) {
  // t.timeoutAfter(10000)
  var keeper = fakeKeeper.empty()
  var alfred = newAlfred({
    fromBlock: 0,
    chain: tedWallet.blockchain,
    keeper: keeper,
    // identity: tedIdent,
    syncInterval: 1000
  })

  alfred.identity = tedIdent

  fakePut({
      keeper: keeper,
      wallet: tedWallet,
      data: ted
    })
    .done()

  fakePut({
      keeper: keeper,
      wallet: billWallet,
      data: billIdent.exportSigned()
    })
    .done()

  var savedCount = 0
  alfred.run()
  alfred.on('saved', function (obj) {
    savedCount++
    if (savedCount === 1) {
      t.equal(obj.key, 'e46143b3468534dce7b7b2ac8398fcc573f7376c')
      return
    }

    if (savedCount === 3) {
      return alfred.destroy()
        .done(function () {
          t.end()
        })
    }

    new Builder()
      .data({
        hey: 'there'
      })
      .signWith(tedIdent.keys({ type: 'dsa', purpose: 'sign' })[0])
      .build(function (err, buf) {
        if (err) throw err

        fakePut({
            wallet: tedWallet,
            chain: tedWallet.blockchain,
            keeper: keeper,
            data: buf,
            recipients: billIdent.keys({ networkName: 'testnet' }).map(function (k) {
              return k.pubKeyString()
            })
          })
          .done()
      })
  })

})

test('detect/process identity on chain', function (t) {
  var alfred = newAlfred({
    keeper: fakeKeeper.forMap({
      'e46143b3468534dce7b7b2ac8398fcc573f7376c': ted
    }),
    chain: new Fakechain({ networkName: 'testnet' }).addBlock(tedBlock, FIRST_BLOCK)
  })
  alfred.identity = tedIdent
  alfred.run()
  alfred.on('saved', lookup)

  function lookup () {
    Q.all([
      // pubkeys of the same identity
      // dsa
      'AAAAAACA1lOZZ0p9qVhGusS0cIOiGxMhblFXK6q4U+w86Au/YDpe4eTKKbOh1/XSo4026/2mqaXl9eGKAP3jJDaKvo1OTeKwVQpqKfoxdrgICMv3a9fIz9BD6hMxbPODypnJ23YBq0u9D9pp7WatBk9wZ4jzUJOycTbgpgBwpyv3FVF8NLsAAAAUzcX9wDrnUxNEvrpC4cbSDnOYBSkAAACAGwMSbCuqpkgFNLWleI2lDnFydWFcuDl0xJifyI7dz6BACsswbOycdq6uEzIaR7On33kNGeX6VMKIxhuFNwShOIVL8UjuZkCEBvjdWVOhtgqO2TcJSSL/YA8O+1ROAJAB38A5pY2WT/NXW3X6G69ZkrPSFDbWRI7PX0egLbTq5UIAAACAc4EIsLAfzZ6nve0FSqfI/OSNZR/mYooUND60p8ZgHoc5eIG384BRrw7uXKED/ya3AKXuhQfkQNWQUvwqSIO+MOnRSWZzWz37y8YzuKxbizMNf2NsdT/WH52mBAan59BwkvKaSPuXEe/4kfBe1vO2iXStS5JzMZ+H/BkCYBPnM+s=',
      // ec
      '027d0beefc6a70bfeab2535ce002c60b74184a2c2e7b6cb61c4fd468da68bbba55',
      // bitcoin
      '02e7a22fee063f61b7abbe35ece5f84ecf26707489f0079ec00f654ed4dc4f654e',
      // testnet
      '02464bb42a7f8c3b11b591ec4efe65ecfde2878e746429e96783c00ce3c3cc489c'
      ].map(function (key) {
        return alfred.byPubKey(key)
          .then(function (iJSON) {
            var identity = Identity.fromJSON(iJSON)
            t.equal(identity.name(), 'Ted Theodore Logan')
          })
      }))
      .then(function () {
        return alfred.destroy()
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
