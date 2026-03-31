// Simple icon generator
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'public', 'icons');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Create simple 1x1 PNG (minimal valid PNG) - will be colored green
// This is a minimal valid PNG file
const createMinimalPNG = (size) => {
    // For a proper icon, we'll use sharp
    return new Promise(async (resolve, reject) => {
        try {
            const sharp = require('sharp');

            // Create a green circle with music note
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="12" fill="#1DB954"/>
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill="white"/>
      </svg>`;

            await sharp(Buffer.from(svg))
                .resize(size, size)
                .png()
                .toFile(path.join(outputDir, `icon${size}.png`));

            console.log(`Created icon${size}.png`);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
};

async function main() {
    try {
        await createMinimalPNG(16);
        await createMinimalPNG(48);
        await createMinimalPNG(128);
        console.log('All icons created!');
    } catch (err) {
        console.error('Error:', err);
    }
}

main();
