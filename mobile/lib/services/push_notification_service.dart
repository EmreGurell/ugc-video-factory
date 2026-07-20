import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../screens/job_status_screen.dart';
import 'api_service.dart';
import 'navigation.dart';

const _channel = AndroidNotificationChannel(
  'jobs',
  'İş Bildirimleri',
  description: 'Video üretimi tamamlandığında veya başarısız olduğunda bildirim gösterir',
  importance: Importance.high,
);

/// Uygulama tamamen kapalıyken/arka plandayken gelen mesajlar için — sistem
/// bildirimi FCM tarafından otomatik gösterildiğinden burada ekstra iş yok,
/// ama plugin'in bu handler'ı (top-level + @pragma) beklemesi zorunlu.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {}

class PushNotificationService {
  static final _localNotifications = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  /// Bildirim izni ister, FCM token'ını backend'e kaydeder ve
  /// foreground/arka plan/kapalı-uygulama bildirim akışlarını bağlar.
  /// Login sonrası veya oturum açıkken uygulama tekrar açıldığında çağrılır.
  static Future<void> initialize(ApiService api) async {
    if (_initialized) return;
    // Platform config dosyası (google-services.json / GoogleService-Info.plist)
    // eksikse Firebase hiç başlamamış olur — push'suz devam edilir.
    if (Firebase.apps.isEmpty) return;
    _initialized = true;

    try {
      await _setup(api);
    } catch (_) {
      // Bildirim kurulumu başarısız olsa bile uygulamanın geri kalanı etkilenmez
    }
  }

  static Future<void> _setup(ApiService api) async {
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    await _localNotifications.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
      onDidReceiveNotificationResponse: (response) => _openJobFromPayload(response.payload),
    );

    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _registerToken(api, token);
    FirebaseMessaging.instance.onTokenRefresh.listen((t) => _registerToken(api, t));

    FirebaseMessaging.onMessage.listen(_showLocalNotification);
    FirebaseMessaging.onMessageOpenedApp.listen((message) => _openJob(message.data['job_id'] as String?));

    // Bildirime dokunarak uygulama sıfırdan açıldıysa
    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) _openJob(initialMessage.data['job_id'] as String?);
  }

  static Future<void> _registerToken(ApiService api, String token) async {
    try {
      await api.registerPushToken(token);
    } catch (_) {
      // Kayıt başarısız olsa bile uygulama bildirimsiz çalışmaya devam eder
    }
  }

  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  static void _openJobFromPayload(String? payload) {
    if (payload == null) return;
    final data = jsonDecode(payload) as Map<String, dynamic>;
    _openJob(data['job_id'] as String?);
  }

  static void _openJob(String? jobId) {
    if (jobId == null) return;
    navigatorKey.currentState?.push(MaterialPageRoute(builder: (_) => JobStatusScreen(jobId: jobId)));
  }
}
