import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/onboarding_service.dart';

class _OnboardingSlide {
  final IconData icon;
  final String title;
  final String description;
  const _OnboardingSlide({required this.icon, required this.title, required this.description});
}

const _slides = [
  _OnboardingSlide(
    icon: Icons.auto_awesome_outlined,
    title: 'Ürününü saniyeler içinde UGC videoya dönüştür',
    description:
        'Ürün adını ve kısa bir açıklamayı yaz, AI senaryoyu, fotoğrafı ve sahne sahne video klipleri senin için üretsin.',
  ),
  _OnboardingSlide(
    icon: Icons.photo_album_outlined,
    title: 'Kendi referanslarını ekle',
    description:
        'Kendinin, ürününün ya da mekânının fotoğraflarını etiketli klasörlere kaydet — AI videolarda gerçek görüntünü kullansın.',
  ),
  _OnboardingSlide(
    icon: Icons.video_library_outlined,
    title: 'İşlerini tek ekrandan takip et',
    description:
        'Senaryoyu onayla, üretim adımlarını canlı izle, tamamlanan videoyu indir veya paylaş.',
  ),
];

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pageController = PageController();
  final _onboarding = const OnboardingService();
  final _auth = const AuthService();
  int _page = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await _onboarding.markOnboardingSeen();
    if (!mounted) return;
    final loggedIn = await _auth.isLoggedIn;
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed(loggedIn ? '/home' : '/login');
  }

  void _next() {
    if (_page < _slides.length - 1) {
      _pageController.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isLast = _page == _slides.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: TextButton(
                  onPressed: _finish,
                  child: const Text('Atla'),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (ctx, i) {
                  final slide = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(28),
                          decoration: BoxDecoration(color: cs.primaryContainer, shape: BoxShape.circle),
                          child: Icon(slide.icon, size: 56, color: cs.onPrimaryContainer),
                        ),
                        const SizedBox(height: 32),
                        Text(
                          slide.title,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          slide.description,
                          textAlign: TextAlign.center,
                          style: TextStyle(color: cs.onSurfaceVariant, height: 1.4),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_slides.length, (i) {
                final active = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: active ? 20 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: active ? cs.primary : cs.outlineVariant,
                    borderRadius: BorderRadius.circular(3),
                  ),
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _next,
                  child: Text(isLast ? 'Başla' : 'Devam'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
