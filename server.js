const next = require('next');

const port = parseInt(process.env.PORT || process.env.npm_config_port || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  require('http')
    .createServer((req, res) => {
      handle(req, res);
    })
    .listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
});