
var extend = require('extend')

function Handler(options) {
  extend(this, options);
}

/**
 * Verify the validity of an on-chain object
 * @param  {Object} chainedObj (see chainedobj.md)
 * @return {Boolean|Promise}
 */
Handler.prototype.verify = function(chainedObj) {
  throw new Error('override this')
}

module.exports = Handler
