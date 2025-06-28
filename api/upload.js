const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); 
const qs = require('querystring');
const crypto = require('crypto');

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



// Zoom OAuth Credentials (from environment variables)
const ZOOM_CLIENT_ID = "7LMARfR7Qxies3TR_A1Gdw";
const ZOOM_CLIENT_SECRET = "BU2oGSIYFEwmL8ENMZjzNn5FuJWSKh0Y";
const ZOOM_ACCOUNT_ID = "NPmpj715Rk-FbfUPxqUchA"; // Required for server-to-server OAuth

// Helper function to get Zoom OAuth token
async function getZoomOAuthToken() {
  const authString = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');

  const response = await axios.post(
    'https://zoom.us/oauth/token',
    qs.stringify({
      grant_type: 'account_credentials',
      account_id: ZOOM_ACCOUNT_ID,
    }),
    {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}

// Updated endpoint
app.post('/upload-vtt-url', async (req, res) => {
  const { meetingId } = req.body; // Only meetingId is needed now

  try {
    // 1. Get OAuth token
    const accessToken = await getZoomOAuthToken();

    // 2. Fetch recording details
    const recordingResponse = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    // 3. Find VTT transcript
    const vttFile = recordingResponse.data.recording_files.find(
      file => file.file_type === 'TRANSCRIPT' && file.file_extension === 'VTT'
    );

    if (!vttFile) {
      return res.status(404).json({ error: 'No VTT transcript found' });
    }

    // 4. Download VTT file
    const vttResponse = await axios.get(vttFile.download_url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      responseType: 'text',
    });

    const cleanedText = extractTranscript(vttResponse.data);

    return res.json({
      success: true,
      data: cleanedText,
    });

  } catch (err) {
    console.error('Zoom API Error:', err.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to fetch transcript',
      details: err.response?.data || err.message,
    });
  }
});


app.post('/zoom-webhook', async(req, res) => {
try {
  if (req.body.event === "endpoint.url_validation")
{
   const plainToken = req.body.payload.plainToken;

      // HMAC SHA256 using the secret
      const secret = '3iKeMrfrRou1Wxjo2hYAzw';
      const hmac = crypto.createHmac('sha256', secret)
                         .update(plainToken)
                         .digest('hex');

      return res.status(200).json({
        plainToken: plainToken,
        encryptedToken: hmac,
        status: "success"
      });
  }

  if (req.body.event=== "recording.transcript_completed")
  {
     const bubbleURL = "https://giocuhna.bubbleapps.io/version-test/api/1.1/wf/transctipt_completed_2_copy_copy/";

      const response = await axios.post(bubbleURL, req.body, {
        headers: { 'Content-Type': 'application/json' }
      });

      return res.status(200).json({
        status: "Forwarded to Bubble",
        bubbleStatus: response.status,
        bubbleResponse: response.data
      });
  }

else
    return res.status(200).json({nice: "nothing"});
} catch (error) {
  console.log(error);
  
  return res.status(500).json({ error: error.message });
  

}
})




// Helper function to generate Zoom JWT
function generateZoomJWT(apiKey, apiSecret) {
  const payload = {
    iss: apiKey,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 // 1 hour expiration
  };
  
  return jwt.sign(payload, apiSecret);
}

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