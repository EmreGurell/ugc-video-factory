import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class AuthException implements Exception {
  final String message;
  AuthException(this.message);
  @override
  String toString() => message;
}

class AuthService {
  final String baseUrl;
  static const _storage = FlutterSecureStorage();
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _emailKey = 'user_email';

  const AuthService({this.baseUrl = 'http://10.24.41.46:3000'});

  Future<String?> get accessToken => _storage.read(key: _accessKey);
  Future<String?> get refreshToken => _storage.read(key: _refreshKey);
  Future<String?> get email => _storage.read(key: _emailKey);

  Future<bool> get isLoggedIn async => (await refreshToken) != null;

  Future<void> register(String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw AuthException(_errorMessage(res, 'Kayıt başarısız'));
    }
    await _saveSession(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode != 200) {
      throw AuthException(_errorMessage(res, 'Giriş başarısız'));
    }
    await _saveSession(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// Refresh token'ı rotate eder. Başarısızsa oturumu temizler ve false döner.
  Future<bool> tryRefresh() async {
    final rt = await refreshToken;
    if (rt == null) return false;
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refresh_token': rt}),
      );
      if (res.statusCode != 200) {
        await logout();
        return false;
      }
      await _saveSession(jsonDecode(res.body) as Map<String, dynamic>);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    final rt = await refreshToken;
    if (rt != null) {
      try {
        await http.post(
          Uri.parse('$baseUrl/auth/logout'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'refresh_token': rt}),
        );
      } catch (_) {
        // Sunucuya ulaşılamasa bile yerel oturum temizlenir
      }
    }
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _emailKey);
  }

  Future<void> _saveSession(Map<String, dynamic> json) async {
    await _storage.write(key: _accessKey, value: json['access_token'] as String);
    await _storage.write(key: _refreshKey, value: json['refresh_token'] as String);
    final user = json['user'] as Map<String, dynamic>?;
    if (user != null) {
      await _storage.write(key: _emailKey, value: user['email'] as String?);
    }
  }

  String _errorMessage(http.Response res, String fallback) {
    try {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final message = body['message'];
      if (message is String) return message;
      if (message is List) return message.join(', ');
    } catch (_) {}
    return fallback;
  }
}
