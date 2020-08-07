## 用法

#### 代码中使用
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

#### 脚本使用
```
# 会按照顺序在当前目录下建1/2/3 a/b/c文件夹
mkdirp 1/2/3 a/b/c
```

## 源码学习

### 同步处理
 1. 格式化参数
 2. 转换路径
 3. 使用同步方法mkdirSync建立文件夹
 4. 没有错误抛出就结束
 5. 有错误抛出则判断错误类型如果不是`ENOENT`那么就使用statSync读取文件元属性，如果是类型是文件夹，那么不抛出错误，说明已经有这个文件夹了，直接结束，否则抛出错误
 1 如果错误类型为`ENOENT`，那么使用`path.dirname(p)`尝试建立上一级的文件夹，如果建立成功，那么接下来建立p路径的文件夹，也成功的话就结束。如果建立`path.dirname(p)`也抛出`ENOENT`错误，那么继续建上上级的文件夹，以此循环，从最上级的文件夹一级一级往下建，直到达成最终目的

### 异步处理
 1. 异步的逻辑基本和同步差不多，只是中间的fs方法改用异步的，只是异步的逻辑看上去比较绕，先把同步的逻辑里明白然后再去理解异步的就好理解多了，下面也在异步的代码中打入了[logger](#2)，查看[logger](#2)会更加的了解这个流程
 2. 值得一说的是cli里调用的是异步模块
 
### cli脚本
 1. 首先使用`minimist`进行格式化argv
 2. 如果是`help`命令的话使用创建一个读流`fs.createReadStream`使用管道`pipe`接入到写流`process.stdout`。
 3. 然后使用递归的模式来查看`paths`数组是否还有值，有的话调用之前的异步创建文件夹方法，没有则退出程序。
 ``

```javascript
// 同步处理逻辑
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

```javascript
// node_modules/.bin/mkdirp
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

```

```javascript
// mkdirp.js 异步处理
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
```

## 异步运行logger
   打入logger 观察文件夹建立的顺序
```
➜  blog git:(master) ✗ mkdirp 1/2/3
我要建立1/2/3文件夹
建立/Users/wangjingcheng/wbb/git/github/blog/1/2/3文件夹失败，需要先建立/Users/wangjingcheng/wbb/git/github/blog/1/2文件夹
我要建立/Users/wangjingcheng/wbb/git/github/blog/1/2文件夹
建立/Users/wangjingcheng/wbb/git/github/blog/1/2文件夹失败，需要先建立/Users/wangjingcheng/wbb/git/github/blog/1文件夹
我要建立/Users/wangjingcheng/wbb/git/github/blog/1文件夹
建立/Users/wangjingcheng/wbb/git/github/blog/1文件夹成功
建/Users/wangjingcheng/wbb/git/github/blog/1成功，接下来建立/Users/wangjingcheng/wbb/git/github/blog/1/2文件夹
我要建立/Users/wangjingcheng/wbb/git/github/blog/1/2文件夹
建立/Users/wangjingcheng/wbb/git/github/blog/1/2文件夹成功
建/Users/wangjingcheng/wbb/git/github/blog/1/2成功，接下来建立/Users/wangjingcheng/wbb/git/github/blog/1/2/3文件夹
我要建立/Users/wangjingcheng/wbb/git/github/blog/1/2/3文件夹
建立/Users/wangjingcheng/wbb/git/github/blog/1/2/3文件夹成功
```
// Update by 1596788110968

// Update by 1596788197760
