const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`📧 [No email config] Would send: "${subject}" to ${to}`); return;
  }
  try {
    const t = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await t.sendMail({ from: `"MediQube" <${process.env.EMAIL_USER}>`, to, subject, html });
    console.log(`📧 Email sent → ${to}`);
  } catch (e) { console.error('Email error:', e.message); }
};

const prescriptionEmail = ({ to, patientName, doctorName, date, prescription }) => {
  const rows = (prescription.medications || []).map(m =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0"><b>${m.name}</b></td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${m.dosage}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${m.frequency}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${m.duration}</td></tr>`
  ).join('');
  return sendEmail({
    to, subject: `Prescription from Dr. ${doctorName} — MediQube`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:28px;text-align:center;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0">🏥 Prescription Ready</h2></div>
      <div style="background:white;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Dear <b>${patientName}</b>,</p>
        <p>Your consultation with <b>Dr. ${doctorName}</b> on <b>${new Date(date).toLocaleDateString('en-AU',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</b> is complete.</p>
        ${rows ? `<h3 style="color:#1a6b3a">Medications</h3><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f0fdf4"><th style="padding:8px 12px;text-align:left">Medication</th><th style="padding:8px 12px;text-align:left">Dosage</th><th style="padding:8px 12px;text-align:left">Frequency</th><th style="padding:8px 12px;text-align:left">Duration</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
        ${prescription.instructions ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin-top:16px;border-radius:4px"><b>Instructions:</b><br>${prescription.instructions}</div>` : ''}
        <p style="margin-top:20px;font-size:12px;color:#9ca3af">If symptoms worsen, call your doctor or 000 in emergencies.</p>
      </div></div>`,
  });
};

const appointmentStatusEmail = ({ to, patientName, doctorName, date, time, type, status }) => {
  const clr = { approved:'#16a34a', rejected:'#dc2626', cancelled:'#6b7280' }[status] || '#374151';
  return sendEmail({
    to, subject: `Appointment ${status} — MediQube`,
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:24px;text-align:center;border-radius:12px 12px 0 0"><h2 style="color:white;margin:0">Appointment Update</h2></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hi <b>${patientName}</b>, your appointment with <b>Dr. ${doctorName}</b> is <span style="color:${clr};font-weight:700">${status.toUpperCase()}</span>.</p>
        <p><b>Date:</b> ${new Date(date).toLocaleDateString('en-AU')} &nbsp; <b>Time:</b> ${time} &nbsp; <b>Type:</b> ${type === 'video' ? '📹 Video' : '🏥 In-Person'}</p>
        ${status==='approved' ? '<p style="color:#16a34a">✅ Please be ready on time.</p>' : ''}
      </div></div>`,
  });
};

module.exports = { generateToken, sendEmail, prescriptionEmail, appointmentStatusEmail };
