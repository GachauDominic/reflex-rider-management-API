import nodemailer from "nodemailer"

export const sendMail = async (
  email: string,
  subject: string,
  message: string,
  html: string
) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", //Gmail SMTP server
      port: 465, //SMTP port for Gmail
      service: "gmail",
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_MAILER_PASS
      }
    })

    const mailOptions : nodemailer.SendMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: message,
      html: html
    }

    const mailRes = await transporter.sendMail(mailOptions);
    console.log("MailRes", mailRes);

    if (mailRes.accepted.length > 0) {
      return "Email sent successfully"
    } else if (mailRes.rejected.length > 0) {
      return "Email was not sent!"
    } else {
      return "Email server error!"
    }
  } catch (error: any) {
    return JSON.stringify(error.message, null, 500)
  }
}