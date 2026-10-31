const { GoogleGenerativeAI } = require('@google/generative-ai');
const { queryOne } = require('../db/database');

function getActiveApiKey() {
  // 1. Check database setting
  try {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', ['gemini_api_key']);
    if (row && row.value && row.value.trim().length > 5) {
      return row.value.trim();
    }
  } catch (err) {
    // Database might not be ready yet
  }

  // 2. Fallback to process.env
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    return process.env.GEMINI_API_KEY.trim();
  }

  return null;
}

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-flash'
];

const EXTRACTION_PROMPT = `You are an expert job posting analyzer. Extract structured information from the provided job posting text or screenshot.
Return ONLY a valid JSON object with the following fields:

{
  "company": "Company name",
  "position": "Job title or position name",
  "location": "City, Country, or 'Remote' / 'Hybrid' / 'Onsite'",
  "salary": "Salary range or compensation details if mentioned, otherwise empty string",
  "job_type": "Full-time, Part-time, Contract, Internship, Freelance, or Remote",
  "description": "Brief summary of key responsibilities and requirements (2-3 sentences)",
  "source": "Platform where this was posted (e.g. LinkedIn, Jobstreet, Glints, Kalibrr, Indeed, Tech in Asia) or empty string",
  "url": "Application or company URL if present, otherwise empty string"
}

Important Instructions:
- If a field is not found or ambiguous, leave it as an empty string "".
- Clean up any messy formatting, line breaks, or OCR artifacts.
- Do NOT wrap the output in markdown code blocks like \`\`\`json. Return raw JSON string only.`;

function getGenAI() {
  const apiKey = getActiveApiKey();
  if (!apiKey) {
    throw new Error('API Key Gemini belum diset. Silakan masukkan API Key di menu Pengaturan.');
  }
  return new GoogleGenerativeAI(apiKey);
}

async function generateWithFallback(genAI, contentParts) {
  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(contentParts);
      const responseText = result.response.text();
      const cleaned = responseText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      lastError = err;
      // If error is 404 model not found, try the next model
      if (err.message && err.message.includes('404')) {
        console.warn(`Model ${modelName} not found, trying fallback...`);
        continue;
      }
      // For auth or quota errors, rethrow immediately
      throw err;
    }
  }

  throw lastError;
}

async function extractFromText(text) {
  const genAI = getGenAI();
  try {
    return await generateWithFallback(genAI, [
      EXTRACTION_PROMPT,
      `\n\nJob Posting Content:\n${text}`
    ]);
  } catch (error) {
    console.error('Error extracting from text:', error);
    if (error.message && error.message.includes('API Key Gemini')) {
      throw error;
    }
    throw new Error('Gagal mengekstrak lowongan kerja: ' + (error.message || 'Error tidak diketahui'));
  }
}

async function extractFromImage(base64Data, mimeType) {
  const genAI = getGenAI();
  try {
    return await generateWithFallback(genAI, [
      EXTRACTION_PROMPT,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ]);
  } catch (error) {
    console.error('Error extracting from image:', error);
    if (error.message && error.message.includes('API Key Gemini')) {
      throw error;
    }
    throw new Error('Gagal mengekstrak lowongan kerja dari gambar: ' + (error.message || 'Error tidak diketahui'));
  }
}

module.exports = { extractFromText, extractFromImage, getActiveApiKey };
