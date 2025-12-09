import 'package:flutter/material.dart';

import '../../core/di/dependency_injection.dart';
import '../../data/models/dto/auth_request_dto.dart';
import '../../domain/services/auth_service.dart';
import '../bloc/common/error_helpers.dart';
import '../widgets/buttons/btnRegisLogin.dart';
import 'login_page.dart';

class ResetPasswordPage extends StatefulWidget {
  const ResetPasswordPage({super.key, this.initialToken});

  final String? initialToken;

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _tokenController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _submitting = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void initState() {
    super.initState();
    // Pre-fill token if provided from deep link
    if (widget.initialToken != null && widget.initialToken!.isNotEmpty) {
      _tokenController.text = widget.initialToken!;
    }
  }

  @override
  void dispose() {
    _tokenController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded),
                  onPressed: () => Navigator.maybePop(context),
                ),
                const SizedBox(height: 8),
                Text(
                  'Đặt lại mật khẩu',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Nhập mã xác thực từ email và mật khẩu mới của bạn.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.black54,
                  ),
                ),
                const SizedBox(height: 32),
                TextFormField(
                  controller: _tokenController,
                  decoration: _inputDecoration(
                    context,
                    label: 'Mã xác thực',
                    hint: 'Nhập mã từ email',
                    icon: Icons.vpn_key_outlined,
                  ),
                  textInputAction: TextInputAction.next,
                  maxLines: 3,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Vui lòng nhập mã xác thực';
                    }
                    if (value.trim().length < 10) {
                      return 'Mã xác thực không hợp lệ';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  decoration: _inputDecoration(
                    context,
                    label: 'Mật khẩu mới',
                    hint: 'Nhập mật khẩu mới',
                    icon: Icons.lock_outline,
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      onPressed: () {
                        setState(() => _obscurePassword = !_obscurePassword);
                      },
                    ),
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Vui lòng nhập mật khẩu mới';
                    }
                    if (value.length < 6) {
                      return 'Mật khẩu phải có ít nhất 6 ký tự';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _confirmPasswordController,
                  obscureText: _obscureConfirmPassword,
                  decoration: _inputDecoration(
                    context,
                    label: 'Xác nhận mật khẩu',
                    hint: 'Nhập lại mật khẩu mới',
                    icon: Icons.lock_outline,
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscureConfirmPassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      onPressed: () {
                        setState(
                          () => _obscureConfirmPassword =
                              !_obscureConfirmPassword,
                        );
                      },
                    ),
                  ),
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Vui lòng xác nhận mật khẩu';
                    }
                    if (value != _passwordController.text) {
                      return 'Mật khẩu không khớp';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 28),
                RegisLoginButton(
                  label: _submitting ? 'Đang xử lý...' : 'Đặt lại mật khẩu',
                  onPressed: _submitting ? null : _submit,
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: _submitting ? null : () => _openLogin(context),
                    child: const Text('Quay lại đăng nhập'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _submitting = true);
    final authService = serviceLocator<AuthService>();
    try {
      final message = await authService.resetPassword(
        ResetPasswordRequestDto(
          token: _tokenController.text,
          newPassword: _passwordController.text,
        ),
      );
      if (!mounted) return;

      // Show success message
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 3),
        ),
      );

      // Navigate to login page after short delay
      await Future.delayed(const Duration(milliseconds: 1500));
      if (!mounted) return;

      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginPage()),
        (route) => false,
      );
    } catch (error) {
      if (!mounted) return;
      final friendly = mapErrorMessage(error);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendly), backgroundColor: Colors.red),
      );
      setState(() => _submitting = false);
    }
  }

  Future<void> _openLogin(BuildContext context) async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const LoginPage()));
  }
}

InputDecoration _inputDecoration(
  BuildContext context, {
  required String label,
  required String hint,
  IconData? icon,
  Widget? suffixIcon,
}) {
  final theme = Theme.of(context);
  OutlineInputBorder border(Color color) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(18),
    borderSide: BorderSide(color: color, width: 1.2),
  );

  return InputDecoration(
    labelText: label,
    hintText: hint,
    floatingLabelBehavior: FloatingLabelBehavior.always,
    suffixIcon:
        suffixIcon ??
        (icon != null ? Icon(icon, color: Colors.grey.shade600) : null),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    border: border(Colors.black12),
    enabledBorder: border(Colors.black26),
    focusedBorder: border(theme.primaryColor),
  );
}
