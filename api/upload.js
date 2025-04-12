const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Multer setup
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

// Upload and process VTT route
app.post('/upload-vtt', upload.single('file'), (req, res) => {
  try {
    const filePath = req.file.path;
    const rawText = fs.readFileSync(filePath, 'utf8');

    // Clean the VTT content
    const cleanedText = extractTranscript(rawText);

    // Delete the file after reading
    fs.unlinkSync(filePath);

    res.json({ Data: cleanedText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process file.' });
  }
});

// Helper function to extract transcript
function extractTranscript(text) {
  const lines = text.split('\n');
  const result = [];

  for (const line of lines) {
    if (
      line.trim() === '' ||
      line.startsWith('WEBVTT') ||
      /^\d{2}:\d{2}:\d{2}\.\d{3}/.test(line) ||
      /-->/.test(line)
    ) {
      continue;
    }
    result.push(line.trim());
  }

  return result.join(' ');
}

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
