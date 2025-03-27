const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Melayani file statis dari folder "public"

// Cek apakah variabel environment terbaca
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "****" : "MISSING");

// Konfigurasi transporter Nodemailer
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true untuk port 465, false untuk port 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Endpoint untuk mengirim email
app.post('/send-email', async (req, res) => {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
        return res.status(400).json({ message: "Semua field harus diisi!" });
    }

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
        console.error("Error saat mengirim email:", error);
        res.status(500).json({ message: 'Gagal mengirim email', error: error.message });
    }
});

// Menangani semua request yang tidak cocok dengan API
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
