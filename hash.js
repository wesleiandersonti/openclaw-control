const bcrypt = require('bcrypt');

(async () => {
  const hash = await bcrypt.hash("SUA_SENHA_FORTE", 12);
  console.log(hash);
})();
