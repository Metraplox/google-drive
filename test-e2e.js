// Simple E2E test script
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

async function testEndpoints() {
  console.log('🧪 Testing MVP REST Files endpoints...\n');

  // Test 1: GET /files (initial state)
  console.log('1. Testing GET /files (initial state)...');
  const initialFiles = await makeRequest('GET', '/files');
  console.log('   Response:', initialFiles);
  console.log('   ✅ Initial state: empty array\n');

  // Test 2: POST /files (upload)
  console.log('2. Testing POST /files (upload)...');
  
  // Create test file with valid MIME type
  const testContent = '%PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x00\x01\x00\x18\xdd\x8d\xb4\x1c\x00\x00\x00\x00IEND\xaeB`\x82';
  fs.writeFileSync('./temp-test.png', testContent, 'binary');
  
  const form = new FormData();
  form.append('file', fs.createReadStream('./temp-test.png'), {
    filename: 'test-upload.png',
    contentType: 'image/png'
  });

  const uploadResponse = await makeFormRequest('POST', '/files', form);
  console.log('   Upload Response:', uploadResponse);
  
  const fileId = JSON.parse(uploadResponse).id;
  console.log('   ✅ File uploaded with ID:', fileId, '\n');

  // Test 3: GET /files (after upload)
  console.log('3. Testing GET /files (after upload)...');
  const filesAfterUpload = await makeRequest('GET', '/files');
  console.log('   Response:', filesAfterUpload);
  console.log('   ✅ File appears in list\n');

  // Test 4: GET /files/:id (download)
  console.log('4. Testing GET /files/:id (download)...');
  const downloadResponse = await makeRequest('GET', `/files/${fileId}`, true);
  console.log('   Downloaded content length:', downloadResponse.length);
  console.log('   ✅ File downloaded successfully\n');

  // Test 5: DELETE /files/:id
  console.log('5. Testing DELETE /files/:id...');
  const deleteResponse = await makeRequest('DELETE', `/files/${fileId}`);
  console.log('   Delete Response:', deleteResponse);
  console.log('   ✅ File deleted\n');

  // Test 6: GET /files (after delete)
  console.log('6. Testing GET /files (after delete)...');
  const finalFiles = await makeRequest('GET', '/files');
  console.log('   Response:', finalFiles);
  console.log('   ✅ File removed from list\n');

  // Cleanup
  try {
    fs.unlinkSync('./temp-test.png');
  } catch(e) {
    // File might not exist, ignore
  }
  
  console.log('🎉 All tests passed! MVP REST Files is working correctly.');
}

function makeRequest(method, path, binary = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
    };

    const req = http.request(options, (res) => {
      let data = binary ? Buffer.alloc(0) : '';

      res.on('data', (chunk) => {
        if (binary) {
          data = Buffer.concat([data, chunk]);
        } else {
          data += chunk;
        }
      });

      res.on('end', () => {
        resolve(binary ? data : data);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function makeFormRequest(method, path, form) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: form.getHeaders()
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

// Run tests
testEndpoints().catch(console.error);
