
module.exports = function(app) {
  var alfred = app.get('alfred');
  app.post('/lookup', function(req, res) {
    var pubKey = req.query.pubkey;
    alfred.byPubKey(pubKey)
      .then(function(info) {
        info.tx = {
          id: info.tx.getId(),
          body: info.tx.toHex()
        }

        res.status(200)
          .send(JSON.stringify(info, null, 2));
      })
      .catch(function(err) {
        if (err.name === 'NotFoundError') res.status(404).send();
        else {
          console.error(err);
          res.status(500).send('Something went spectacularly wrong');
        }
      })
      .done()
  })
}
