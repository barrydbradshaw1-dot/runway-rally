// Turns web/icons/icon.svg into the 1024x1024 PNGs that the app icons and splash screens are made from.
// Uses sharp, which comes with @capacitor/assets (npm install first).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const svg = join(here, '..', '..', 'web', 'icons', 'icon.svg');
const assets = join(here, '..', 'assets');
mkdirSync(assets, { recursive: true });

// App Store icons may not have transparency, so the rounded corners are filled with the brand purple
// (the phone rounds the corners itself).
await sharp(svg, { density: 300 }).resize(1024, 1024).flatten({ background: '#6a4cff' }).png().toFile(join(assets, 'icon-only.png'));
// Android adaptive icon: the star on its own, and a plain background layer.
await sharp(svg, { density: 300 }).resize(1024, 1024).png().toFile(join(assets, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#6a4cff' } }).png().toFile(join(assets, 'icon-background.png'));
// Splash: the icon centred on the game's background colour.
const logo = await sharp(svg, { density: 300 }).resize(600, 600).png().toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#fff4fb' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(assets, name));
}
console.log('assets/ is ready');
