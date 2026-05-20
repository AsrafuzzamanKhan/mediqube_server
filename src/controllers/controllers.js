const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { User, Doctor, Patient, Appointment, Notification, FAQ, Support } = require('../models');
const { generateToken, resetPasswordEmail, verificationEmail, welcomeEmail, bookingConfirmEmail, prescriptionEmail, appointmentStatusEmail: statusEmail } = require('../utils/helpers');

// ── notify helper ──────────────────────────────────────────
const notify = async (io, { recipient, sender, type, title, message, data }) => {
  const n = await Notification.create({ recipient, sender, type, title, message, data });
  io?.to(recipient.toString()).emit('notification', n);
};

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'patient', phone } = req.body;
  if (!name || !email || !password) { res.status(400); throw new Error('Name, email, password required'); }
  const exists = await User.findOne({ email });
  if (exists) { res.status(400); throw new Error('Email already registered'); }
  const safeRole = ['patient', 'doctor'].includes(role) ? role : 'patient';
  const user = await User.create({ name, email, password, role: safeRole, phone, isVerified: true });
  if (safeRole === 'doctor') await Doctor.create({ user: user._id });
  else await Patient.create({ user: user._id });
  res.status(201).json({ success: true, message: 'Account created. You can now sign in.' });
});

// Role is fetched from DB — client just sends email + password
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400); throw new Error('Email and password required'); }
  const user = await User.findOne({ email });
  if (!user || !(await user.matchPassword(password))) { res.status(401); throw new Error('Invalid email or password'); }
  if (user.isVerified === false) { res.status(403); throw new Error('Please verify your email before logging in. Check your inbox.'); }
  if (!user.isActive) { res.status(403); throw new Error('Account deactivated — contact support'); }
  user.lastLogin = new Date(); await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, phone: user.phone, token: generateToken(user._id, user.role) } });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) { res.status(404); throw new Error('No account found with that email.'); }
  const token = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = token;
  user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save({ validateBeforeSave: false });
  resetPasswordEmail({ to: user.email, name: user.name, token });
  res.json({ success: true, message: 'Password reset link sent to your email.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpire: { $gt: Date.now() } });
  if (!user) { res.status(400); throw new Error('Reset link is invalid or has expired.'); }
  if (!req.body.password || req.body.password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters.'); }
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  res.json({ success: true, message: 'Password reset successful. You can now log in.' });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOne({ verificationToken: req.params.token, verificationTokenExpire: { $gt: Date.now() } });
  if (!user) { res.status(400); throw new Error('Verification link is invalid or has expired.'); }
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpire = undefined;
  await user.save({ validateBeforeSave: false });
  welcomeEmail({ to: user.email, name: user.name, role: user.role });
  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
});

exports.getMe = asyncHandler(async (req, res) => res.json({ success: true, data: req.user }));

exports.updatePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!(await user.matchPassword(req.body.currentPassword))) { res.status(400); throw new Error('Current password incorrect'); }
  user.password = req.body.newPassword; await user.save();
  res.json({ success: true, message: 'Password updated' });
});

// ══════════════════════════════════════════════════════════
// USER / PATIENT PROFILE
// ══════════════════════════════════════════════════════════
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, { name: req.body.name, phone: req.body.phone }, { new: true });
  res.json({ success: true, data: user });
});

exports.getPatientProfile = asyncHandler(async (req, res) => {
  const p = await Patient.findOne({ user: req.user._id }).populate('user', 'name email phone avatar');
  if (!p) { res.status(404); throw new Error('Profile not found'); }
  res.json({ success: true, data: p });
});

exports.updatePatientProfile = asyncHandler(async (req, res) => {
  const p = await Patient.findOneAndUpdate({ user: req.user._id }, req.body, { new: true });
  res.json({ success: true, data: p });
});

// ══════════════════════════════════════════════════════════
// DOCTORS (public search + profile management)
// ══════════════════════════════════════════════════════════
exports.getDoctors = asyncHandler(async (req, res) => {
  const { specialty, search, page = 1, limit = 12 } = req.query;
  const q = { isApproved: true };
  if (specialty) q.specialties = { $in: [new RegExp(specialty, 'i')] };
  if (search) {
    const nameMatches = await User.find({ name: new RegExp(search, 'i'), role: 'doctor' }, '_id');
    const userIds = nameMatches.map(u => u._id);
    q.$or = [
      { user: { $in: userIds } },
      { specialties: { $in: [new RegExp(search, 'i')] } },
      { bio: new RegExp(search, 'i') },
    ];
  }
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Doctor.find(q).populate('user', 'name email avatar phone').sort({ rating: -1 }).skip(+skip).limit(+limit),
    Doctor.countDocuments(q),
  ]);
  res.json({ success: true, data, total, pages: Math.ceil(total / limit) });
});

exports.getDoctorSuggestions = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ success: true, data: [] });
  const re = new RegExp(q, 'i');
  const [nameUsers, bySpecialty] = await Promise.all([
    User.find({ name: re, role: 'doctor' }, '_id name'),
    Doctor.find({ isApproved: true, specialties: { $in: [re] } }).populate('user', 'name').select('user specialties').limit(5),
  ]);
  const byName = await Doctor.find({ isApproved: true, user: { $in: nameUsers.map(u => u._id) } })
    .populate('user', 'name').select('user specialties').limit(5);
  const seen = new Set();
  const results = [...byName, ...bySpecialty].filter(d => {
    const id = d._id.toString();
    if (seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0, 6);
  res.json({ success: true, data: results });
});

exports.getDoctor = asyncHandler(async (req, res) => {
  const d = await Doctor.findById(req.params.id).populate('user', 'name email avatar phone');
  if (!d) { res.status(404); throw new Error('Doctor not found'); }
  res.json({ success: true, data: d });
});

exports.getSpecialties = asyncHandler(async (_, res) => {
  const s = await Doctor.distinct('specialties', { isApproved: true });
  res.json({ success: true, data: s.filter(Boolean).sort() });
});

exports.getMyDoctorProfile = asyncHandler(async (req, res) => {
  const d = await Doctor.findOne({ user: req.user._id }).populate('user', 'name email avatar phone');
  res.json({ success: true, data: d });
});

exports.updateDoctorProfile = asyncHandler(async (req, res) => {
  const d = await Doctor.findOneAndUpdate({ user: req.user._id }, req.body, { new: true });
  if (req.body.name) await User.findByIdAndUpdate(req.user._id, { name: req.body.name });
  res.json({ success: true, data: d });
});

// ══════════════════════════════════════════════════════════
// APPOINTMENTS
// ══════════════════════════════════════════════════════════
exports.bookAppointment = asyncHandler(async (req, res) => {
  const { doctorId, appointmentDate, appointmentTime, type, symptoms, notes } = req.body;
  const io = req.app.get('io');
  const doctor = await User.findById(doctorId);
  if (!doctor || doctor.role !== 'doctor') { res.status(404); throw new Error('Doctor not found'); }
  const profile = await Doctor.findOne({ user: doctorId });
  const fee = type === 'video' ? (profile?.videoFee || 0) : (profile?.consultationFee || 0);
  const appt = await Appointment.create({ patient: req.user._id, doctor: doctorId, appointmentDate, appointmentTime, type, symptoms, notes, fee, videoRoomId: type === 'video' ? uuidv4() : undefined });
  await notify(io, { recipient: doctorId, sender: req.user._id, type: 'appointment_request', title: 'New Appointment Request', message: `${req.user.name} requested a ${type} appointment on ${new Date(appointmentDate).toLocaleDateString('en-AU')} at ${appointmentTime}`, data: { appointmentId: appt._id } });
  bookingConfirmEmail({ to: req.user.email, patientName: req.user.name, doctorName: doctor.name, date: appointmentDate, time: appointmentTime, type });
  res.status(201).json({ success: true, data: appt });
});

exports.getMyAppointments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const q = req.user.role === 'patient' ? { patient: req.user._id } : { doctor: req.user._id };
  if (status) q.status = status;
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Appointment.find(q).populate('patient', 'name email avatar phone').populate('doctor', 'name email avatar phone').sort({ appointmentDate: -1 }).skip(+skip).limit(+limit),
    Appointment.countDocuments(q),
  ]);
  res.json({ success: true, data, total, pages: Math.ceil(total / limit) });
});

exports.getAppointment = asyncHandler(async (req, res) => {
  const a = await Appointment.findById(req.params.id).populate('patient', 'name email phone').populate('doctor', 'name email phone');
  if (!a) { res.status(404); throw new Error('Not found'); }
  const ok = [a.patient._id.toString(), a.doctor._id.toString()].includes(req.user._id.toString()) || req.user.role === 'admin';
  if (!ok) { res.status(403); throw new Error('Not authorised'); }
  res.json({ success: true, data: a });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body;
  const io = req.app.get('io');
  const a = await Appointment.findById(req.params.id).populate('patient', 'name email').populate('doctor', 'name email');
  if (!a) { res.status(404); throw new Error('Not found'); }
  if (req.user.role === 'doctor' && a.doctor._id.toString() !== req.user._id.toString()) { res.status(403); throw new Error('Not authorised'); }
  a.status = status;
  if (rejectionReason) a.rejectionReason = rejectionReason;
  if (status === 'completed') a.completedAt = new Date();
  await a.save();
  if (['approved', 'rejected', 'cancelled'].includes(status)) {
    await notify(io, { recipient: a.patient._id, sender: req.user._id, type: `appointment_${status}`, title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`, message: `Your appointment with Dr. ${a.doctor.name} has been ${status}.`, data: { appointmentId: a._id } });
    let suggestedDoctors = [];
    if (status === 'rejected') {
      const rejectedDoctor = await Doctor.findOne({ user: a.doctor._id }).select('specialties');
      if (rejectedDoctor?.specialties?.length) {
        suggestedDoctors = await Doctor.find({
          user: { $ne: a.doctor._id },
          specialties: { $in: rejectedDoctor.specialties },
          isApproved: true,
        }).populate('user', 'name').select('user specialties consultationFee videoFee rating experience').limit(3);
      }
    }
    statusEmail({ to: a.patient.email, patientName: a.patient.name, doctorName: a.doctor.name, date: a.appointmentDate, time: a.appointmentTime, type: a.type, status, rejectionReason: a.rejectionReason, suggestedDoctors });
  }
  res.json({ success: true, data: a });
});

exports.addPrescription = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const a = await Appointment.findById(req.params.id).populate('patient', 'name email').populate('doctor', 'name email');
  if (!a) { res.status(404); throw new Error('Not found'); }
  if (a.doctor._id.toString() !== req.user._id.toString()) { res.status(403); throw new Error('Not authorised'); }
  a.prescription = { ...req.body, issuedAt: new Date() };
  a.status = 'completed'; a.completedAt = new Date();
  await a.save();
  await notify(io, { recipient: a.patient._id, sender: req.user._id, type: 'prescription_added', title: 'Prescription Ready', message: `Dr. ${req.user.name} issued your prescription.`, data: { appointmentId: a._id } });
  if (!a.emailSent) { prescriptionEmail({ to: a.patient.email, patientName: a.patient.name, doctorName: req.user.name, date: a.appointmentDate, prescription: req.body }); a.emailSent = true; await a.save(); }
  res.json({ success: true, data: a });
});

exports.cancelAppointment = asyncHandler(async (req, res) => {
  const a = await Appointment.findById(req.params.id);
  if (!a) { res.status(404); throw new Error('Not found'); }
  if (['completed', 'cancelled'].includes(a.status)) { res.status(400); throw new Error('Cannot cancel'); }
  a.status = 'cancelled'; await a.save();
  res.json({ success: true, data: a });
});

exports.getBookedSlots = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) { res.status(400); throw new Error('doctorId and date required'); }
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);
  const booked = await Appointment.find({
    doctor: doctorId,
    appointmentDate: { $gte: start, $lte: end },
    status: { $in: ['pending', 'approved'] },
  }).select('appointmentTime');
  res.json({ success: true, data: booked.map(a => a.appointmentTime) });
});

exports.getAppointmentByRoom = asyncHandler(async (req, res) => {
  const a = await Appointment.findOne({ videoRoomId: req.params.roomId })
    .populate('doctor', 'name email avatar')
    .populate('patient', 'name');
  if (!a) { res.status(404); throw new Error('Not found'); }
  const ok = [a.patient._id.toString(), a.doctor._id.toString()].includes(req.user._id.toString());
  if (!ok) { res.status(403); throw new Error('Not authorised'); }
  res.json({ success: true, data: a });
});

exports.rateAppointment = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) { res.status(400); throw new Error('Rating must be between 1 and 5'); }
  const a = await Appointment.findById(req.params.id);
  if (!a) { res.status(404); throw new Error('Not found'); }
  if (a.patient.toString() !== req.user._id.toString()) { res.status(403); throw new Error('Not authorised'); }
  if (a.rating) { res.status(400); throw new Error('Already rated'); }
  a.rating = rating;
  if (comment) a.ratingComment = comment;
  await a.save();
  // Recompute the doctor's average rating across all rated appointments
  const rated = await Appointment.find({ doctor: a.doctor, rating: { $exists: true, $ne: null } }).select('rating');
  const avg = rated.reduce((s, r) => s + r.rating, 0) / rated.length;
  await Doctor.findOneAndUpdate({ user: a.doctor }, { rating: Math.round(avg * 10) / 10 });
  res.json({ success: true, data: a });
});

exports.getDoctorDashboard = asyncHandler(async (req, res) => {
  const id = req.user._id;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const [today, pending, completed, total] = await Promise.all([
    Appointment.find({ doctor: id, appointmentDate: { $gte: start, $lte: end } }).populate('patient', 'name email phone avatar').sort({ appointmentTime: 1 }),
    Appointment.countDocuments({ doctor: id, status: 'pending' }),
    Appointment.countDocuments({ doctor: id, status: 'completed' }),
    Appointment.countDocuments({ doctor: id }),
  ]);
  res.json({ success: true, data: { todayAppointments: today, stats: { today: today.length, pending, completed, total } } });
});

exports.getAllAppointments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const q = status ? { status } : {};
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Appointment.find(q).populate('patient', 'name email').populate('doctor', 'name email').sort({ createdAt: -1 }).skip(+skip).limit(+limit),
    Appointment.countDocuments(q),
  ]);
  res.json({ success: true, data, total, pages: Math.ceil(total / limit) });
});

// ══════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════
exports.getStats = asyncHandler(async (_, res) => {
  const [users, doctors, patients, totalAppts, pending, completed, pendingDoctors, openSupport] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }), User.countDocuments({ role: 'doctor' }),
    User.countDocuments({ role: 'patient' }), Appointment.countDocuments(),
    Appointment.countDocuments({ status: 'pending' }), Appointment.countDocuments({ status: 'completed' }),
    Doctor.countDocuments({ isApproved: false }), Support.countDocuments({ status: 'open' }),
  ]);
  res.json({ success: true, data: { users, doctors, patients, totalAppts, pending, completed, pendingDoctors, openSupport } });
});

exports.getAllUsers = asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;
  const q = {};
  if (role) q.role = role;
  if (search) q.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([User.find(q).sort({ createdAt: -1 }).skip(+skip).limit(+limit), User.countDocuments(q)]);
  res.json({ success: true, data, total, pages: Math.ceil(total / limit) });
});

exports.updateUserAdmin = asyncHandler(async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!u) { res.status(404); throw new Error('Not found'); }
  res.json({ success: true, data: u });
});

exports.deleteUserAdmin = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  await Doctor.findOneAndDelete({ user: req.params.id });
  await Patient.findOneAndDelete({ user: req.params.id });
  res.json({ success: true, message: 'Deleted' });
});

exports.getAllDoctors = asyncHandler(async (_, res) => {
  const data = await Doctor.find().populate('user', 'name email phone isActive createdAt').sort({ createdAt: -1 });
  res.json({ success: true, data });
});

exports.approveDoctor = asyncHandler(async (req, res) => {
  const d = await Doctor.findByIdAndUpdate(req.params.id, { isApproved: req.body.isApproved }, { new: true }).populate('user', 'name email');
  res.json({ success: true, data: d });
});

// ══════════════════════════════════════════════════════════
// FAQ
// ══════════════════════════════════════════════════════════
exports.getFAQs = asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  const q = { isPublished: true };
  if (category) q.category = new RegExp(category, 'i');
  if (search) q.$or = [{ question: new RegExp(search, 'i') }, { answer: new RegExp(search, 'i') }, { disease: new RegExp(search, 'i') }];
  res.json({ success: true, data: await FAQ.find(q).sort({ views: -1 }) });
});

exports.getFAQCategories = asyncHandler(async (_, res) =>
  res.json({ success: true, data: (await FAQ.distinct('category', { isPublished: true })).sort() })
);

exports.createFAQ = asyncHandler(async (req, res) => {
  const f = await FAQ.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, data: f });
});

exports.updateFAQ = asyncHandler(async (req, res) => {
  const f = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!f) { res.status(404); throw new Error('Not found'); }
  res.json({ success: true, data: f });
});

exports.deleteFAQ = asyncHandler(async (req, res) => {
  await FAQ.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════
exports.getNotifications = asyncHandler(async (req, res) => {
  const [data, unread] = await Promise.all([
    Notification.find({ recipient: req.user._id }).populate('sender', 'name avatar').sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);
  res.json({ success: true, data, unread });
});

exports.markRead = asyncHandler(async (req, res) => { await Notification.findByIdAndUpdate(req.params.id, { isRead: true }); res.json({ success: true }); });
exports.markAllRead = asyncHandler(async (req, res) => { await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true }); res.json({ success: true }); });
exports.deleteNotif = asyncHandler(async (req, res) => { await Notification.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// ══════════════════════════════════════════════════════════
// SUPPORT
// ══════════════════════════════════════════════════════════
exports.createTicket = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await Support.create({ ...req.body, user: req.user._id }) }));
exports.getMyTickets = asyncHandler(async (req, res) => res.json({ success: true, data: await Support.find({ user: req.user._id }).sort({ createdAt: -1 }) }));
exports.getAllTickets = asyncHandler(async (req, res) => res.json({ success: true, data: await Support.find(req.query.status ? { status: req.query.status } : {}).populate('user', 'name email role').sort({ createdAt: -1 }) }));

exports.getTicket = asyncHandler(async (req, res) => {
  const t = await Support.findById(req.params.id).populate('user', 'name email').populate('replies.sender', 'name role');
  if (!t) { res.status(404); throw new Error('Not found'); }
  res.json({ success: true, data: t });
});

exports.replyTicket = asyncHandler(async (req, res) => {
  const t = await Support.findById(req.params.id);
  if (!t) { res.status(404); throw new Error('Not found'); }
  t.replies.push({ sender: req.user._id, message: req.body.message });
  if (req.user.role === 'admin' && t.status === 'open') t.status = 'in-progress';
  await t.save();
  res.json({ success: true, data: t });
});

exports.updateTicketStatus = asyncHandler(async (req, res) => {
  const t = await Support.findByIdAndUpdate(req.params.id, { status: req.body.status, ...(req.body.status === 'resolved' && { resolvedAt: new Date() }) }, { new: true });
  res.json({ success: true, data: t });
});

// ══════════════════════════════════════════════════════════
// ZEGO TOKEN
// ══════════════════════════════════════════════════════════
exports.getZegoToken = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { appId: parseInt(process.env.ZEGO_APP_ID || '0'), userId: req.user._id.toString(), userName: req.user.name, roomId: req.body.roomId } });
});
