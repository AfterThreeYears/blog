const { resolve } = require('path');
const fs = require('fs');
const { promisifyAll } = require('bluebird');

promisifyAll(fs);
const blankList = ['README.md'];
const regexp = /.+\.md$/;
const gitUrl = 'https://github.com/AfterThreeYears/blog/blob/master';

(async () => {
  const filenames = await fs.readdirAsync('.');
  const mds = filenames.filter(filename => {
    return regexp.test(filename.toLowerCase()) && !blankList.includes(filename);
  });

  try {
    let content = `# BLOG
https://github.com/AfterThreeYears/blog/issues
\n`;
    content += mds.map(mdFile => {
      const mdUrl = `${gitUrl}/${encodeURIComponent(mdFile)}`;
      return `## [${mdFile}](${mdUrl})`;
    }).join('\n');
    fs.writeFileAsync(resolve(__dirname, blankList[0]), content);
  } catch (error) {
      
  }
})();