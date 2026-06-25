const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const htmlFiles = ['index.html', 'about.html', 'blogs.html', 'blog-detail.html', 'admin.html'];

function makeRelative() {
  console.log('Starting URL relative path refactoring...');
  
  htmlFiles.forEach(fileName => {
    const filePath = path.join(publicDir, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`File ${fileName} not found. Skipping.`);
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace absolute links with relative ones
    content = content
      .replace(/href="\/"/g, 'href="index.html"')
      .replace(/href="\/index\.html"/g, 'href="index.html"')
      .replace(/href="\/about\.html"/g, 'href="about.html"')
      .replace(/href="\/blogs\.html"/g, 'href="blogs.html"')
      .replace(/href="\/blog-detail\.html"/g, 'href="blog-detail.html"')
      .replace(/href="\/admin\.html"/g, 'href="admin.html"')
      // script paths
      .replace(/src="\/js\//g, 'src="js/');
      
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Converted URLs in ${fileName} to relative paths.`);
  });
  
  console.log('Refactoring completed successfully!');
}

makeRelative();
