const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const slowDown = require('express-slow-down');
require('dotenv').config();

const app = express();

// ==================== SECURITY MIDDLEWARES ====================
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Rate Limiter (15 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Speed Limiter (slows down after 5 requests)
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: (hits) => hits * 200
});

// Email Validation
const validateEmail = [
  body('to').isEmail().normalizeEmail(),
  body('subject').trim().isLength({ max: 100 }).escape(),
  body('message').trim().isLength({ max: 2000 }).escape()
];

// Request Cache (prevents duplicate submissions)
const requestCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ==================== EMAIL TRANSPORTER ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 1,
  maxMessages: 10,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ==================== EMAIL ENDPOINT ====================
app.post('/send-email', limiter, speedLimiter, validateEmail, async (req, res) => {
  try {
    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to, subject, message } = req.body;

    // Check for duplicate requests
    const requestKey = `${to}-${subject}-${message.substring(0, 50)}`;
    if (requestCache.has(requestKey)) {
      return res.status(429).json({ 
        message: 'Similar email was recently sent. Please wait before sending again.' 
      });
    }
    requestCache.set(requestKey, Date.now());

    // Block certain domains (add your own)
    const blockedDomains = ['example.com', 'test.com'];
    const recipientDomain = to.split('@')[1];
    if (blockedDomains.includes(recipientDomain)) {
      return res.status(400).json({ message: 'This email domain is not allowed' });
    }

    // PRESERVING YOUR ORIGINAL EMAIL TEMPLATE
    const htmlContent = `
      <div style="
          font-family: 'Arial', sans-serif; 
          max-width: 600px; 
          margin: auto; 
          padding: 25px; 
          border-radius: 10px; 
          background-color: #121212; 
          color: #ffffff;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
      ">
          <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #4caf50; font-size: 24px; margin: 0;">
                  📩 ${subject}
              </h2>
              <p style="color: #aaaaaa; font-size: 14px; margin-top: 5px;">
                  You've got a new message!
              </p>
          </div>

          <div style="
              background-color: #1e1e1e; 
              padding: 20px; 
              border-radius: 8px;
              border-left: 5px solid #4caf50;
          ">
              <p style="font-size: 16px; line-height: 1.6; color: #ffffff; text-align: justify;">
                  ${message}
              </p>
          </div>

          <p style="text-align: center; font-size: 14px; color: #888; margin-top: 20px;">
              Sent from <b>Lemon Email Sender</b>
          </p>

          <div style="text-align: center; margin-top: 20px;">
              <a href="https://lemon-email.vercel.app" style="
                  background-color: #4caf50; 
                  color: #ffffff; 
                  text-decoration: none; 
                  padding: 10px 20px; 
                  border-radius: 5px; 
                  font-size: 14px;
              ">Visit Website</a>
          </div>
      </div>
    `;

    const mailOptions = {
      from: `"Lemon Secure" <${process.env.EMAIL_USER}>`,
      to,
      subject: `[Secure] ${subject}`,
      html: htmlContent,
      priority: 'low'
    };

    // Send email with timeout
    const sendMailPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Email sending timeout')), 10000)
    );

    await Promise.race([sendMailPromise, timeoutPromise]);
    
    res.json({ message: "Email sent successfully!" });

  } catch (error) {
    console.error('Email error:', error.message);
    
    if (error.message.includes('timeout')) {
      res.status(504).json({ message: "Email sending taking too long" });
    } else if (error.code === 'ECONNECTION') {
      res.status(503).json({ message: "Email service unavailable" });
    } else {
      res.status(500).json({ message: "Failed to send email" });
    }
  }
});

// ==================== SERVER SETUP ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ Secure server running on port ${PORT}`));

// Clear cache periodically
setInterval(() => {
  const now = Date.now();
  requestCache.forEach((timestamp, key) => {
    if (now - timestamp > CACHE_TTL) {
      requestCache.delete(key);
    }
  });
}, CACHE_TTL);
