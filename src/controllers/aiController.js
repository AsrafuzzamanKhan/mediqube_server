const asyncHandler = require('express-async-handler');
const { Doctor } = require('../models');

// ── Groq text API call helper ──────────────────────────────
async function callGroq(messages, systemPrompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in .env');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq error:', err);
    throw new Error('AI service unavailable');
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Groq vision API call helper ────────────────────────────
// Uses meta-llama/llama-4-scout-17b-16e-instruct which supports image input
async function callGroqVision(imageBase64, mimeType, prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in .env');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq vision error:', err);
    throw new Error('Vision AI service unavailable');
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Disease → Specialty mapping ────────────────────────────
const DISEASE_MAP = {
  heart: 'Cardiologist', cardiac: 'Cardiologist', 'chest pain': 'Cardiologist', palpitation: 'Cardiologist',
  skin: 'Dermatologist', rash: 'Dermatologist', acne: 'Dermatologist', eczema: 'Dermatologist',
  eye: 'Ophthalmologist', vision: 'Ophthalmologist', blind: 'Ophthalmologist',
  bone: 'Orthopedic', joint: 'Orthopedic', fracture: 'Orthopedic', knee: 'Orthopedic', back: 'Orthopedic',
  brain: 'Neurologist', headache: 'Neurologist', migraine: 'Neurologist', seizure: 'Neurologist',
  child: 'Pediatrician', baby: 'Pediatrician', infant: 'Pediatrician', kid: 'Pediatrician',
  mental: 'Psychiatrist', anxiety: 'Psychiatrist', depression: 'Psychiatrist', stress: 'Psychiatrist',
  stomach: 'Gastroenterologist', digestion: 'Gastroenterologist', bowel: 'Gastroenterologist',
  diabetes: 'Endocrinologist', thyroid: 'Endocrinologist', hormone: 'Endocrinologist',
  cancer: 'Oncologist', tumor: 'Oncologist',
  kidney: 'Nephrologist', urine: 'Nephrologist',
  lung: 'Pulmonologist', breathing: 'Pulmonologist', asthma: 'Pulmonologist', cough: 'Pulmonologist',
  ear: 'ENT Specialist', nose: 'ENT Specialist', throat: 'ENT Specialist', tonsil: 'ENT Specialist',
  flu: 'General Practitioner', fever: 'General Practitioner', cold: 'General Practitioner', general: 'General Practitioner',
};

function guessSpecialty(text) {
  const lower = (text || '').toLowerCase();
  for (const [keyword, specialty] of Object.entries(DISEASE_MAP)) {
    if (lower.includes(keyword)) return specialty;
  }
  return 'General Practitioner';
}

// ── POST /api/ai/chat ──────────────────────────────────────
exports.chat = asyncHandler(async (req, res) => {
  const { messages, message } = req.body;
  if (!message) { res.status(400); throw new Error('Message is required'); }

  const doctors = await Doctor.find({ isApproved: true }).populate('user', 'name').lean();
  const doctorList = doctors.map(d =>
    `- ${d.user?.name} | Specialties: ${d.specialties?.join(', ')} | Fee: $${d.consultationFee} | Video: $${d.videoFee} | Experience: ${d.experience} yrs`
  ).join('\n');

  const systemPrompt = `You are a friendly medical assistant for MediQube, an Australian GP appointment booking system.
Your job is to:
1. Listen to the patient's symptoms or health concern
2. Suggest the most appropriate medical specialty they should see
3. From the available doctors list below, recommend 1-2 specific doctors that match
4. Keep responses short, friendly, and helpful — max 4 sentences
5. Always end by saying the patient can click "Book Appointment" to proceed
6. NEVER diagnose diseases — only suggest which specialist to see

Available doctors on MediQube:
${doctorList}

Important: You are NOT a replacement for real medical advice. Always recommend seeing a doctor.`;

  const history = (messages || []).slice(-6);
  const reply = await callGroq([...history, { role: 'user', content: message }], systemPrompt);
  const suggestedSpecialty = guessSpecialty(message);

  res.json({ success: true, data: { reply, suggestedSpecialty } });
});

// ── POST /api/ai/analyse-prescription ─────────────────────
// Accepts: text (string), imageBase64+mimeType (image), or pdfBase64 (PDF)
exports.analysePrescription = asyncHandler(async (req, res) => {
  const { text, prescriptionText, imageBase64, mimeType, pdfBase64 } = req.body;

  const jsonPrompt = `Analyse this prescription/medical document and respond ONLY with valid JSON (no markdown, no extra text):
{
  "conditions": ["condition1","condition2"],
  "recommendedSpecialty": "SingleBestSpecialty",
  "medications": ["med1","med2"],
  "urgency": "routine|soon|urgent",
  "summary": "2 sentence plain English summary"
}`;

  let raw = '';
  let inputTextForFallback = text || prescriptionText || '';

  if (imageBase64 && mimeType) {
    raw = await callGroqVision(imageBase64, mimeType, jsonPrompt);
  } else if (pdfBase64) {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = Buffer.from(pdfBase64, 'base64');
      const { text: pdfText } = await pdfParse(buffer);
      inputTextForFallback = pdfText;
      raw = await callGroq(
        [{ role: 'user', content: `Prescription document text:\n${pdfText}` }],
        jsonPrompt
      );
    } catch (e) {
      console.error('PDF parse error:', e.message);
      res.status(422);
      throw new Error('Could not read the PDF. Please try a different file or paste the text manually.');
    }
  } else {
    const prescText = text || prescriptionText;
    if (!prescText) {
      res.status(400);
      throw new Error('Please provide prescription text or upload an image/PDF');
    }
    raw = await callGroq(
      [{ role: 'user', content: `Prescription text:\n${prescText}` }],
      jsonPrompt
    );
  }

  let parsed;
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    const fallbackSpecialty = guessSpecialty(inputTextForFallback);
    parsed = {
      conditions: ['See prescription details'],
      recommendedSpecialty: fallbackSpecialty,
      medications: [],
      urgency: 'routine',
      summary: raw.slice(0, 200) || 'Please consult with a General Practitioner.',
    };
  }

  // Normalise — AI sometimes returns an array instead of a string
  if (Array.isArray(parsed.recommendedSpecialty)) {
    parsed.recommendedSpecialty = parsed.recommendedSpecialty[0] || 'General Practitioner';
  }
  if (!parsed.recommendedSpecialty && Array.isArray(parsed.recommendedSpecialties)) {
    parsed.recommendedSpecialty = parsed.recommendedSpecialties[0] || 'General Practitioner';
  }
  parsed.recommendedSpecialty = parsed.recommendedSpecialty || 'General Practitioner';

  // Fetch up to 3 matching doctors from the DB
  const specialty = parsed.recommendedSpecialty;
  const matchingDoctors = await Doctor.find({
    isApproved: true,
    specialties: { $regex: specialty.split(' ')[0], $options: 'i' },
  })
    .populate('user', 'name')
    .limit(3)
    .lean();

  res.json({ success: true, data: { ...parsed, matchingDoctors } });
});
