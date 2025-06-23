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
  </div>`,

  notificationBox: `<div style="max-width:600px;margin:auto;padding:20px;background:#fff;border-left:6px solid #007BFF;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);font-family:'Segoe UI',sans-serif;">
    <h2 style="color:#007BFF;">🔔 ${subject}</h2>
    <p style="font-size:16px;color:#333;">${message}</p>
    <div style="margin-top:20px;font-size:13px;color:#888;">
      Sent using <a href="https://lemon-email.vercel.app" style="color:#007BFF;text-decoration:none;">Lemon Email Sender</a>
    </div>
  </div>`,

  juiceBox: `<div style="background:#ffeaa7;padding:25px;border-radius:12px;border:2px dashed #fdcb6e;font-family:'Comic Sans MS',cursive;">
    <h2 style="color:#d63031;margin-top:0;">${subject}</h2>
    <p style="font-size:15px;color:#2d3436;">${message}</p>
    <p style="margin-top:20px;font-size:13px;color:#6c5ce7;">
      Sent via <a href="https://lemon-email.vercel.app" style="color:#00b894;text-decoration:none;"><b>Lemon Email Sender</b></a>
    </p>
  </div>`,

  corporateClean: `<div style="background:#f4f6f8;padding:30px;border-radius:6px;font-family:'Arial',sans-serif;">
    <table style="width:100%;max-width:600px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px;">
      <tr>
        <td>
          <h2 style="color:#34495e;">${subject}</h2>
          <p style="font-size:16px;color:#2c3e50;line-height:1.6;">${message}</p>
          <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
          <p style="font-size:13px;color:#999;text-align:right;">Sent with <a href="https://lemon-email.vercel.app" style="color:#3498db;text-decoration:none;">Lemon Email Sender</a></p>
        </td>
      </tr>
    </table>
  </div>`,

  artsyBorder: `<div style="padding:20px;border:4px double #6c5ce7;background:#fdf0ff;border-radius:10px;font-family:'Trebuchet MS',sans-serif;">
    <h2 style="color:#6c5ce7;">${subject}</h2>
    <p style="color:#2d3436;font-size:16px;line-height:1.6;">${message}</p>
    <p style="font-size:12px;color:#a29bfe;margin-top:20px;">Generated with 💛 by <a href="https://lemon-email.vercel.app" style="color:#6c5ce7;text-decoration:underline;">Lemon Email Sender</a></p>
  </div>`,

  receiptStyle: `<div style="font-family:'Courier New',monospace;background:#fff;padding:20px;border:1px dashed #333;max-width:500px;margin:auto;">
    <h2 style="border-bottom:1px dashed #000;padding-bottom:5px;">🧾 ${subject}</h2>
    <pre style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${message}</pre>
    <hr style="border:none;border-top:1px dashed #000;margin:20px 0;">
    <p style="font-size:12px;text-align:center;color:#555;">Printed by <a href="https://lemon-email.vercel.app" style="color:#222;text-decoration:none;">Lemon Email Sender</a></p>
  </div>`,

  magazineClassic: `<div style="background:#ffffff;max-width:600px;margin:20px auto;font-family:Georgia,serif;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
    <div style="padding:20px;">
      <h2 style="margin-top:0;color:#333;font-family:'Times New Roman',serif;">${subject}</h2>
      <p style="font-size:16px;line-height:1.6;color:#555;">${message}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <p style="font-size:13px;color:#999;text-align:right;">Powered by <a href="https://lemon-email.vercel.app" style="color:#999;text-decoration:none;">Lemon Email Sender</a></p>
    </div>
  </div>`,

  luxuryPromo: `<div style="background:#fafafa;max-width:600px;margin:20px auto;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.1);font-family:'Helvetica Neue',sans-serif;">
    <div style="padding:30px;text-align:center;">
      <h2 style="margin:0;color:#222;font-size:24px;">${subject}</h2>
      <p style="margin:20px 0;font-size:16px;color:#555;line-height:1.6;">${message}</p>
    </div>
    <div style="padding:15px 30px;background:#f0f0f0;border-bottom-left-radius:10px;border-bottom-right-radius:10px;">
      <p style="font-size:12px;color:#888;margin:0;">Exclusive email via <a href="https://lemon-email.vercel.app" style="color:#888;text-decoration:underline;">Lemon Email Sender</a></p>
    </div>
  </div>`,

  minimalMono: `<div style="max-width:550px;margin:30px auto;padding:25px;font-family:'Arial',sans-serif;border:1px solid #ddd;border-radius:6px;background:#fff;">
    <h2 style="font-weight:normal;color:#222;margin-top:0;">${subject}</h2>
    <p style="color:#444;font-size:15px;line-height:1.7;">${message}</p>
    <div style="margin-top:30px;font-size:12px;color:#aaa;text-align:center;">
      Sent using <a href="https://lemon-email.vercel.app" style="color:#aaa;text-decoration:none;">Lemon Email Sender</a>
    </div>
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
