
var path = require('path');
var fs = require('fs');

module.exports = function(app){
  fs.readdirSync(__dirname).forEach(function(file) {
    if (file === 'index.js' || file.length < 3 || file.slice(file.length - 3) !== '.js') return;

    var name = file.substr(0, file.indexOf('.'));
    require('./' + name)(app);
  })
}
