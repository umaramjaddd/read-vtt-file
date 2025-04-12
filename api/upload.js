const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const isVercel = process.env.VERCEL === '1';
const port = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = isVercel ? '/tmp/uploads' : 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup with file filtering and limits
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.vtt') {
      return cb(new Error('Only .vtt files are allowed'));
    }
    cb(null, true);
  }
});

// Middleware
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.send('VTT File Processor API - POST your VTT files to /upload-vtt');
});

// Upload and process VTT route
app.post('/upload-vtt', upload.single('file'), async (req, res) => {
  try {
    // Validate file exists
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    
    try {
      // Read and process file
      const rawText = await fs.promises.readFile(filePath, 'utf8');
      const cleanedText = extractTranscript(rawText);

      // Clean up file
      await fs.promises.unlink(filePath);

      // Return successful response
      return res.json({ 
        success: true,
        data: cleanedText,
        originalLength: rawText.length,
        processedLength: cleanedText.length
      });
      
    } catch (fileError) {
      // Clean up file if something went wrong
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(console.error);
      }
      throw fileError;
    }

  } catch (err) {
    console.error('Error processing file:', err);
    
    return res.status(500).json({ 
      error: 'Failed to process file',
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
});

// Helper function to extract transcript
function extractTranscript(text) {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return (
        trimmed && 
        !trimmed.startsWith('WEBVTT') &&
        !/^\d{2}:\d{2}:\d{2}\.\d{3}/.test(trimmed) &&
        !trimmed.includes('-->')
      );
    })
    .map(line => line.trim())
    .join(' ');
}

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      message: err.message
    });
  }
  next(err);
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Upload directory: ${path.resolve(uploadDir)}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});