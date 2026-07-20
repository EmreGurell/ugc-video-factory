import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/job.dart';
import '../models/reference_photo.dart';
import 'auth_service.dart';
import 'navigation.dart';

class ApiService {
  final String baseUrl;
  final AuthService auth;

  const ApiService({this.baseUrl = 'http://10.24.41.46:3000', this.auth = const AuthService()});

  Future<Map<String, String>> _authHeaders() async {
    final token = await auth.accessToken;
    return {if (token != null) 'Authorization': 'Bearer $token'};
  }

  /// 401 aldığında bir kez refresh deneyip isteği tekrarlar. Refresh de
  /// başarısız olursa oturumu temizler, login ekranına yönlendirir ve
  /// AuthException fırlatır.
  Future<http.Response> _withAuthRetry(
    Future<http.Response> Function(Map<String, String> headers) send,
  ) async {
    var res = await send(await _authHeaders());
    if (res.statusCode == 401) {
      final refreshed = await auth.tryRefresh();
      if (!refreshed) {
        navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (route) => false);
        throw AuthException('Oturum süresi doldu, tekrar giriş yapın');
      }
      res = await send(await _authHeaders());
    }
    return res;
  }

  Future<http.StreamedResponse> _sendMultipart(
    Future<http.MultipartRequest> Function() build,
  ) async {
    Future<http.StreamedResponse> attempt() async {
      final request = await build();
      request.headers.addAll(await _authHeaders());
      return request.send();
    }

    var res = await attempt();
    if (res.statusCode == 401) {
      final refreshed = await auth.tryRefresh();
      if (!refreshed) {
        navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (route) => false);
        throw AuthException('Oturum süresi doldu, tekrar giriş yapın');
      }
      res = await attempt();
    }
    return res;
  }

  Future<String> uploadReferenceImage(File imageFile) async {
    final streamed = await _sendMultipart(() async {
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/jobs/upload-reference'));
      request.files.add(await http.MultipartFile.fromPath('image', imageFile.path));
      return request;
    });
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 201 && streamed.statusCode != 200) {
      throw Exception('Upload failed: $body');
    }
    return (jsonDecode(body) as Map<String, dynamic>)['url'] as String;
  }

  Future<String> createJob({
    required String productName,
    String? videoBrief,
    String aspectRatio = '9:16',
    String contentType = 'ugc_selfie',
    int sceneCount = 3,
    String videoStyle = 'dynamic',
    String voiceLanguage = 'tr',
    String voiceGender = 'female',
    String? referenceImageUrl,
    List<String>? referenceTags,
    String musicMode = 'none',
    String? musicStyle,
    String imageModel = 'nano_banana',
    String videoModel = 'kling_standard',
  }) async {
    final response = await _withAuthRetry((headers) => http.post(
          Uri.parse('$baseUrl/jobs'),
          headers: {...headers, 'Content-Type': 'application/json'},
          body: jsonEncode({
            'product_name': productName,
            // ignore: use_null_aware_elements
            if (videoBrief != null && videoBrief.isNotEmpty) 'video_brief': videoBrief,
            'aspect_ratio': aspectRatio,
            'content_type': contentType,
            'scene_count': sceneCount,
            'video_style': videoStyle,
            'voice_language': voiceLanguage,
            'voice_gender': voiceGender,
            // ignore: use_null_aware_elements
            if (referenceImageUrl != null) 'reference_image_url': referenceImageUrl,
            if (referenceTags != null && referenceTags.isNotEmpty)
              'reference_tags': referenceTags,
            'music_mode': musicMode,
            // ignore: use_null_aware_elements
            if (musicStyle != null && musicStyle.isNotEmpty) 'music_style': musicStyle,
            'image_model': imageModel,
            'video_model': videoModel,
          }),
        ));

    if (response.statusCode != 202) {
      throw Exception('Job creation failed: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['job_id'] as String;
  }

  Future<void> approveScript(String jobId, String script) async {
    final response = await _withAuthRetry((headers) => http.put(
          Uri.parse('$baseUrl/jobs/$jobId/approve-script'),
          headers: {...headers, 'Content-Type': 'application/json'},
          body: jsonEncode({'script': script}),
        ));
    if (response.statusCode != 200) {
      throw Exception('Script onaylanamadı: ${response.body}');
    }
  }

  Future<Job> getJob(String jobId) async {
    final response = await _withAuthRetry((headers) => http.get(Uri.parse('$baseUrl/jobs/$jobId'), headers: headers));

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch job: ${response.body}');
    }

    return Job.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  // ─── Referans kütüphanesi ───────────────────────────────────────────────

  Future<List<ReferencePhoto>> listReferences() async {
    final response = await _withAuthRetry((headers) => http.get(Uri.parse('$baseUrl/references'), headers: headers));
    if (response.statusCode != 200) {
      throw Exception('Referanslar alınamadı: ${response.body}');
    }
    final list = jsonDecode(response.body) as List<dynamic>;
    return list
        .map((e) => ReferencePhoto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ReferencePhoto> uploadReference(String tag, File imageFile) async {
    final streamed = await _sendMultipart(() async {
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/references'));
      request.fields['tag'] = tag;
      request.files.add(await http.MultipartFile.fromPath('image', imageFile.path));
      return request;
    });
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 201 && streamed.statusCode != 200) {
      throw Exception('Referans yüklenemedi: $body');
    }
    return ReferencePhoto.fromJson(jsonDecode(body) as Map<String, dynamic>);
  }

  /// Bir etiketin (klasörün) TÜM öğelerini siler.
  Future<void> deleteReference(String tag) async {
    final response =
        await _withAuthRetry((headers) => http.delete(Uri.parse('$baseUrl/references/$tag'), headers: headers));
    if (response.statusCode != 200) {
      throw Exception('Referans silinemedi: ${response.body}');
    }
  }

  /// Klasördeki tek bir öğeyi siler.
  Future<void> deleteReferenceItem(String id) async {
    final response =
        await _withAuthRetry((headers) => http.delete(Uri.parse('$baseUrl/references/item/$id'), headers: headers));
    if (response.statusCode != 200) {
      throw Exception('Öğe silinemedi: ${response.body}');
    }
  }

  /// Videodan eşit aralıklarla kare adayları çıkarır (seçim için).
  Future<List<String>> extractFrames(File videoFile) async {
    final streamed = await _sendMultipart(() async {
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/references/extract-frames'));
      request.files.add(await http.MultipartFile.fromPath('video', videoFile.path));
      return request;
    });
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 201 && streamed.statusCode != 200) {
      throw Exception('Video işlenemedi: $body');
    }
    final data = jsonDecode(body) as Map<String, dynamic>;
    return (data['frames'] as List<dynamic>).cast<String>();
  }

  /// Kare ızgarasından seçilen kareyi kalıcı referans kaydına dönüştürür.
  Future<ReferencePhoto> confirmFrame(String tag, String frameUrl) async {
    final response = await _withAuthRetry((headers) => http.post(
          Uri.parse('$baseUrl/references/confirm-frame'),
          headers: {...headers, 'Content-Type': 'application/json'},
          body: jsonEncode({'tag': tag, 'frame_url': frameUrl}),
        ));
    if (response.statusCode != 201 && response.statusCode != 200) {
      throw Exception('Kare onaylanamadı: ${response.body}');
    }
    return ReferencePhoto.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<List<Job>> listJobs() async {
    final response = await _withAuthRetry((headers) => http.get(Uri.parse('$baseUrl/jobs'), headers: headers));

    if (response.statusCode != 200) {
      throw Exception('Failed to list jobs: ${response.body}');
    }

    final list = jsonDecode(response.body) as List<dynamic>;
    return list.map((e) => Job.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ─── Push bildirimleri ──────────────────────────────────────────────────

  Future<void> registerPushToken(String token, {String platform = 'android'}) async {
    final response = await _withAuthRetry((headers) => http.post(
          Uri.parse('$baseUrl/notifications/register-token'),
          headers: {...headers, 'Content-Type': 'application/json'},
          body: jsonEncode({'token': token, 'platform': platform}),
        ));
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Push token kaydedilemedi: ${response.body}');
    }
  }
}
