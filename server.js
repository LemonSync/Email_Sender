const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Melayani file statis

// Konfigurasi transporter Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Gunakan email pribadi
        pass: process.env.EMAIL_PASS  // Gunakan password aplikasi Google (App Password)
    }
});

// Endpoint untuk mengirim email
app.post('/send-email', async (req, res) => {
    const { to, subject, message } = req.body;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: message
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: 'Email berhasil dikirim!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mengirim email' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
