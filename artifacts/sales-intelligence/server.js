import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 5000;

app.use(express.static(join(__dirname, 'dist/public')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist/public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✓ Serving on http://localhost:${port}`);
});
