const fs = require('fs');
const { resolve } = require('path');
const dayjs = require('dayjs');
const { promisifyAll } = require('bluebird');
const simpleGit = require('simple-git');
const _ = require('lodash');

promisifyAll(fs);
const git = simpleGit().init();

async function getModifiedMDFilePath() {
  const { modified, created, renamed } = await git.status();
  // console.log(modified, created, renamed);
  return [...new Set([...modified, ...created, ...renamed])]
    .filter(item => item.match(/docs\/(.)+\.md/))
    .map(item => item.replace(/docs\/|\"/g, ''));
}

async function getNotModifiedMDFilePath(MDFilePath) {
  const allMDFilePath = (await fs.readdirAsync('./docs')).filter(filename => /.+\.md$/.test(filename.toLowerCase()));
  return _.without(allMDFilePath, ...MDFilePath);
}

async function getOldUpdate() {
  try {
    const update = JSON.parse(await fs.readFileAsync(resolve(__dirname, 'update.json'), { encoding: 'utf-8' }));
    return update;
  } catch (error) {
    console.error(error);  
  }
  return {};
}

async function writeUpdate(newUpdate) {
  await fs.writeFileAsync(resolve(__dirname, 'update.json'), JSON.stringify(newUpdate, null ,2));
}

function sortMDFile(newUpdate) {
  return Object
    .entries(newUpdate)
    .sort((a, b) => b[1] - a[1])
    .reduce((result, [path, mtimeMs]) => ({
      ...result,
      [path]: mtimeMs,
    }), []);
}

async function writeREADMETemplate(MDFileSortedArray) {
  const formatTime = 'YYYY-MM-DD HH:mm:ss';
  const gitUrl = 'https://github.com/AfterThreeYears/blog/blob/master';
  let content = `# [博客地址](https://github.com/AfterThreeYears/blog)
  | 文章 | 修改时间 |
  |:---|:------------|
  `;
   content += Object.entries(MDFileSortedArray)
      .map(([path, mtimeMs]) => `|[${path}](${gitUrl}/${encodeURIComponent(path)})|${dayjs(mtimeMs).format(formatTime)}|`)
      .join('\n');

    await fs.writeFileAsync(resolve(__dirname, 'README.md'), content);
}

async function main() {
  try {
    // 1. 获取增加或者修改的md文件路径
    const MDFilePath = await getModifiedMDFilePath();
    // 2. 读取无修改的md文件的路径
    const notModifiedMDFilePath = await getNotModifiedMDFilePath(MDFilePath);
    // 3. 读取update.json 的内容到update老对象上
    const oldUpdate = await getOldUpdate();
    // 4. 首先把修改过的md文件的路径更新到update新对象上
    const newUpdate = {};
    MDFilePath.forEach(path => newUpdate[path] = Date.now());
    // 5. 接下来把所有的路径重新把路径和对应的时间从update老对象更新到update新对象上
    notModifiedMDFilePath.forEach(path => newUpdate[path] = _.isNil(oldUpdate[path]) ? Date.now() : oldUpdate[path]);
    // 6. 把update.json的新对象的内容写入update.json
    await writeUpdate(newUpdate);
    // 7. 把结果排序
    /**
     * [{ A: 2 }, { B: 1 }]
     */
    const MDFileSortedArray = sortMDFile(newUpdate);
    // 8. 写入MD模板中
    // console.log(MDFileSortedArray);
    await writeREADMETemplate(MDFileSortedArray);
  } catch (error) {
    console.error(error);
  }
}



main();
