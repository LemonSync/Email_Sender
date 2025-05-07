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

// Rate Limiter (15 requests per 15 menit)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

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
    
    const { to, subject, message, template } = req.body;

   const htmlTemplate = {
  default: `<div style="padding: 20px; font-family: 'Helvetica Neue', sans-serif; background: #BED8C1; border-left: 4px solid #4caf50; border-radius: 5px;">
  <h3 style="color: #375F3B;">${subject}</h3>
  <p style="color: #4B6B4E; line-height: 1.6;">${message}</p>
  <br>
  <p style="font-size: 12px; color: #355633;">Sent from <a href="https://lemon-email.vercel.app" style="text-decoration: none; color: #12901C;">Lemon Email Sender Web</a></p>
</div>`,
  dark: `<div style="background: #1e1e1e; color: #f0f0f0; padding: 20px; border-radius: 8px; font-family: monospace;">
        <h2 style="color: #4caf50;">${subject}</h2>
        <pre style="white-space: pre-wrap; line-height: 1.5; color: #ccc;">${message}</pre>
        <hr style="border-color: #333;">
        <p style="font-size: 12px; color: #666;">Powered by <a href="https://lemon-email.vercel.app" style="text-decoration: none; color: rgb(255, 255, 255);">Lemon Email Sender</a></p>
</div>`,
  struck: `<div style="background-color: #fffbe6; padding: 25px; border-radius: 10px; font-family: Verdana, sans-serif;">
  <h2 style="color: #d35400;">${subject}</h2>
  <p style="color: #444; font-size: 15px;">
    ${message}
  </p>
  <div style="margin-top: 20px;">
    <a href="https://lemon-email.vercel.app" style="background-color: #d35400; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
      Learn More
    </a>
  </div>
</div>`
   }
    
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
  
    
    const mailOptions = {
      from: `"Lemon Email Sender" <${process.env.EMAIL_USER}>`,
      to,
      subject: `[Secure] ${subject}`,
      html: htmlTemplate[template],
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
