const { resolve } = require('path');
const fs = require('fs');
const { promisifyAll } = require('bluebird');

promisifyAll(fs);
const blankList = ['README.md'];
const regexp = /.+\.md$/;
const gitUrl = 'https://github.com/AfterThreeYears/blog/blob/master';
let content = `# BLOG
https://github.com/AfterThreeYears/blog/issues
\n`;

(async () => {
  let filenames;
  try {
    filenames = await fs.readdirAsync('.');
  } catch (error) {
    console.error(`[读取错误]: ${error.message}`);
  }
  const mds = filenames.filter(filename => regexp.test(filename.toLowerCase()) && !blankList.includes(filename));

  content += mds.map(mdFile => {
    const mdUrl = `${gitUrl}/${encodeURIComponent(mdFile)}`;
    return `## [${mdFile}](${mdUrl})`;
  }).join('\n');
  try {
    await fs.writeFileAsync(resolve(__dirname, blankList[0]), content);
  } catch (error) {
    console.error(`[写入错误]: ${error.message}`);
  }
})();
