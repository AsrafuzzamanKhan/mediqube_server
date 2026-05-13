const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ─── User ─────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true, minlength: 6 },
  role:      { type: String, enum: ['admin','doctor','patient'], default: 'patient' },
  phone:     { type: String, default: '' },
  avatar:    { type: String, default: '' },
  isActive:              { type: Boolean, default: true },
  isVerified:            { type: Boolean, default: true },
  verificationToken:     String,
  verificationTokenExpire: Date,
  resetPasswordToken:    String,
  resetPasswordExpire:   Date,
  lastLogin: Date,
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.matchPassword = function(p) { return bcrypt.compare(p, this.password); };
userSchema.methods.toJSON = function() { const o = this.toObject(); delete o.password; return o; };

// ─── Doctor Profile ───────────────────────────────────────
const slotSchema = new mongoose.Schema({
  day:       String,
  startTime: String,
  endTime:   String,
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  user:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialties:      [String],
  qualifications:   [String],
  experience:       { type: Number, default: 0 },
  bio:              { type: String, default: '' },
  consultationFee:  { type: Number, default: 0 },
  videoFee:         { type: Number, default: 0 },
  clinicAddress:    { street: String, suburb: String, state: String, postcode: String },
  availableSlots:   [slotSchema],
  rating:           { type: Number, default: 5.0, min: 0, max: 5 },
  isApproved:       { type: Boolean, default: false },
  providerNumber:   { type: String, default: '' },
}, { timestamps: true });

// ─── Patient Profile ──────────────────────────────────────
const patientSchema = new mongoose.Schema({
  user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  dateOfBirth:       Date,
  gender:            { type: String, enum: ['male','female','other','prefer-not-to-say'], default: 'prefer-not-to-say' },
  medicareNumber:    { type: String, default: '' },
  bloodType:         { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'], default: 'unknown' },
  allergies:         [String],
  chronicConditions: [String],
  address:           { street: String, suburb: String, state: String, postcode: String },
  emergencyContact:  { name: String, phone: String, relationship: String },
}, { timestamps: true });

// ─── Appointment ──────────────────────────────────────────
const medSchema = new mongoose.Schema({ name:String, dosage:String, frequency:String, duration:String }, { _id:false });

const appointmentSchema = new mongoose.Schema({
  patient:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctor:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentDate: { type: Date, required: true },
  appointmentTime: { type: String, required: true },
  type:            { type: String, enum: ['video','in-person'], required: true },
  status:          { type: String, enum: ['pending','approved','rejected','completed','cancelled'], default: 'pending' },
  symptoms:        String,
  notes:           String,
  rejectionReason: String,
  fee:             { type: Number, default: 0 },
  videoRoomId:     String,
  prescription: {
    medications:  [medSchema],
    instructions: String,
    notes:        String,
    issuedAt:     Date,
  },
  emailSent:       { type: Boolean, default: false },
  reminderSent:    { type: Boolean, default: false },
  completedAt:     Date,
}, { timestamps: true });

// ─── Notification ─────────────────────────────────────────
const notifSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:      { type: String, required: true },
  title:     { type: String, required: true },
  message:   { type: String, required: true },
  isRead:    { type: Boolean, default: false },
  data:      mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// ─── FAQ ──────────────────────────────────────────────────
const faqSchema = new mongoose.Schema({
  category:           { type: String, required: true },
  disease:            String,
  question:           { type: String, required: true },
  answer:             { type: String, required: true },
  symptoms:           [String],
  relatedSpecialties: [String],
  tags:               [String],
  isPublished:        { type: Boolean, default: true },
  views:              { type: Number, default: 0 },
  createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// ─── Support ──────────────────────────────────────────────
const supportSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject:    { type: String, required: true },
  message:    { type: String, required: true },
  category:   { type: String, enum: ['technical','billing','appointment','account','other'], default: 'other' },
  priority:   { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },
  status:     { type: String, enum: ['open','in-progress','resolved','closed'], default: 'open' },
  replies:    [{ sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, message: String, createdAt: { type: Date, default: Date.now } }],
  resolvedAt: Date,
}, { timestamps: true });

module.exports = {
  User:         mongoose.model('User',        userSchema),
  Doctor:       mongoose.model('Doctor',      doctorSchema),
  Patient:      mongoose.model('Patient',     patientSchema),
  Appointment:  mongoose.model('Appointment', appointmentSchema),
  Notification: mongoose.model('Notification',notifSchema),
  FAQ:          mongoose.model('FAQ',         faqSchema),
  Support:      mongoose.model('Support',     supportSchema),
};
