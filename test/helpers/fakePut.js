
var assert = require('assert')
var BitJoe = require('bitjoe-js')
var helpers = require('tradle-test-helpers')
var fakeKeeper = helpers.FakeKeeper
var fakeWallet = helpers.fakeWallet

module.exports = function fakePutOnChain (options) {
  assert(options && options.data, '"data" is required')
  var data = options.data
  // var chain = options.chain || new FakeChain({ networkName: 'testnet' })
  var keeper = options.keeper || fakeKeeper.empty()
  var recipients = options.recipients
  var isPublic = 'public' in options ? options.public : true
  var wallet = options.wallet || fakeWallet({
    priv: options.priv,
    unspents: [100000]
  })

  var joe = new BitJoe({
    networkName: 'testnet',
    minConf: 0,
    prefix: 'tradle',
    wallet: wallet,
    keeper: keeper
  })

  return joe.create()
    .data(data)
    .setPublic(isPublic)
    .shareWith(recipients || [])
    .execute()
    .then(function () {
      return {
        wallet: wallet,
        keeper: keeper
      }
    })
}
