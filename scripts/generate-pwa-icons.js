/**
 * PWA Icon Generator Script
 * 
 * Run: npx ts-node scripts/generate-pwa-icons.js
 * Or install sharp: npm install sharp && node scripts/generate-pwa-icons.js
 * 
 * This creates simple "F" icons for the PWA manifest.
 * For production, replace with properly designed icons.
 */

const fs = require('fs');
const path = require('path');

// Create placeholder SVG that can be converted to PNG
const createSVG = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#0A0A0A"/>
  <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, sans-serif" font-size="${size * 0.6}" font-weight="600" fill="#FAFAF7">F</text>
</svg>`;

// Write SVG files as placeholder
const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon-192.svg'), createSVG(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.svg'), createSVG(512));

console.log('Created placeholder SVG icons in public/icons/');
console.log('Convert to PNG using: npx svgexport icon-192.svg icon-192.png');
console.log('Or use an online SVG to PNG converter.');
