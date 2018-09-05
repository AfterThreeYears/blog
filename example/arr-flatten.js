const flatten = require('arr-flatten');
const assert = require('assert');

assert.equal(JSON.stringify(flatten(['a', ['b', 'c']])), JSON.stringify(['a', 'b', 'c']));

console.log('success');

