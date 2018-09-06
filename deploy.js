const fs = require('fs');
const { resolve } = require('path');
const dayjs = require('dayjs');
const { promisifyAll } = require('bluebird');

promisifyAll(fs);

const blankList = ['README.md'];
const regexp = /.+\.md$/;
const formatTime = 'YYYY-MM-DD HH:mm:ss';
const gitUrl = 'https://github.com/AfterThreeYears/blog/blob/master';
let content = `# [博客地址](https://github.com/AfterThreeYears/blog/issues)
| 文章 | 修改时间 |
|:---|:------------|
`;

(async () => {
  let filenames;
  try {
    filenames = await fs.readdirAsync('.');
  } catch (error) {
    console.error(`[读取错误]: ${error.message}`);
  }
  const mds = filenames.filter(filename => regexp.test(filename.toLowerCase()) && !blankList.includes(filename));
  const mdStats = [];
  for (let index = 0; index < mds.length; index += 1) {
    const mdFile = mds[index];
    const stats = await fs.statAsync(resolve(__dirname, mdFile));
    mdStats.push({ mdFile, stats });
  }
  content += mdStats.map(({ mdFile, stats }) => {
    const { birthtime, mtime } = stats;
    const mtimeStr = dayjs(mtime).format(formatTime);
    const mdUrl = `${gitUrl}/${encodeURIComponent(mdFile)}`;
    return `|[${mdFile}](${mdUrl})|${mtimeStr}|`;
  }).join('\n');
  try {
    await fs.writeFileAsync(resolve(__dirname, blankList[0]), content);
  } catch (error) {
    console.error(`[写入错误]: ${error.message}`);
  }
})();
