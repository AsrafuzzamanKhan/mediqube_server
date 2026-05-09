const jwt = require('jsonwebtoken');
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
        <p>Your consultation with <b>Dr. ${doctorName}</b> on <b>${new Date(date).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</b> is complete.</p>
        ${rows ? `<h3 style="color:#1a6b3a">Medications</h3><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f0fdf4"><th style="padding:8px 12px;text-align:left">Medication</th><th style="padding:8px 12px;text-align:left">Dosage</th><th style="padding:8px 12px;text-align:left">Frequency</th><th style="padding:8px 12px;text-align:left">Duration</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
        ${prescription.instructions ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin-top:16px;border-radius:4px"><b>Instructions:</b><br>${prescription.instructions}</div>` : ''}
        <p style="margin-top:20px;font-size:12px;color:#9ca3af">If symptoms worsen, call your doctor or 000 in emergencies.</p>
      </div></div>`,
  });
};

const appointmentStatusEmail = ({ to, patientName, doctorName, date, time, type, status }) => {
  const clr = { approved: '#16a34a', rejected: '#dc2626', cancelled: '#6b7280' }[status] || '#374151';
  return sendEmail({
    to, subject: `Appointment ${status} — MediQube`,
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:24px;text-align:center;border-radius:12px 12px 0 0"><h2 style="color:white;margin:0">Appointment Update</h2></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hi <b>${patientName}</b>, your appointment with <b>Dr. ${doctorName}</b> is <span style="color:${clr};font-weight:700">${status.toUpperCase()}</span>.</p>
        <p><b>Date:</b> ${new Date(date).toLocaleDateString('en-AU')} &nbsp; <b>Time:</b> ${time} &nbsp; <b>Type:</b> ${type === 'video' ? '📹 Video' : '🏥 In-Person'}</p>
        ${status === 'approved' ? '<p style="color:#16a34a">✅ Please be ready on time.</p>' : ''}
      </div></div>`,
  });
};

const resetPasswordEmail = ({ to, name, token }) =>
  sendEmail({
    to, subject: 'Reset your MediQube password',
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:28px;text-align:center;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0">Password Reset</h2></div>
      <div style="background:white;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hi <b>${name}</b>,</p>
        <p>We received a request to reset your MediQube password. Click the button below — this link expires in <b>1 hour</b>.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${process.env.CLIENT_URL}/reset-password/${token}" style="background:#1a6b3a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Reset Password</a>
        </div>
        <p style="font-size:12px;color:#9ca3af">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
      </div></div>`,
  });

const verificationEmail = ({ to, name, token }) =>
  sendEmail({
    to, subject: 'Verify your MediQube email',
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:28px;text-align:center;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0">Verify Your Email</h2></div>
      <div style="background:white;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hi <b>${name}</b>,</p>
        <p>Please click the button below to verify your email address. This link expires in <b>24 hours</b>.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${process.env.CLIENT_URL}/verify-email/${token}" style="background:#1a6b3a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Verify Email</a>
        </div>
        <p style="font-size:12px;color:#9ca3af">If you did not create a MediQube account, ignore this email.</p>
      </div></div>`,
  });

const welcomeEmail = ({ to, name, role }) =>
  sendEmail({
    to, subject: 'Welcome to MediQube!',
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:28px;text-align:center;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0">Welcome to MediQube 🏥</h2></div>
      <div style="background:white;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hi <b>${name}</b>,</p>
        <p>Your account has been created successfully as a <b>${role}</b>.</p>
        <p>You can now log in and ${role === 'doctor' ? 'manage your appointments and patients' : 'book appointments with our doctors'}.</p>
        <p style="margin-top:20px;font-size:12px;color:#9ca3af">If you did not create this account, please ignore this email.</p>
      </div></div>`,
  });

const bookingConfirmEmail = ({ to, patientName, doctorName, date, time, type }) =>
  sendEmail({
    to, subject: 'Appointment Booked — MediQube',
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a6b3a,#2d9b5a);padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0">Appointment Requested</h2></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hi <b>${patientName}</b>, your appointment request has been submitted.</p>
        <p><b>Doctor:</b> Dr. ${doctorName}</p>
        <p><b>Date:</b> ${new Date(date).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p><b>Time:</b> ${time}</p>
        <p><b>Type:</b> ${type === 'video' ? '📹 Video Consultation' : '🏥 In-Person'}</p>
        <p style="color:#f59e0b">⏳ Awaiting doctor confirmation. You will receive another email once confirmed.</p>
        <p style="margin-top:20px;font-size:12px;color:#9ca3af">If you did not make this booking, please contact support.</p>
      </div></div>`,
  });

module.exports = { generateToken, sendEmail, resetPasswordEmail, verificationEmail, welcomeEmail, bookingConfirmEmail, prescriptionEmail, appointmentStatusEmail };
