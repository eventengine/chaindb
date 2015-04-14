
var conf = require('./conf/server')
var express = require('express')
var app = express()
var Butler = require('./')
var alfred = new Butler({
  block: 330399,
  path: './test.db',
  networkName: 'testnet'
})

alfred.run()

app.set('alfred', alfred)

require('./routes')(app)

var server = app.listen(conf.port || 12345)
