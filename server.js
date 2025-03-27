const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Melayani file statis dari "public/"

// Endpoint kirim email
app.post('/send-email', async (req, res) => {
    const { to, subject, message } = req.body;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            text: message
        });

        res.json({ message: 'Email berhasil dikirim!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mengirim email' });
    }
});

// Menangani semua request yang tidak cocok dengan API
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
