import 'package:shared_preferences/shared_preferences.dart';

/// İlk açılış onboarding'i ve tek seferlik coach-mark'ların gösterilip
/// gösterilmediğini takip eder.
class OnboardingService {
  static const _onboardingKey = 'onboarding_seen';
  static const _coachmarkKey = 'coachmark_create_tab_seen';

  const OnboardingService();

  Future<bool> get isOnboardingSeen async =>
      (await SharedPreferences.getInstance()).getBool(_onboardingKey) ?? false;

  Future<void> markOnboardingSeen() async {
    (await SharedPreferences.getInstance()).setBool(_onboardingKey, true);
  }

  Future<bool> get isCreateTabCoachmarkSeen async =>
      (await SharedPreferences.getInstance()).getBool(_coachmarkKey) ?? false;

  Future<void> markCreateTabCoachmarkSeen() async {
    (await SharedPreferences.getInstance()).setBool(_coachmarkKey, true);
  }
}
