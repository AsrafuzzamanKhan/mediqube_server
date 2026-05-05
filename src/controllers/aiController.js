const asyncHandler = require('express-async-handler');
const { Doctor } = require('../models');

// ── Groq API call helper ───────────────────────────────────
async function callGroq(messages, systemPrompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in .env');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama3-8b-8192',   // Free model on Groq
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
  const lower = text.toLowerCase();
  for (const [keyword, specialty] of Object.entries(DISEASE_MAP)) {
    if (lower.includes(keyword)) return specialty;
  }
  return 'General Practitioner';
}

// ── POST /api/ai/chat ──────────────────────────────────────
// Patient chats about symptoms → AI suggests specialty + shows available doctors
exports.chat = asyncHandler(async (req, res) => {
  const { messages, message } = req.body;
  if (!message) { res.status(400); throw new Error('Message is required'); }

  // Get all approved doctors to pass as context
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

  const history = (messages || []).slice(-6); // keep last 6 messages for context
  const reply = await callGroq([...history, { role: 'user', content: message }], systemPrompt);

  // Also guess specialty from message keywords for frontend filtering
  const suggestedSpecialty = guessSpecialty(message);

  res.json({ success: true, data: { reply, suggestedSpecialty } });
});

// ── POST /api/ai/analyse-prescription ─────────────────────
// Patient uploads prescription as base64 image OR types prescription text
// AI extracts specialty needed
exports.analysePrescription = asyncHandler(async (req, res) => {
  const { prescriptionText, additionalSymptoms } = req.body;

  if (!prescriptionText) { res.status(400); throw new Error('Prescription text is required'); }

  const systemPrompt = `You are a medical document analyser for MediQube.
Analyse the prescription text provided and respond ONLY with valid JSON (no markdown, no extra text):
{
  "conditions": ["condition1","condition2"],
  "recommendedSpecialties": ["specialty1","specialty2"],
  "medications": ["med1","med2"],
  "urgency": "routine|soon|urgent",
  "summary": "2 sentence plain English summary",
  "searchKeyword": "best single keyword to search for doctor"
}`;

  const userMessage = `Prescription text:\n${prescriptionText}${additionalSymptoms ? `\n\nAdditional symptoms: ${additionalSymptoms}` : ''}`;

  let raw = '';
  try {
    raw = await callGroq([{ role: 'user', content: userMessage }], systemPrompt);
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch {
    // If JSON parse fails, still return something useful
    const fallbackSpecialty = guessSpecialty(prescriptionText);
    res.json({
      success: true,
      data: {
        conditions: ['See prescription details'],
        recommendedSpecialties: [fallbackSpecialty],
        medications: [],
        urgency: 'routine',
        summary: raw.slice(0, 200) || 'Please consult with a General Practitioner.',
        searchKeyword: fallbackSpecialty,
      },
    });
  }
});
