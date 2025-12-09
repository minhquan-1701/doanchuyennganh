import '../../data/models/dto/auth_request_dto.dart';
import '../../data/models/dto/auth_response_dto.dart';
import '../../data/models/entity/user_entity.dart';
import '../../data/repositories/auth_repository.dart';

class AuthService {
  const AuthService(this._repository);

  final AuthRepository _repository;

  Future<void> initializeSession() {
    return _repository.bootstrapToken();
  }

  Future<AuthResponseDto> login(LoginRequestDto dto) {
    return _repository.login(dto);
  }

  Future<AuthResponseDto> register(RegisterRequestDto dto) {
    return _repository.register(dto);
  }

  Future<UserEntity> getProfile() {
    return _repository.fetchProfile();
  }

  Future<void> logout() {
    return _repository.logout();
  }

  Future<String> requestPasswordReset(ForgotPasswordRequestDto dto) {
    return _repository.requestPasswordReset(dto);
  }

  Future<String> resetPassword(ResetPasswordRequestDto dto) {
    return _repository.resetPassword(dto);
  }

  Future<void> persistToken(String token) {
    return _repository.persistToken(token);
  }
}
