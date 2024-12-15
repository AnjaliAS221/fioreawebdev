// services/notificationService.js
const nodemailer = require('nodemailer');
const twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

class NotificationService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async sendOrderStatusEmail(order, user) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Order ${order.orderId} Status Update`,
        html: `
          <h1>Order Status Update</h1>
          <p>Your order ${order.orderId} is now ${order.status}</p>
        `
      });
    } catch (error) {
      console.error('Email notification error:', error);
    }
  }

  async sendSMSNotification(order, user) {
    try {
      await twilioClient.messages.create({
        body: `Your order ${order.orderId} is now ${order.status}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phoneNumber
      });
    } catch (error) {
      console.error('SMS notification error:', error);
    }
  }
}

module.exports = new NotificationService();