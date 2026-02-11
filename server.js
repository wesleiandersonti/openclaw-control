const express = require('express');

const app = express();
const PORT = process.env.PORT || 7000;

app.get('/', (req, res) => {
  res.send('OpenClaw Control - running');
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`OpenClaw Control rodando em http://127.0.0.1:${PORT}`);
});
