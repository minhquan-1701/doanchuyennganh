import '../models/dto/auth_request_dto.dart';
import '../models/dto/auth_response_dto.dart';
import '../models/entity/user_entity.dart';
import '../services/api_client.dart';
import '../services/api_utils.dart';

class AuthRemoteDataSource {
  const AuthRemoteDataSource(this._client);

  final ApiClient _client;

  Future<AuthResponseDto> login(LoginRequestDto dto) async {
    final response = await _client.post('auth/login', body: dto.toJson());
    final map = ensureMap(response, errorMessage: 'Invalid auth response');
    return AuthResponseDto.fromJson(map);
  }

  Future<AuthResponseDto> register(RegisterRequestDto dto) async {
    final response = await _client.post('auth/register', body: dto.toJson());
    final map = ensureMap(response, errorMessage: 'Invalid register response');
    return AuthResponseDto.fromJson(map);
  }

  Future<UserEntity> fetchProfile() async {
    final response = await _client.get('auth/me');
    final map = ensureMap(response, errorMessage: 'Invalid profile response');
    return UserEntity.fromJson(map);
  }

  Future<String> requestPasswordReset(ForgotPasswordRequestDto dto) async {
    final response = await _client.post(
      'auth/forgot-password',
      body: dto.toJson(),
    );
    final map = ensureMap(
      response,
      errorMessage: 'Invalid forgot password response',
    );
    return (map['message'] as String?) ??
        'Yêu cầu đặt lại mật khẩu đã được gửi.';
  }

  Future<String> resetPassword(ResetPasswordRequestDto dto) async {
    final response = await _client.post(
      'auth/reset-password',
      body: dto.toJson(),
    );
    final map = ensureMap(
      response,
      errorMessage: 'Invalid reset password response',
    );
    return (map['message'] as String?) ??
        'Mật khẩu đã được đặt lại thành công.';
  }
}
