const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post('/send-email', async (req, res) => {
    const { to, subject, message } = req.body;

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
        from: `"Your Website" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: "Email berhasil dikirim!" });
    } catch (error) {
        res.status(500).json({ message: "Gagal mengirim email", error });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server berjalan di port ${PORT}`));
