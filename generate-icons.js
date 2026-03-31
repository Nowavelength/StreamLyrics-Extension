const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outputDir = path.join(__dirname, 'public', 'icons');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
    for (const size of sizes) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#1DB954"/>
      <path d="M${size * 0.5} ${size * 0.1875}v${size * 0.414}c-${size * 0.0234}-${size * 0.0133}-${size * 0.05}-${size * 0.0219}-${size * 0.078}-${size * 0.0219}-${size * 0.086} 0-${size * 0.156} ${size * 0.07}-${size * 0.156} ${size * 0.156}s${size * 0.07} ${size * 0.156} ${size * 0.156} ${size * 0.156} ${size * 0.156}-${size * 0.07} ${size * 0.156}-${size * 0.156}V${size * 0.344}h${size * 0.156}V${size * 0.1875}H${size * 0.5}z" fill="white"/>
    </svg>`;

        await sharp(Buffer.from(svg))
            .resize(size, size)
            .png()
            .toFile(path.join(outputDir, `icon${size}.png`));

        console.log(`Created icon${size}.png`);
    }
}

generateIcons().then(() => console.log('Done!')).catch(console.error);
