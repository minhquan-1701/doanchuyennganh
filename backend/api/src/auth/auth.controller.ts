import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterWithOtpDto } from './dto/register-with-otp.dto';
import { LoginDto } from './dto/login.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserEntity } from '../users/users.service';
import { OtpService } from '../otp/otp.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) { }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register-with-otp')
  async registerWithOtp(@Body() dto: RegisterWithOtpDto) {
    // Verify OTP first
    await this.otpService.verifyOtp(dto.phoneNumber, dto.otp);

    // If OTP is valid, proceed with registration
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('verify-2fa')
  verify2FA(@Body() dto: Verify2faDto) {
    return this.authService.verify2FA(dto.usernameOrEmail, dto.token, dto.sessionToken);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Get('reset-password')
  resetPasswordRedirect(@Query('token') token: string, @Res() res: any) {
    // Validate token exists
    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Lỗi - Token không hợp lệ</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .error { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h1 { color: #e74c3c; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>❌ Token không hợp lệ</h1>
            <p>Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Redirect to deep link
    const deepLink = `alexcinema://reset-password?token=${encodeURIComponent(token)}`;
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="0;url=${deepLink}">
        <title>Đang mở ứng dụng...</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .container { background: rgba(255,255,255,0.95); color: #333; padding: 40px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-width: 400px; margin: 0 auto; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #6C63FF; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          h1 { margin-bottom: 10px; color: #6C63FF; }
          p { color: #666; line-height: 1.6; }
          .fallback { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
          a { color: #6C63FF; text-decoration: none; font-weight: bold; }
          a:hover { text-decoration: underline; }
        </style>
        <script>
          // Fallback: if deep link doesn't work after 3 seconds, show manual instructions
          setTimeout(function() {
            document.getElementById('fallback').style.display = 'block';
          }, 3000);
          
          // Try to open deep link
          window.location.href = '${deepLink}';
        </script>
      </head>
      <body>
        <div class="container">
          <h1>🔐 Đặt lại mật khẩu</h1>
          <div class="spinner"></div>
          <p>Đang mở ứng dụng Alex Cinema...</p>
          
          <div id="fallback" style="display: none;" class="fallback">
            <p><strong>Ứng dụng chưa mở?</strong></p>
            <p>Nếu ứng dụng không tự động mở, vui lòng:</p>
            <ol style="text-align: left; padding-left: 20px;">
              <li>Mở ứng dụng Alex Cinema</li>
              <li>Vào màn hình Đặt lại mật khẩu</li>
              <li>Nhập mã token từ email</li>
            </ol>
            <p style="margin-top: 15px;">
              <a href="${deepLink}">Thử lại</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: { user: UserEntity }) {
    return req.user;
  }
}
