#!/usr/bin/env node

var Butler = require('./');
var alfred = new Butler({
  block: 330399,
  path: './test.db',
  networkName: 'testnet'
});

alfred.run();

alfred.on('identity', function(info) {
  console.log(info);
});

alfred.on('identity:new', function(info) {
  console.log(info);
});

alfred.on('identity:update', function(info) {
  console.log(info);
});

var identities = 0;
alfred.createReadStream()
  .progress(function(data) {
    identities++;
  })
  .done(function() {
    console.log('Storing ' + identities + ' identities');
  })
