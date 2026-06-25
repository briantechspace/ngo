const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const cssDir = path.join(publicDir, 'css');

// Mappings of HTML files to their style sheets
const fileMappings = [
  { htmlFile: 'index.html', cssFile: 'home.css' },
  { htmlFile: 'about.html', cssFile: 'about.css' },
  { htmlFile: 'blogs.html', cssFile: 'blogs.css' },
  { htmlFile: 'blog-detail.html', cssFile: 'blogs.css' },
  { htmlFile: 'admin.html', cssFile: 'admin.css' }
];

function sync() {
  console.log('Syncing CSS into HTML files...');

  const styleCssPath = path.join(cssDir, 'style.css');
  if (!fs.existsSync(styleCssPath)) {
    console.error('style.css not found.');
    process.exit(1);
  }
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');

  for (const { htmlFile, cssFile } of fileMappings) {
    const htmlPath = path.join(publicDir, htmlFile);
    const cssPath = path.join(cssDir, cssFile);

    if (!fs.existsSync(htmlPath)) {
      console.warn(`HTML file not found: ${htmlFile}`);
      continue;
    }
    if (!fs.existsSync(cssPath)) {
      console.warn(`CSS file not found: ${cssFile}`);
      continue;
    }

    const componentCss = fs.readFileSync(cssPath, 'utf8');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Build replacement block
    const replacement = `  <style>
    /* --- style.css --- */
    ${styleCss}

    /* --- ${cssFile} --- */
    ${componentCss}
  </style>`;

    // Replace the style block inside the head
    const styleRegex = /<!-- Style Sheets[^>]*-->[\s\n]*<style>[\s\S]*?<\/style>/i;
    if (styleRegex.test(htmlContent)) {
      htmlContent = htmlContent.replace(styleRegex, `<!-- Style Sheets (Embedded for Standalone/Local viewing) -->\n${replacement}`);
      fs.writeFileSync(htmlPath, htmlContent, 'utf8');
      console.log(`✅ Successfully synced CSS into ${htmlFile}`);
    } else {
      // Fallback if formatting differs slightly
      const simpleRegex = /<style>[\s\S]*?<\/style>/i;
      if (simpleRegex.test(htmlContent)) {
        htmlContent = htmlContent.replace(simpleRegex, replacement);
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        console.log(`✅ Synced CSS into ${htmlFile} (using fallback style regex)`);
      } else {
        console.error(`❌ Could not locate style block in ${htmlFile}`);
      }
    }
  }
}

sync();
