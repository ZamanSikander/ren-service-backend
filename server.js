require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(helmet());

// Rate limiter to prevent spam
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/send-email', emailLimiter);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // upgrade later with STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Send email route
app.post(
  '/send-email',
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('address').trim().notEmpty().withMessage('Address is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('zipCode').trim().notEmpty().withMessage('Zip code is required'),
    body('message').trim().notEmpty().withMessage('Message is required')
  ],
  (req, res) => {
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
      to = process.env.EMAIL_TO
    } = req.body;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text: `
You have received a new contact request from the website:

Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone}
Address: ${address}
City: ${city}
Zip Code: ${zipCode}

Message:
${message}
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email send error:', error);
        return res.status(500).json({ error: 'Failed to send email' });
      }
      res.status(200).json({ message: 'Email sent successfully' });
    });
  }
);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
