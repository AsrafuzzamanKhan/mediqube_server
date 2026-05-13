require('dotenv').config();
const mongoose = require('mongoose');
const { User, Doctor, Patient, FAQ } = require('../models');

const DOCTORS = [
  { name:'Dr. Sarah Mitchell',  email:'sarah.mitchell@gpclinic.com.au',  specialties:['General Practitioner','Family Medicine'], exp:12, fee:80,  vfee:60,  bio:'Experienced GP focusing on family health and preventive care. Bulk billing available.', quals:['MBBS (University of Melbourne)','FRACGP'], rating:4.8 },
  { name:'Dr. James Chen',      email:'james.chen@gpclinic.com.au',      specialties:['Cardiologist','Internal Medicine'],        exp:18, fee:180, vfee:150, bio:'Specialist cardiologist. Heart disease prevention and cardiac imaging expert.', quals:['MBBS (UNSW)','FRACP','PhD Cardiology'], rating:4.9 },
  { name:'Dr. Emily Watson',    email:'emily.watson@gpclinic.com.au',    specialties:['Pediatrician','Child Health'],             exp:10, fee:120, vfee:100, bio:'Dedicated pediatrician. Newborns to adolescents. Developmental health specialist.', quals:['MBBS (UQ)','FRACP Pediatrics'], rating:4.7 },
  { name:'Dr. Michael Torres',  email:'michael.torres@gpclinic.com.au',  specialties:['Dermatologist','Skin Cancer'],            exp:14, fee:160, vfee:130, bio:'Expert dermatologist. Skin cancer detection and cosmetic dermatology.', quals:['MBBS (Monash)','FACD'], rating:4.6 },
  { name:'Dr. Priya Sharma',    email:'priya.sharma@gpclinic.com.au',    specialties:['Psychiatrist','Mental Health'],           exp:9,  fee:200, vfee:180, bio:'Compassionate psychiatrist. Anxiety, depression, PTSD, and mood disorders.', quals:['MBBS (Adelaide)','FRANZCP'], rating:4.9 },
  { name:'Dr. Robert Kim',      email:'robert.kim@gpclinic.com.au',      specialties:['Orthopedic','Sports Medicine'],           exp:16, fee:170, vfee:140, bio:'Orthopedic surgeon. Sports injuries and joint replacement specialist.', quals:['MBBS (Sydney)','FRACS Orthopaedics'], rating:4.7 },
  { name:'Dr. Lisa Nguyen',     email:'lisa.nguyen@gpclinic.com.au',     specialties:['Neurologist','Headache Specialist'],      exp:13, fee:190, vfee:160, bio:'Expert neurologist specialising in headaches, migraines, and neurological conditions.', quals:['MBBS (Melbourne)','FRACP Neurology'], rating:4.8 },
  { name:'Dr. Ahmed Hassan',    email:'ahmed.hassan@gpclinic.com.au',    specialties:['Gastroenterologist'],                     exp:11, fee:175, vfee:145, bio:'Gastroenterologist specialising in digestive disorders, IBD, and liver disease.', quals:['MBBS (Monash)','FRACP Gastro'], rating:4.6 },
];

const FAQS = [
  { category:'Heart', disease:'Hypertension', question:'What are symptoms of high blood pressure?', answer:'High blood pressure often has no symptoms — it\'s called the "silent killer". When they occur: severe headache, shortness of breath, nosebleeds, dizziness, chest pain. Regular monitoring is essential. A GP can check yours in minutes.', symptoms:['headache','dizziness','chest pain','shortness of breath'], relatedSpecialties:['Cardiologist','General Practitioner'] },
  { category:'Respiratory', disease:'Asthma', question:'How do I manage asthma triggers?', answer:'Common triggers: allergens, infections, exercise, cold air, smoke. Management: use a preventer inhaler daily, keep a reliever (blue puffer) handy, and follow an asthma action plan from your GP. Bulk-billing GPs can help set this up.', symptoms:['wheezing','coughing','shortness of breath','chest tightness'], relatedSpecialties:['Pulmonologist','General Practitioner'] },
  { category:'Mental Health', disease:'Anxiety', question:'How do I know if I need help for anxiety?', answer:'If worry interferes with daily life for 6+ months, you may have an anxiety disorder. Signs: constant worry, racing heart, sweating, sleep problems. Your GP can issue a Mental Health Treatment Plan (MHTP) for up to 10 Medicare-subsidised psychology sessions per year.', symptoms:['worry','racing heart','sleep problems','avoidance'], relatedSpecialties:['Psychiatrist','General Practitioner'] },
  { category:'Skin', disease:'Skin Cancer', question:'How do I check for skin cancer in Australia?', answer:'Australia has one of the world\'s highest skin cancer rates. Use the ABCDE rule: Asymmetry, Border irregularity, multiple Colours, Diameter >6mm, Evolving. See a dermatologist for any changing spots. Annual full-body skin checks recommended for all Australians.', symptoms:['new spot','changing mole','irregular border'], relatedSpecialties:['Dermatologist'] },
  { category:'Diabetes', disease:'Type 2 Diabetes', question:'What are warning signs of Type 2 diabetes?', answer:'Increased thirst, frequent urination, fatigue, blurred vision, slow-healing cuts, tingling in hands/feet. A fasting blood glucose test from your GP can confirm. Risk factors: obesity, inactivity, family history.', symptoms:['thirst','frequent urination','fatigue','blurred vision'], relatedSpecialties:['Endocrinologist','General Practitioner'] },
  { category:"Children's Health", disease:'Fever', question:'When should my child see a doctor for fever?', answer:'Go immediately if: baby under 3 months has temp >38°C, child has temp >40°C, fever lasts >48 hours, child has difficulty breathing, rash that doesn\'t fade when pressed, or febrile seizure. For mild fever: paracetamol (Panadol) in weight-appropriate dose.', symptoms:['high temperature','shivering','headache'], relatedSpecialties:['Pediatrician','General Practitioner'] },
  { category:'Bone & Joint', disease:'Arthritis', question:'What is the difference between osteoarthritis and rheumatoid arthritis?', answer:'Osteoarthritis: wear-and-tear of cartilage, common in older adults, weight-bearing joints. Rheumatoid arthritis: autoimmune, any age, symmetric joints, morning stiffness, systemic symptoms. Blood tests (RF, anti-CCP) and imaging help distinguish them.', symptoms:['joint pain','stiffness','swelling'], relatedSpecialties:['Rheumatologist','Orthopedic'] },
  { category:'General', disease:'COVID-19', question:'What are current COVID-19 guidelines in Australia?', answer:'Stay home if symptomatic, take a RAT test. Wear a mask in healthcare settings. Notify close contacts if positive. Call 000 for difficulty breathing or chest pain. For mild cases: rest, hydrate, paracetamol for fever.', symptoms:['fever','cough','sore throat','fatigue'], relatedSpecialties:['General Practitioner'] },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mediqube');
  await Promise.all([User.deleteMany({}), Doctor.deleteMany({}), Patient.deleteMany({}), FAQ.deleteMany({})]);

  const admin = await User.create({ name:'Admin User', email:'admin@mediqube.com.au', password:'Admin@1234', role:'admin', isActive:true, isVerified:true });

  for (const d of DOCTORS) {
    const u = await User.create({ name:d.name, email:d.email, password:'Doctor@1234', role:'doctor', isActive:true, isVerified:true });
    await Doctor.create({
      user:u._id, specialties:d.specialties, experience:d.exp,
      consultationFee:d.fee, videoFee:d.vfee, bio:d.bio,
      qualifications:d.quals, rating:d.rating, isApproved:true,
      availableSlots:[
        {day:'Monday',startTime:'09:00',endTime:'17:00'},{day:'Tuesday',startTime:'09:00',endTime:'17:00'},
        {day:'Wednesday',startTime:'09:00',endTime:'17:00'},{day:'Thursday',startTime:'09:00',endTime:'17:00'},
        {day:'Friday',startTime:'09:00',endTime:'15:00'},
      ],
      clinicAddress:{street:'123 Collins Street',suburb:'Melbourne',state:'VIC',postcode:'3000'},
    });
  }

  const pu = await User.create({ name:'John Smith', email:'patient@mediqube.com.au', password:'Patient@1234', role:'patient', isActive:true, isVerified:true, phone:'0412 345 678' });
  await Patient.create({ user:pu._id, gender:'male', dateOfBirth:new Date('1990-05-15'), medicareNumber:'2123 45670 1', bloodType:'O+', allergies:['Penicillin'], address:{street:'45 Bourke St',suburb:'Melbourne',state:'VIC',postcode:'3000'} });

  for (const f of FAQS) await FAQ.create({ ...f, isPublished:true, createdBy:admin._id });

  console.log('\n✅ Database seeded!\n');
  console.log('┌────────────┬────────────────────────────────────┬──────────────┐');
  console.log('│ Role       │ Email                              │ Password     │');
  console.log('├────────────┼────────────────────────────────────┼──────────────┤');
  console.log('│ Admin      │ admin@mediqube.com.au              │ Admin@1234   │');
  console.log('│ Doctor     │ sarah.mitchell@gpclinic.com.au     │ Doctor@1234  │');
  console.log('│ Patient    │ patient@mediqube.com.au            │ Patient@1234 │');
  console.log('└────────────┴────────────────────────────────────┴──────────────┘\n');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
