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

async function getMtimeMs(filePath) {
  const mtimeMs = Date.now();
  fs.appendFileSync(filePath, `\n// Update by ${mtimeMs}\n`);
  // const content = await fs.readFileAsync(filePath, { encoding: 'utf-8' });
  return mtimeMs;
} 

(async () => {
  try {
    const filenames = await fs.readdirAsync('./docs');
    // console.log('filenames', filenames);
    const mds = filenames.filter(filename => regexp.test(filename.toLowerCase()));

    const mdStats = [];
    for (let i = 0; i < mds.length; i += 1) {
      const mdFile = mds[i];
      const mdFilePath = resolve(__dirname, 'docs', mdFile);
      const mtimeMs = await getMtimeMs(mdFilePath);
      mdStats.push({ mdFile, mtimeMs });
    }
    content += mdStats
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map(({ mdFile, mtimeMs }) => `|[${mdFile}](${gitUrl}/${encodeURIComponent(mdFile)})|${dayjs(mtimeMs).format(formatTime)}|`)
      .join('\n');

    await fs.writeFileAsync(resolve(__dirname, 'README.md'), content);
  } catch (error) {
    console.error(error);
  }
})();
