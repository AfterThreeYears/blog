const username = require('username');

console.log(username.sync());

(async () => {
  console.log(await username());
})();