const axios = require('axios');
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 5173;

// Required for Vercel / proxied environments
app.set('trust proxy', 1);

// Middlewares
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000', // Set ALLOWED_ORIGIN=https://yourfrontend.com in .env
  methods: ['POST', 'GET'],
}));
app.use(bodyParser.json());
app.use(helmet());

// Rate limiter
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests from this IP, please try again later.',
  validate: {
    xForwardedForHeader: false, // Disables the X-Forwarded-For validation warning on Vercel
  },
});

app.use('/send-email', emailLimiter);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Health check (Vercel needs at least one GET route)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'Server is running' });
});

// Validation rules
const contactValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('zipCode').trim().notEmpty().withMessage('Zip code is required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters'),
  body('recaptchaToken').notEmpty().withMessage('reCAPTCHA token is required'),
];

// Send email route
app.post('/send-email', emailLimiter, contactValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    firstName,
    lastName,
    email,
    phone,
    address,
    city,
    zipCode,
    message,
    subject = 'New Contact Form Submission - REN Services',
    to = process.env.EMAIL_TO,
    recaptchaToken,
  } = req.body;

  // --- Step 1: Verify reCAPTCHA ---
  try {
    const recaptchaRes = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`,
      { method: 'POST' }
    );
    const recaptchaData = await recaptchaRes.json();

    // Log full reCAPTCHA response so you can debug in Vercel logs
    console.log('reCAPTCHA result:', JSON.stringify(recaptchaData));

    if (!recaptchaData.success) {
      return res.status(403).json({
        error: 'reCAPTCHA verification failed.',
        // Shows the exact error codes from Google (e.g. "timeout-or-duplicate", "invalid-input-secret")
        details: recaptchaData['error-codes'],
      });
    }

    // Only enforce score for reCAPTCHA v3 (v2 doesn't return a score)
    if (recaptchaData.score !== undefined && recaptchaData.score < 0.3) {
      return res.status(403).json({
        error: 'Low reCAPTCHA score. Suspected bot.',
        score: recaptchaData.score,
      });
    }
  } catch (err) {
    console.error('reCAPTCHA request error:', err.message);
    return res.status(500).json({ error: 'Could not verify reCAPTCHA. Try again.' });
  }

  // --- Step 2: Send Email ---
  try {
    await transporter.sendMail({
      from: `"REN Services" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      text: `
New contact form submission:

Name:     ${firstName} ${lastName}
Email:    ${email}
Phone:    ${phone}
Address:  ${address}, ${city}, ${zipCode}

Message:
${message}
      `.trim(),
      // Optional HTML version
      html: `
        <h2>New Contact Form Submission</h2>
        <table>
          <tr><td><strong>Name</strong></td><td>${firstName} ${lastName}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${phone}</td></tr>
          <tr><td><strong>Address</strong></td><td>${address}, ${city}, ${zipCode}</td></tr>
        </table>
        <h3>Message</h3>
        <p>${message.replace(/\n/g, '<br/>')}</p>
      `,
    });

    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (err) {
    console.error('Email send error:', err.message);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});