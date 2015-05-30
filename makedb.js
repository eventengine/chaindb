var levelup = require('levelup')
var sublevel = require('level-sublevel')
var levelQuery = require('level-queryengine')
var jsonQueryEngine = require('jsonquery-engine')
var promisify = require('q-level')
var defaultOptions = { valueEncoding: 'json' }
var extend = require('extend')

module.exports = function (path, options) {
  if (!options.db) throw new Error('Missing required parameter: db')

  options = extend(true, {}, defaultOptions, options || {})
  var db = levelQuery(sublevel(levelup(path, options)))
  db.query.use(jsonQueryEngine())
  promisify(db)
  promisify(db, 'query', { type: 'readable' })
  return db
}
