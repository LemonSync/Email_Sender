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

// ==================== GLOBAL RATE LIMIT (15 req/menit total) ====================
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global',
  message: 'Server sedang sibuk. Coba lagi setelah 1 menit.'
});
app.use(globalLimiter);

// ==================== SLOW DOWN PER IP (opsional) ====================
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: (hits) => hits * 200
});

const validateEmail = [
  body('to').isEmail().normalizeEmail(),
  body('subject').trim().isLength({ max: 100 }).escape(),
  body('message').trim().isLength({ max: 2000 }).escape()
];

const requestCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

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
app.post('/send-email', speedLimiter, validateEmail, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to, subject, message, template } = req.body;

    const htmlTemplate = {
      default: `<div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #2c3e50;">${subject}</h2>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">
        ${message}
      </p>
      <hr style="margin: 20px 0;">
      <p style="font-size: 14px; color: #999;">This message was sent via <b><a href="https://lemon-email.vercel.app" style="text-decoration: none; color: green;">Lemon Email Sender</a></b></p>
    </div>`,
      dark: `<div style="background: #1e1e1e; color: #f0f0f0; padding: 20px; border-radius: 8px; font-family: monospace;">
            <h2 style="color: #4caf50;">${subject}</h2>
            <pre style="white-space: pre-wrap; line-height: 1.5; color: #ccc;">${message}</pre>
            <hr style="border-color: #333;">
            <p style="font-size: 12px; color: #666;">Powered by <b><a href="https://lemon-email.vercel.app" style="text-decoration: none; color: #666;">Lemon Email Sender</a></b></p>
    </div>`,
      struck: `<div style="padding:20px;border:1px dashed #222;font-size:15px">
              <tt>Hi <b>${to}</b>
              <br><br>
              <p>${message}</p>
              <br>
                <hr style="border:0px; border-top:1px dashed #222">
                 <p>Send with <b><a href="https://lemon-email.vercel.app" style="text-decoration: none;">Lemon Email Sender</a></b></p>
              </tt>
      </div>`
    };

    const requestKey = `${to}-${subject}-${message.substring(0, 50)}`;
    if (requestCache.has(requestKey)) {
      return res.status(429).json({
        message: 'Similar email was recently sent. Please wait before sending again.'
      });
    }
    requestCache.set(requestKey, Date.now());

    const blockedDomains = ['example.com', 'test.com'];
    const recipientDomain = to.split('@')[1];
    if (blockedDomains.includes(recipientDomain)) {
      return res.status(400).json({ message: 'This email domain is not allowed' });
    }

    const mailOptions = {
      from: `"Lemon Email Sender" <${process.env.EMAIL_USER}>`,
      to,
      subject: `[Secure] ${subject}`,
      html: htmlTemplate[template],
      priority: 'low'
    };

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

setInterval(() => {
  const now = Date.now();
  requestCache.forEach((timestamp, key) => {
    if (now - timestamp > CACHE_TTL) {
      requestCache.delete(key);
    }
  });
}, CACHE_TTL);
