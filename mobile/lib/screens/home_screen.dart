import 'dart:async';
import 'package:flutter/material.dart';
import '../models/job.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import 'job_status_screen.dart';
import 'video_preview_screen.dart';

class HomeScreen extends StatefulWidget {
  final VoidCallback? onCreateTap;
  const HomeScreen({super.key, this.onCreateTap});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final _api = const ApiService();
  final _auth = const AuthService();
  List<Job> _jobs = [];
  bool _loading = true;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    try {
      final jobs = await _api.listJobs();
      if (!mounted) return;
      setState(() { _jobs = jobs; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('UGC Studio'),
        centerTitle: false,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _jobs.isEmpty
              ? _EmptyState(onTap: widget.onCreateTap ?? () {})
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: _jobs.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) => _JobCard(
                      job: _jobs[i],
                      onTap: () => _openJob(_jobs[i]),
                    ),
                  ),
                ),
    );
  }

  Future<void> _logout() async {
    await _auth.logout();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
  }

  void _openJob(Job job) {
    if (job.isCompleted) {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => VideoPreviewScreen(job: job),
      ));
    } else {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => JobStatusScreen(jobId: job.id),
      )).then((_) => _load());
    }
  }
}

// ─── Job Card ────────────────────────────────────────────────────────────────

class _JobCard extends StatelessWidget {
  final Job job;
  final VoidCallback onTap;
  const _JobCard({required this.job, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: InkWell(
        onTap: onTap,
        child: Row(
          children: [
            // Thumbnail
            SizedBox(
              width: 90,
              height: 90,
              child: job.imageUrl != null
                  ? Image.network(job.imageUrl!, fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _placeholder(cs))
                  : _placeholder(cs),
            ),
            const SizedBox(width: 12),
            // Info
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      _StatusBadge(job: job),
                      const Spacer(),
                      Text(
                        _timeAgo(job.createdAt),
                        style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant),
                      ),
                      const SizedBox(width: 12),
                    ]),
                    const SizedBox(height: 6),
                    Text(
                      job.contentTypeLabel,
                      style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      job.statusLabel,
                      style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (job.isProcessing) ...[
                      const SizedBox(height: 6),
                      LinearProgressIndicator(
                        value: job.statusStep / 6,
                        borderRadius: BorderRadius.circular(4),
                        minHeight: 3,
                      ),
                    ],
                  ],
                ),
              ),
            ),
            // Arrow
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder(ColorScheme cs) => Container(
    color: cs.surfaceContainerHighest,
    child: Icon(Icons.image_outlined, color: cs.onSurfaceVariant, size: 32),
  );

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'şimdi';
    if (diff.inMinutes < 60) return '${diff.inMinutes}dk';
    if (diff.inHours < 24) return '${diff.inHours}sa';
    return '${diff.inDays}g';
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final Job job;
  const _StatusBadge({required this.job});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (job.status) {
      'completed' => (Colors.green, 'Hazır'),
      'failed' => (Colors.red, 'Hata'),
      _ => (Theme.of(context).colorScheme.primary, 'İşleniyor'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

// ─── Empty State ──────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final VoidCallback onTap;
  const _EmptyState({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: cs.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.video_camera_back_outlined,
                size: 48, color: cs.onPrimaryContainer),
          ),
          const SizedBox(height: 20),
          Text('Henüz içerik yok',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text('İlk videonu oluşturarak başla',
              style: TextStyle(color: cs.onSurfaceVariant)),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: onTap,
            icon: const Icon(Icons.add),
            label: const Text('İlk videonu oluştur'),
          ),
        ],
      ),
    );
  }
}
