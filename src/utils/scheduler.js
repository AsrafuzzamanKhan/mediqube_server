const { Appointment } = require('../models');
const { videoReminderEmail } = require('./helpers');

// Parse "09:00 AM" / "02:30 PM" into hours and minutes
function parseTime(timeStr) {
  const [time, meridiem] = timeStr.trim().split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

function buildAppointmentDateTime(date, timeStr) {
  const { hours, minutes } = parseTime(timeStr);
  const dt = new Date(date);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

async function sendVideoReminders() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 4 * 60 * 1000); // 4 min from now
    const windowEnd   = new Date(now.getTime() + 6 * 60 * 1000); // 6 min from now

    const appointments = await Appointment.find({
      type: 'video',
      status: 'approved',
      reminderSent: false,
    })
      .populate('patient', 'name email')
      .populate('doctor', 'name email');

    for (const appt of appointments) {
      const apptTime = buildAppointmentDateTime(appt.appointmentDate, appt.appointmentTime);
      if (apptTime >= windowStart && apptTime < windowEnd) {
        const roomUrl = `${process.env.CLIENT_URL}/video/${appt.videoRoomId}`;
        await videoReminderEmail({
          patientEmail: appt.patient.email,
          patientName:  appt.patient.name,
          doctorEmail:  appt.doctor.email,
          doctorName:   appt.doctor.name,
          date:         appt.appointmentDate,
          time:         appt.appointmentTime,
          roomUrl,
        });
        appt.reminderSent = true;
        await appt.save();
        console.log(`⏰ Video reminder sent for appointment ${appt._id}`);
      }
    }
  } catch (err) {
    console.error('Reminder scheduler error:', err.message);
  }
}

function startScheduler() {
  // Run immediately once, then every 60 seconds
  sendVideoReminders();
  setInterval(sendVideoReminders, 60 * 1000);
  console.log('⏰ Video reminder scheduler started');
}

module.exports = { startScheduler };
