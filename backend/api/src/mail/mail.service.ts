import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as qrcode from 'qrcode';

interface PasswordResetPayload {
  to: string;
  username: string;
  token: string;
  expiresInMinutes: number;
}

interface BookingTicketPayload {
  to: string;
  bookingCode: string;
  movieTitle: string;
  cinemaName?: string | null;
  screenName?: string | null;
  showtimeStart: string;
  seats: string[];
  amount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  bookingDate?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = Number(this.configService.get<string>('MAIL_PORT') ?? '587');
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASSWORD');
    const secure =
      (
        this.configService.get<string>('MAIL_SECURE') ?? 'false'
      ).toLowerCase() === 'true';

    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ??
      (user ? `${user}` : 'no-reply@example.com');
    this.appUrl =
      this.configService.get<string>('API_URL') ?? 'http://localhost:3000';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });

      this.logger.log(`📧 Mail service initialized with host: ${host}, port: ${port}, secure: ${secure}`);
    } else {
      this.logger.warn(
        '⚠️ Mail transport is not fully configured. Email sending will fail until MAIL_HOST, MAIL_USER and MAIL_PASSWORD are provided.',
      );
    }
  }

  private ensureTransporter() {
    if (!this.transporter) {
      this.logger.error('❌ Mail service is not configured');
      throw new InternalServerErrorException(
        'Mail service is not configured yet',
      );
    }
  }

  async sendBookingTicketEmail(payload: BookingTicketPayload) {
    this.logger.log(`📨 Attempting to send booking ticket email to: ${payload.to}`);
    this.ensureTransporter();

    try {
      const subject = `Xác nhận đặt vé #${payload.bookingCode}`;
      const seats = payload.seats.length === 0 ? '—' : payload.seats.join(', ');
      const amountText = payload.amount.toLocaleString('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
      });

      this.logger.debug(`🎫 Generating QR code for booking: ${payload.bookingCode}`);

      // Generate QR code with booking information
      const qrData = JSON.stringify({
        bookingCode: payload.bookingCode,
        movieTitle: payload.movieTitle,
        cinemaName: payload.cinemaName,
        screenName: payload.screenName,
        showtimeStart: payload.showtimeStart,
        seats: payload.seats,
        amount: payload.amount,
      });

      // Generate QR code as buffer instead of base64 for better email compatibility
      const qrCodeBuffer = await qrcode.toBuffer(qrData, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 2,
        type: 'png',
      });

      this.logger.debug(`✅ QR code generated successfully (${qrCodeBuffer.length} bytes)`);

      const text = [
        'Cảm ơn bạn đã đặt vé tại Alex Cinema.',
        `Mã đặt chỗ: ${payload.bookingCode}`,
        `Phim: ${payload.movieTitle}`,
        `Rạp: ${payload.cinemaName ?? 'N/A'}`,
        `Phòng chiếu: ${payload.screenName ?? 'N/A'}`,
        `Suất chiếu: ${payload.showtimeStart}`,
        `Ghế: ${seats}`,
        `Số tiền: ${amountText}`,
        `Phương thức thanh toán: ${payload.paymentMethod ?? 'ZaloPay'}`,
        `Trạng thái thanh toán: ${payload.paymentStatus ?? 'success'}`,
      ].join('\n');

      const html = `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto;">
          <h2 style="color:#4F46E5; margin-bottom: 8px;">Xác nhận đặt vé</h2>
          <p style="margin:4px 0 12px;">Cảm ơn bạn đã đặt vé tại Alex Cinema.</p>
          <div style="border:1px solid #E5E7EB; border-radius:12px; padding:16px; background:#F9FAFB;">
            <p style="margin:4px 0;"><strong>Mã đặt chỗ:</strong> ${payload.bookingCode}</p>
            <p style="margin:4px 0;"><strong>Phim:</strong> ${payload.movieTitle}</p>
            <p style="margin:4px 0;"><strong>Rạp:</strong> ${payload.cinemaName ?? 'N/A'}</p>
            <p style="margin:4px 0;"><strong>Phòng chiếu:</strong> ${payload.screenName ?? 'N/A'}</p>
            <p style="margin:4px 0;"><strong>Suất chiếu:</strong> ${payload.showtimeStart}</p>
            <p style="margin:4px 0;"><strong>Ghế:</strong> ${seats}</p>
            <p style="margin:4px 0;"><strong>Số tiền:</strong> ${amountText}</p>
            <p style="margin:4px 0;"><strong>Phương thức thanh toán:</strong> ${payload.paymentMethod ?? 'ZaloPay'}</p>
            <p style="margin:4px 0;"><strong>Trạng thái thanh toán:</strong> ${payload.paymentStatus ?? 'success'}</p>
          </div>
          <div style="margin-top:24px; text-align:center;">
            <p style="margin:8px 0;"><strong>Mã QR vé của bạn:</strong></p>
            <img src="cid:qrcode" alt="QR Code" style="max-width:300px; height:auto; border:1px solid #E5E7EB; border-radius:8px; padding:8px;"/>
            <p style="margin:8px 0; font-size:12px; color:#6B7280;">Vui lòng xuất trình mã QR này tại rạp</p>
          </div>
          <p style="margin-top:16px;">Chúc bạn có trải nghiệm xem phim vui vẻ!</p>
        </div>
      `;

      this.logger.debug(`📤 Sending email from: ${this.fromAddress} to: ${payload.to}`);

      const info = await this.transporter!.sendMail({
        from: this.fromAddress,
        to: payload.to,
        subject,
        text,
        html,
        attachments: [
          {
            filename: 'qrcode.png',
            content: qrCodeBuffer,
            cid: 'qrcode', // Content-ID for embedding in HTML
          },
        ],
      });

      this.logger.log(`✅ Booking ticket email sent successfully to: ${payload.to}`);
      this.logger.debug(`📧 Message ID: ${info.messageId}`);
      this.logger.debug(`📧 Response: ${info.response}`);

      return info;
    } catch (error) {
      this.logger.error(`❌ Failed to send booking ticket email to: ${payload.to}`);
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  async sendPasswordResetEmail(payload: PasswordResetPayload) {
    this.logger.log(`📨 Attempting to send password reset email to: ${payload.to}`);
    this.ensureTransporter();

    try {
      const resetLink = this.buildResetLink(payload.token);
      const subject = 'Đặt lại mật khẩu của bạn';
      const text = [
        `Xin chào ${payload.username},`,
        '',
        'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
        `Hãy bấm vào liên kết sau (hoặc dán vào trình duyệt) để đặt lại mật khẩu: ${resetLink}`,
        '',
        `Liên kết có hiệu lực trong ${payload.expiresInMinutes} phút.`,
        '',
        'Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.',
      ].join('\n');

      const html = `
        <p>Xin chào <strong>${payload.username}</strong>,</p>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p>Vui lòng nhấn vào nút bên dưới để đặt lại mật khẩu:</p>
        <p>
          <a href="${resetLink}" style="
            display:inline-block;
            padding:12px 24px;
            border-radius:6px;
            background-color:#5B21B6;
            color:#ffffff;
            text-decoration:none;
            font-weight:600;
          ">Đặt lại mật khẩu</a>
        </p>
        <p>Nếu bạn không thể nhấp vào nút, hãy dán liên kết sau vào trình duyệt:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Liên kết này sẽ hết hạn sau ${payload.expiresInMinutes} phút.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>
      `;

      this.logger.debug(`📤 Sending password reset email from: ${this.fromAddress} to: ${payload.to}`);

      const info = await this.transporter!.sendMail({
        from: this.fromAddress,
        to: payload.to,
        subject,
        text,
        html,
      });

      this.logger.log(`✅ Password reset email sent successfully to: ${payload.to}`);
      this.logger.debug(`📧 Message ID: ${info.messageId}`);
      this.logger.debug(`📧 Response: ${info.response}`);

      return info;
    } catch (error) {
      this.logger.error(`❌ Failed to send password reset email to: ${payload.to}`);
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  async sendContactNotificationEmail(payload: {
    customerName: string;
    customerEmail: string;
    subject: string;
    message: string;
    contactId: number;
  }) {
    this.logger.log(`📨 Attempting to send contact notification email for contact #${payload.contactId}`);
    this.ensureTransporter();

    try {
      const subject = `[Alex Cinema] Yêu cầu hỗ trợ mới: ${payload.subject}`;

      const text = [
        'Bạn nhận được yêu cầu hỗ trợ mới từ khách hàng:',
        '',
        `Từ: ${payload.customerName} (${payload.customerEmail})`,
        `Tiêu đề: ${payload.subject}`,
        '',
        'Nội dung:',
        payload.message,
        '',
        `ID Liên hệ: #${payload.contactId}`,
      ].join('\n');

      const html = `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto;">
          <h2 style="color:#4F46E5; margin-bottom: 8px;">Yêu cầu hỗ trợ mới</h2>
          <p style="margin:4px 0 12px;">Bạn nhận được yêu cầu hỗ trợ mới từ khách hàng:</p>
          
          <div style="border:1px solid #E5E7EB; border-radius:12px; padding:16px; background:#F9FAFB; margin: 16px 0;">
            <p style="margin:4px 0;"><strong>Từ:</strong> ${payload.customerName}</p>
            <p style="margin:4px 0;"><strong>Email:</strong> <a href="mailto:${payload.customerEmail}">${payload.customerEmail}</a></p>
            <p style="margin:4px 0;"><strong>Tiêu đề:</strong> ${payload.subject}</p>
          </div>
          
          <div style="border:1px solid #E5E7EB; border-radius:12px; padding:16px; background:#FFFFFF; margin: 16px 0;">
            <p style="margin:0 0 8px;"><strong>Nội dung:</strong></p>
            <p style="margin:0; white-space: pre-wrap;">${payload.message}</p>
          </div>
          
          <p style="margin:16px 0 4px; font-size:12px; color:#6B7280;">
            ID Liên hệ: #${payload.contactId}
          </p>
        </div>
      `;

      this.logger.debug(`📤 Sending contact notification from: ${this.fromAddress} to: ${this.fromAddress}`);

      const info = await this.transporter!.sendMail({
        from: this.fromAddress,
        to: this.fromAddress, // Send to admin
        replyTo: payload.customerEmail, // Allow direct reply
        subject,
        text,
        html,
      });

      this.logger.log(`✅ Contact notification email sent successfully for contact #${payload.contactId}`);
      this.logger.debug(`📧 Message ID: ${info.messageId}`);

      return info;
    } catch (error) {
      this.logger.error(`❌ Failed to send contact notification email for contact #${payload.contactId}`);
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(error.stack);
      // Don't throw - we still want to save the contact even if email fails
      return null;
    }
  }

  async sendContactConfirmationEmail(payload: {
    to: string;
    name: string;
    subject: string;
  }) {
    this.logger.log(`📨 Attempting to send contact confirmation email to: ${payload.to}`);
    this.ensureTransporter();

    try {
      const subject = `Đã nhận yêu cầu hỗ trợ của bạn: ${payload.subject}`;

      const text = [
        `Xin chào ${payload.name},`,
        '',
        'Cảm ơn bạn đã liên hệ với Alex Cinema!',
        '',
        `Chúng tôi đã nhận được yêu cầu hỗ trợ của bạn về: "${payload.subject}"`,
        '',
        'Chúng tôi sẽ phản hồi bạn qua email trong vòng 24 giờ.',
        '',
        'Trân trọng,',
        'Đội ngũ hỗ trợ Alex Cinema',
      ].join('\n');

      const html = `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto;">
          <h2 style="color:#4F46E5; margin-bottom: 8px;">Đã nhận yêu cầu hỗ trợ</h2>
          <p>Xin chào <strong>${payload.name}</strong>,</p>
          <p>Cảm ơn bạn đã liên hệ với <strong>Alex Cinema</strong>!</p>
          
          <div style="border:1px solid #E5E7EB; border-radius:12px; padding:16px; background:#F9FAFB; margin: 16px 0;">
            <p style="margin:0;">
              Chúng tôi đã nhận được yêu cầu hỗ trợ của bạn về: 
              <strong>"${payload.subject}"</strong>
            </p>
          </div>
          
          <p>Chúng tôi sẽ phản hồi bạn qua email trong vòng <strong>24 giờ</strong>.</p>
          
          <p style="margin-top:24px;">
            Trân trọng,<br/>
            <strong>Đội ngũ hỗ trợ Alex Cinema</strong>
          </p>
        </div>
      `;

      const info = await this.transporter!.sendMail({
        from: this.fromAddress,
        to: payload.to,
        subject,
        text,
        html,
      });

      this.logger.log(`✅ Contact confirmation email sent successfully to: ${payload.to}`);
      this.logger.debug(`📧 Message ID: ${info.messageId}`);

      return info;
    } catch (error) {
      this.logger.error(`❌ Failed to send contact confirmation email to: ${payload.to}`);
      this.logger.error(`Error: ${error.message}`);
      // Don't throw - we still want to save the contact even if email fails
      return null;
    }
  }

  private buildResetLink(token: string): string {
    const normalizedBase = this.appUrl.endsWith('/')
      ? this.appUrl.slice(0, -1)
      : this.appUrl;
    return `${normalizedBase}/auth/reset-password?token=${token}`;
  }
}

