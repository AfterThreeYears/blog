## 用法

代码中使用
```javascript
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
```

脚本使用
```shell
# 会按照顺序在当前目录下建1/2/3 a/b/c文件夹
mkdirp 1/2/3 a/b/c
```

## 源码学习

```javascript
#!/usr/bin/env node

var mkdirp = require('../');
var minimist = require('minimist');
var fs = require('fs');

// 格式化argv
var argv = minimist(process.argv.slice(2), {
    alias: { m: 'mode', h: 'help' },
    string: [ 'mode' ]
});

if (argv.help) {
    // 如果是help命令，直接传递一个流
    fs.createReadStream(__dirname + '/usage.txt').pipe(process.stdout);
    return;
}

// 浅复制路径数组
var paths = argv._.slice();
var mode = argv.mode ? parseInt(argv.mode, 8) : undefined;

(function next () {
    if (paths.length === 0) return;
    var p = paths.shift();
    // 可以建立多组目录, 例如 mkdirp 1/2/3 a/b/c
    // 会首先建立完1/2/3 然后再建a/b/c目录
    if (mode === undefined) mkdirp(p, cb)
    else mkdirp(p, mode, cb)
    
    function cb (err) {
        if (err) {
            console.error(err.message);
            process.exit(1);
        }
        else next();
    }
})();


var path = require('path');
var fs = require('fs');
var _0777 = parseInt('0777', 8);

module.exports = mkdirP.mkdirp = mkdirP.mkdirP = mkdirP;

function mkdirP (p, opts, f, made) {
    console.log(`我要建立${p}文件夹`)
    // 这里是对cli传入的参数做兼容处理
    if (typeof opts === 'function') {
        f = opts;
        opts = {};
    }
    // 格式化opts
    else if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }
    
    var mode = opts.mode;
    // 优先使用用户传入的fs
    var xfs = opts.fs || fs;
    // 设置默认文件权限
    if (mode === undefined) {
        mode = _0777 & (~process.umask());
    }
    if (!made) made = null;
    
    var cb = f || function () {};
    // 把用户传入的路径转换为绝对路径
    p = path.resolve(p);
    
    xfs.mkdir(p, mode, function (er) {
        if (!er) {
            console.log(`建立${p}文件夹成功`);
            made = made || p;
            // 建文件夹成功以后调用成功的cb
            return cb(null, made);
        }
        switch (er.code) {
            // 如果没有前置的文件夹，需要递归建上一级的文件夹
            case 'ENOENT':
                console.log(`建立${p}文件夹失败，需要先建立${path.dirname(p)}文件夹`);
                mkdirP(path.dirname(p), opts, function (er, made) {
                    if (er) {
                        cb(er, made);
                    } else {
                        // 如果建还是上一级的文件夹成功了，那么再建当前的路径的文件夹
                        console.log(`建${path.dirname(p)}成功，接下来建立${p}文件夹`);
                        mkdirP(p, opts, cb, made);
                    }
                });
                break;

            // In the case of any other error, just see if there's a dir
            // there already.  If so, then hooray!  If not, then something
            // is borked.
            default:
                xfs.stat(p, function (er2, stat) {
                    // if the stat fails, then that's super weird.
                    // let the original error be the failure reason.
                    // 如果发现这个路径已经是文件夹了，那么直接调用成功的cb(null, made)
                    // 否则调用失败的cb
                    if (er2 || !stat.isDirectory()) cb(er, made)
                    else cb(null, made);
                });
                break;
        }
    });
}

mkdirP.sync = function sync (p, opts, made) {
    // 格式化opts
    if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }
    
    var mode = opts.mode;
    var xfs = opts.fs || fs;
    
    if (mode === undefined) {
        mode = _0777 & (~process.umask());
    }
    if (!made) made = null;
    // 把用户传入的路径转换为绝对路径
    p = path.resolve(p);

    try {
        // 建立文件夹
        xfs.mkdirSync(p, mode);
        made = made || p;
    }
    catch (err0) {
        switch (err0.code) {
            case 'ENOENT' :
                // 建上一级的文件夹
                made = sync(path.dirname(p), opts, made);
                // 建上一级文件夹成功，那么再尝试建当前目录的文件夹
                sync(p, opts, made);
                break;

            // In the case of any other error, just see if there's a dir
            // there already.  If so, then hooray!  If not, then something
            // is borked.
            default:
                var stat;
                try {
                    stat = xfs.statSync(p);
                }
                catch (err1) {
                    throw err0;
                }
                if (!stat.isDirectory()) throw err0;
                break;
        }
    }

    return made;
};
```

