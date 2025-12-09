import '../datasources/auth_remote_data_source.dart';
import '../models/dto/auth_request_dto.dart';
import '../models/dto/auth_response_dto.dart';
import '../models/entity/user_entity.dart';
import '../services/api_client.dart';
import '../services/token_storage.dart';

class AuthRepository {
  AuthRepository({
    required AuthRemoteDataSource remoteDataSource,
    required TokenStorage tokenStorage,
    required ApiClient apiClient,
  }) : _remoteDataSource = remoteDataSource,
       _tokenStorage = tokenStorage,
       _apiClient = apiClient;

  final AuthRemoteDataSource _remoteDataSource;
  final TokenStorage _tokenStorage;
  final ApiClient _apiClient;

  Future<AuthResponseDto> login(LoginRequestDto dto) async {
    final response = await _remoteDataSource.login(dto);
    // Only persist token if 2FA is not required
    if (response.requires2FA != true && response.accessToken.isNotEmpty) {
      await _persistToken(response.accessToken);
    }
    return response;
  }

  Future<AuthResponseDto> register(RegisterRequestDto dto) async {
    final response = await _remoteDataSource.register(dto);
    await _persistToken(response.accessToken);
    return response;
  }

  Future<UserEntity> fetchProfile() {
    return _remoteDataSource.fetchProfile();
  }

  Future<String> requestPasswordReset(ForgotPasswordRequestDto dto) {
    return _remoteDataSource.requestPasswordReset(dto);
  }

  Future<String> resetPassword(ResetPasswordRequestDto dto) {
    return _remoteDataSource.resetPassword(dto);
  }

  Future<void> logout() async {
    await _tokenStorage.clearToken();
    _apiClient.updateAuthToken(null);
  }

  Future<void> bootstrapToken() async {
    final token = await _tokenStorage.readToken();
    _apiClient.updateAuthToken(token);
  }

  Future<void> persistToken(String token) async {
    await _tokenStorage.saveToken(token);
    _apiClient.updateAuthToken(token);
  }

  Future<void> _persistToken(String token) async {
    await persistToken(token);
  }
}
