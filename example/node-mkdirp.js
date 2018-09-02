var mkdirp = require('mkdirp');
    
mkdirp('/tmp/foo1/bar1/baz1', function (err) {
    if (err) console.error(err)
    else console.log('建立成功!')
});

try {
  const made = mkdirp.sync('1/2/3');
  console.log('[建立成功]:', made);
} catch (error) {
  console.error(`[建立失败]: ${error.message}`);
};