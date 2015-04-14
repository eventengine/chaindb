var level = require('level-browserify');
var sublevel = require('level-sublevel');
var levelQuery = require('level-queryengine');
var jsonQueryEngine = require('jsonquery-engine');
var promisify = require('q-level');
var defaultOptions = { valueEncoding: 'json' };
var extend = require('extend');

module.exports = function(path, options) {
  options = extend(true, {}, defaultOptions, options || {});
  var db = levelQuery(sublevel(level(path, options)));
  db.query.use(jsonQueryEngine());
  promisify(db);
  promisify(db, 'query', { type: 'readable' });
  return db;
}
