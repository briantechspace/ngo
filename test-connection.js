// Connection and Configuration Validation Script
const db = require('./db');
const { getUploadedFileUrl } = require('./cloudinary');
const http = require('http');

async function runValidation() {
  console.log('--- STARTING SYSTEM INTEGRITY VALIDATION ---');
  
  // 1. Validate Database Manager
  console.log('\n1. Validating DB Manager...');
  try {
    const stats = await db.getDashboardStats();
    console.log('✅ Stats loaded successfully:', JSON.stringify(stats));
    
    const blogs = await db.getBlogs();
    console.log(`✅ Blogs count retrieved: ${blogs.length}`);
    if (blogs.length > 0) {
      console.log(`   Sample Blog Slug: "${blogs[0].slug}"`);
    } else {
      console.error('❌ Failed: Blog list is empty. Seed data might be missing.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ DB Manager validation failed:', error);
    process.exit(1);
  }

  // 2. Validate Multer Storage Fallback
  console.log('\n2. Validating Cloudinary/Multer Upload Fallback...');
  try {
    const mockReq = {
      file: {
        filename: 'test-image-12345.jpg',
        path: '/uploads/test-image-12345.jpg'
      }
    };
    const resolvedUrl = getUploadedFileUrl(mockReq);
    console.log(`✅ File upload resolved path: "${resolvedUrl}"`);
    if (!resolvedUrl || !resolvedUrl.includes('test-image-12345')) {
      console.error('❌ Failed: Resolved path incorrect.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Multer validation failed:', error);
    process.exit(1);
  }

  console.log('\n--- SYSTEM VALIDATION SUCCESSFUL ---');
  console.log('Backend configurations and fallbacks are correct. Launching server next.');
}

runValidation();
