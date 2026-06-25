const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicDir, 'index.html');
const stylePath = path.join(publicDir, 'css', 'style.css');
const homePath = path.join(publicDir, 'css', 'home.css');
const imagePath = path.join(publicDir, 'images', 'hero_banner.png');

function embed() {
  console.log('Starting asset embedding into index.html...');

  // 1. Read CSS files
  if (!fs.existsSync(stylePath) || !fs.existsSync(homePath)) {
    console.error('Error: CSS files not found.');
    process.exit(1);
  }
  const styleCss = fs.readFileSync(stylePath, 'utf8');
  const homeCss = fs.readFileSync(homePath, 'utf8');

  // 2. Read and Base64 encode the Hero Image
  if (!fs.existsSync(imagePath)) {
    console.error('Error: Hero image not found.');
    process.exit(1);
  }
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  console.log('Hero image successfully encoded to base64.');

  // 3. Read index.html
  if (!fs.existsSync(indexPath)) {
    console.error('Error: index.html not found.');
    process.exit(1);
  }
  let indexHtml = fs.readFileSync(indexPath, 'utf8');

  // 4. Replace external stylesheet link tags with style blocks
  const linkRegex = /<link\s+rel="stylesheet"\s+href="\/css\/style\.css"[^>]*>[\s\n]*<link\s+rel="stylesheet"\s+href="\/css\/home\.css"[^>]*>/i;
  
  const combinedCss = `
  <style>
    /* Embedded style.css */
    ${styleCss}
    
    /* Embedded home.css */
    ${homeCss}
  </style>`;

  if (linkRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(linkRegex, combinedCss);
    console.log('Successfully replaced link tags with combined style blocks.');
  } else {
    // Fallback if formatting differs slightly
    const singleStyleRegex = /<link\s+rel="stylesheet"\s+href="\/css\/style\.css"[^>]*>/i;
    const singleHomeRegex = /<link\s+rel="stylesheet"\s+href="\/css\/home\.css"[^>]*>/i;
    
    indexHtml = indexHtml.replace(singleStyleRegex, `<style>\n${styleCss}\n</style>`);
    indexHtml = indexHtml.replace(singleHomeRegex, `<style>\n${homeCss}\n</style>`);
    console.log('Replaced link tags using fallback individual matchers.');
  }

  // 5. Replace Hero Image URL with Base64 Data URI
  indexHtml = indexHtml.replace('src="/images/hero_banner.png"', `src="${imageBase64}"`);
  console.log('Successfully replaced hero banner image reference with Base64 URI.');

  // 6. Save modifications back to index.html
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('✅ Successfully wrote self-contained public/index.html!');
}

embed();
