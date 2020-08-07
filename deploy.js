const fs = require('fs');
const { resolve } = require('path');
const dayjs = require('dayjs');
const { promisifyAll } = require('bluebird');

promisifyAll(fs);

const regexp = /.+\.md$/;
const formatTime = 'YYYY-MM-DD HH:mm:ss';
const gitUrl = 'https://github.com/AfterThreeYears/blog/blob/master';
let content = `# [博客地址](https://github.com/AfterThreeYears/blog)
| 文章 | 修改时间 |
|:---|:------------|
`;

(async () => {
  try {
    const filenames = await fs.readdirAsync('./docs');
    // console.log('filenames', filenames);
    const mds = filenames.filter(filename => regexp.test(filename.toLowerCase()));

    const mdStats = [];
    for (let i = 0; i < mds.length; i += 1) {
      const mdFile = mds[i];
      const stats = await fs.statAsync(resolve(__dirname, 'docs', mdFile));
      mdStats.push({ mdFile, stats });
    }
    content += mdStats
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)
      .map(({ mdFile, stats }) => {
        const mtimeStr = dayjs(stats.mtime).format(formatTime);
        const mdUrl = `${gitUrl}/${encodeURIComponent(mdFile)}`;
        return `|[${mdFile}](${mdUrl})|${mtimeStr}|`;
      }).join('\n');

    await fs.writeFileAsync(resolve(__dirname, 'README.md'), content);
  } catch (error) {
    console.error(error);
  }
})();
