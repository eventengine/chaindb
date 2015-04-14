
module.exports = function(app) {
  var alfred = app.get('alfred');
  app.post('/lookup/:pubkey', function(req, res) {
    var pubKey = req.params.pubkey;
    alfred.lookup(pubKey)
      .then(function(info) {
        res.json(info.identity);
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
