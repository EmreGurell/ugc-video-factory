import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/home_screen.dart';
import 'screens/create_ugc_screen.dart';
import 'screens/reference_library_screen.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding_screen.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/navigation.dart';
import 'services/onboarding_service.dart';
import 'services/push_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    // Platform config dosyası (google-services.json / GoogleService-Info.plist)
    // eksikse push bildirimleri olmadan devam eder — uygulamanın geri kalanı çalışır.
    await Firebase.initializeApp();
  } catch (_) {
    // ignore
  }
  runApp(const UGCApp());
}

ThemeData _buildTheme(Brightness brightness) {
  final isLight = brightness == Brightness.light;

  const lightScheme = ColorScheme.light(
    primary: Colors.black,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFEEEEEE),
    onPrimaryContainer: Colors.black,
    secondary: Colors.black,
    onSecondary: Colors.white,
    surface: Colors.white,
    onSurface: Colors.black,
    surfaceContainerHighest: Color(0xFFF3F3F3),
    onSurfaceVariant: Color(0xFF555555),
    outline: Color(0xFF888888),
    outlineVariant: Color(0xFFDDDDDD),
  );

  const darkScheme = ColorScheme.dark(
    primary: Colors.white,
    onPrimary: Colors.black,
    primaryContainer: Color(0xFF2A2A2A),
    onPrimaryContainer: Colors.white,
    secondary: Colors.white,
    onSecondary: Colors.black,
    surface: Color(0xFF0F0F0F),
    onSurface: Colors.white,
    surfaceContainerHighest: Color(0xFF252525),
    onSurfaceVariant: Color(0xFFAAAAAA),
    outline: Color(0xFF666666),
    outlineVariant: Color(0xFF333333),
  );

  final scheme = isLight ? lightScheme : darkScheme;
  final fillColor = isLight ? const Color(0xFFF9F9F9) : const Color(0xFF1A1A1A);
  final focusBorderColor = isLight ? Colors.black : Colors.white;

  final inputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide.none,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    textTheme: GoogleFonts.montserratTextTheme(
      isLight ? ThemeData.light().textTheme : ThemeData.dark().textTheme,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: fillColor,
      border: inputBorder,
      enabledBorder: inputBorder,
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: focusBorderColor, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red, width: 1),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: TextStyle(color: isLight ? const Color(0xFF555555) : const Color(0xFFAAAAAA)),
      floatingLabelStyle: TextStyle(color: focusBorderColor, fontWeight: FontWeight.w600),
    ),
  );
}

class UGCApp extends StatelessWidget {
  const UGCApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'UGC Studio',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      initialRoute: '/',
      routes: {
        '/': (_) => const AuthGate(),
        '/onboarding': (_) => const OnboardingScreen(),
        '/login': (_) => const LoginScreen(),
        '/home': (_) => const MainShell(),
      },
    );
  }
}

// Uygulama açılışında önce onboarding görüldü mü diye bakar (görülmediyse
// önce o gösterilir), ardından oturum var mı diye bakar. Geçersiz/süresi
// dolmuş token'lar ilk API çağrısında ApiService tarafından yakalanıp
// login'e geri yönlendirilir.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final _auth = const AuthService();
  final _onboarding = const OnboardingService();

  @override
  void initState() {
    super.initState();
    _decide();
  }

  Future<void> _decide() async {
    final onboardingSeen = await _onboarding.isOnboardingSeen;
    if (!mounted) return;
    if (!onboardingSeen) {
      Navigator.of(context).pushReplacementNamed('/onboarding');
      return;
    }
    final loggedIn = await _auth.isLoggedIn;
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed(loggedIn ? '/home' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;
  final _onboarding = const OnboardingService();
  OverlayEntry? _coachmark;

  List<Widget> get _screens => [
        HomeScreen(onCreateTap: () => setState(() => _index = 1)),
        const CreateUGCScreen(),
        const ReferenceLibraryScreen(),
      ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowCoachmark());
    PushNotificationService.initialize(const ApiService());
  }

  @override
  void dispose() {
    _coachmark?.remove();
    super.dispose();
  }

  Future<void> _maybeShowCoachmark() async {
    if (await _onboarding.isCreateTabCoachmarkSeen) return;
    if (!mounted) return;
    final entry = OverlayEntry(builder: (_) => _CreateTabCoachmark(onDismiss: _dismissCoachmark));
    _coachmark = entry;
    Overlay.of(context).insert(entry);
  }

  void _dismissCoachmark() {
    _coachmark?.remove();
    _coachmark = null;
    _onboarding.markCreateTabCoachmarkSeen();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.video_library_outlined),
            selectedIcon: Icon(Icons.video_library),
            label: 'İşler',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_circle_outline),
            selectedIcon: Icon(Icons.add_circle),
            label: 'Oluştur',
          ),
          NavigationDestination(
            icon: Icon(Icons.photo_album_outlined),
            selectedIcon: Icon(Icons.photo_album),
            label: 'Referanslar',
          ),
        ],
      ),
    );
  }
}

// "Oluştur" sekmesini işaret eden tek seferlik coach-mark. Sekme 3 öğenin
// ortasında olduğundan yatayda ortalanmış bir balon otomatik olarak ona işaret eder.
class _CreateTabCoachmark extends StatelessWidget {
  final VoidCallback onDismiss;
  const _CreateTabCoachmark({required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Positioned(
      left: 24,
      right: 24,
      bottom: 92,
      child: Material(
        color: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              decoration: BoxDecoration(
                color: cs.inverseSurface,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Yeni bir video oluşturmak için buraya dokun',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: cs.onInverseSurface, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: onDismiss,
                    child: Text('Anladım', style: TextStyle(color: cs.onInverseSurface)),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_drop_down, size: 32, color: cs.inverseSurface),
          ],
        ),
      ),
    );
  }
}
