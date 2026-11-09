// Make the 1024px icon and splash sources that @capacitor/assets needs, from the app's SVG icon.
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('assets', { recursive: true });
const svg = await readFile('../web/icons/icon.svg');
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile('assets/icon-only.png');
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffe3f4' } }).png().toFile('assets/icon-background.png');
const logo = await sharp(svg, { density: 384 }).resize(720, 720).png().toBuffer();
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#ff2d95' } }).composite([{ input: logo, gravity: 'center' }]).png().toFile('assets/splash.png');
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#ff2d95' } }).composite([{ input: logo, gravity: 'center' }]).png().toFile('assets/splash-dark.png');
console.log('icons ready');
