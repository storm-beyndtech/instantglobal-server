import nodemailer from 'nodemailer';

let _transporter: any = null;
let _verified = false;

// Lazy initialization - create transporter only when first accessed
export const getTransporter = () => {
  if (!_transporter) {
    const smtpUser = process.env.EMAIL_USER || process.env.SMTP_USER;
    const smtpPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
      port: parseInt(process.env.EMAIL_PORT || '465'),
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: smtpUser, // support@instantglobal.com
        pass: smtpPass, // hostinger email password
      },
    });

    // Verify transporter configuration only once
    if (!_verified) {
      _verified = true;
      _transporter.verify((error: any, success: any) => {
        if (error) {
          console.error('Email transporter verification failed:', error);
        } else {
          console.log('Email server is ready to send messages');
        }
      });
    }
  }
  return _transporter;
};

// For backward compatibility
export const transporter = {
  sendMail: (...args: any[]) => getTransporter().sendMail(...args),
  verify: (...args: any[]) => getTransporter().verify(...args),
};

