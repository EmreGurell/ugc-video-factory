import 'dart:async';
import 'package:flutter/material.dart';
import '../models/job.dart';
import '../services/api_service.dart';
import 'video_preview_screen.dart';

class JobStatusScreen extends StatefulWidget {
  final String jobId;
  const JobStatusScreen({super.key, required this.jobId});

  @override
  State<JobStatusScreen> createState() => _JobStatusScreenState();
}

class _JobStatusScreenState extends State<JobStatusScreen> {
  final _api = const ApiService();
  Job? _job;
  Timer? _timer;
  int _pollCount = 0;

  @override
  void initState() {
    super.initState();
    _poll();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Duration get _pollInterval {
    final elapsed = _pollCount * 3;
    if (elapsed < 30) return const Duration(seconds: 3);
    if (elapsed < 300) return const Duration(seconds: 10);
    return const Duration(seconds: 30);
  }

  Future<void> _poll() async {
    try {
      final job = await _api.getJob(widget.jobId);
      _pollCount++;
      if (!mounted) return;
      setState(() => _job = job);

      if (job.isCompleted) {
        await Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => VideoPreviewScreen(job: job)),
        );
        return;
      }

      // Pause polling while waiting for user's script approval
      if (job.needsScriptApproval || job.isFailed) return;

      _timer = Timer(_pollInterval, _poll);
    } catch (_) {
      if (mounted) _timer = Timer(const Duration(seconds: 5), _poll);
    }
  }

  void _resumePolling() {
    _timer?.cancel();
    _timer = Timer(const Duration(seconds: 3), _poll);
  }

  @override
  Widget build(BuildContext context) {
    final job = _job;
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(job?.productName ?? job?.contentTypeLabel ?? 'İşleniyor...'),
        centerTitle: false,
      ),
      body: job == null
          ? const Center(child: CircularProgressIndicator())
          : job.isFailed
              ? _FailedView(job: job)
              : job.needsScriptApproval
                  ? _ScriptApprovalCard(
                      job: job,
                      api: _api,
                      onApproved: _resumePolling,
                    )
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Image preview or placeholder
                          if (job.imageUrl != null)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: AspectRatio(
                                aspectRatio: 9 / 16,
                                child: Image.network(job.imageUrl!, fit: BoxFit.cover),
                              ),
                            )
                          else
                            AspectRatio(
                              aspectRatio: 9 / 16,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: cs.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Center(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      SizedBox(
                                        width: 40, height: 40,
                                        child: CircularProgressIndicator(
                                            color: cs.primary, strokeWidth: 3),
                                      ),
                                      const SizedBox(height: 16),
                                      Text(job.statusLabel,
                                          style: TextStyle(color: cs.onSurfaceVariant)),
                                    ],
                                  ),
                                ),
                              ),
                            ),

                          const SizedBox(height: 28),

                          if (job.isVideo)
                            _PipelineStepper(job: job)
                          else
                            _SimpleProgress(job: job),

                          const SizedBox(height: 16),
                          Text(
                            'İş: ${widget.jobId.substring(0, 8)}...',
                            style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
    );
  }
}

// ─── Script Approval Card ─────────────────────────────────────────────────────

class _ScriptApprovalCard extends StatefulWidget {
  final Job job;
  final ApiService api;
  final VoidCallback onApproved;

  const _ScriptApprovalCard({
    required this.job,
    required this.api,
    required this.onApproved,
  });

  @override
  State<_ScriptApprovalCard> createState() => _ScriptApprovalCardState();
}

class _ScriptApprovalCardState extends State<_ScriptApprovalCard> {
  late final TextEditingController _scriptCtrl;
  bool _approving = false;

  @override
  void initState() {
    super.initState();
    _scriptCtrl = TextEditingController(text: widget.job.draftScript ?? '');
  }

  @override
  void dispose() {
    _scriptCtrl.dispose();
    super.dispose();
  }

  Future<void> _approve() async {
    final script = _scriptCtrl.text.trim();
    if (script.isEmpty) return;
    setState(() => _approving = true);
    try {
      await widget.api.approveScript(widget.job.id, script);
      widget.onApproved();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Hata: $e')));
      }
    } finally {
      if (mounted) setState(() => _approving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: cs.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.edit_note, color: cs.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Senaryo Hazır',
                        style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    Text('Düzenleyebilir veya olduğu gibi onaylayabilirsiniz.',
                        style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Product research summary (collapsed, optional)
          if (widget.job.productResearch != null) ...[
            _ResearchSummary(research: widget.job.productResearch!),
            const SizedBox(height: 16),
          ],

          // Script editor
          TextFormField(
            controller: _scriptCtrl,
            maxLines: 8,
            enabled: !_approving,
            decoration: const InputDecoration(
              labelText: 'Senaryo',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 20),

          // Approve button
          FilledButton.icon(
            onPressed: _approving ? null : _approve,
            icon: _approving
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check_rounded),
            label: Text(_approving ? 'Onaylanıyor...' : 'Onayla ve Devam Et'),
          ),
        ],
      ),
    );
  }
}

class _ResearchSummary extends StatefulWidget {
  final String research;
  const _ResearchSummary({required this.research});

  @override
  State<_ResearchSummary> createState() => _ResearchSummaryState();
}

class _ResearchSummaryState extends State<_ResearchSummary> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.info_outline, size: 16, color: cs.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Ürün Araştırması',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: cs.onSurfaceVariant)),
                ),
                Icon(
                  _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                  color: cs.onSurfaceVariant,
                  size: 18,
                ),
              ],
            ),
            if (_expanded) ...[
              const SizedBox(height: 8),
              Text(widget.research,
                  style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant, height: 1.5)),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Pipeline Stepper ─────────────────────────────────────────────────────────

class _PipelineStepper extends StatelessWidget {
  final Job job;
  const _PipelineStepper({required this.job});

  static const _steps = [
    (Icons.search, 'Ürün Araştır'),
    (Icons.edit_note, 'Senaryo Yaz'),
    (Icons.image_outlined, 'Görsel Üret'),
    (Icons.videocam_outlined, 'Video Klipleri'),
    (Icons.merge_type, 'Birleştir'),
  ];

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final current = (job.statusStep - 1).clamp(0, _steps.length - 1);

    return Column(
      children: List.generate(_steps.length, (i) {
        final (icon, label) = _steps[i];
        final isDone = i < current;
        final isActive = i == current;
        final isWaiting = i > current;

        Color iconColor;
        Color bgColor;
        if (isDone) {
          iconColor = cs.onPrimary;
          bgColor = cs.primary;
        } else if (isActive) {
          iconColor = cs.primary;
          bgColor = cs.primaryContainer;
        } else {
          iconColor = cs.onSurfaceVariant;
          bgColor = cs.surfaceContainerHighest;
        }

        return Row(
          children: [
            SizedBox(
              width: 44,
              child: Column(
                children: [
                  Container(
                    width: 2,
                    height: i == 0 ? 0 : 16,
                    color: i <= current ? cs.primary : cs.outlineVariant,
                  ),
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: bgColor),
                    child: isActive
                        ? Padding(
                            padding: const EdgeInsets.all(8),
                            child: CircularProgressIndicator(
                                strokeWidth: 2.5, color: cs.primary),
                          )
                        : Icon(isDone ? Icons.check : icon,
                            size: 18, color: iconColor),
                  ),
                  Container(
                    width: 2,
                    height: i == _steps.length - 1 ? 0 : 16,
                    color: i < current ? cs.primary : cs.outlineVariant,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                  color: isWaiting ? cs.onSurfaceVariant : cs.onSurface,
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}

// ─── Simple progress (for static types) ──────────────────────────────────────

class _SimpleProgress extends StatelessWidget {
  final Job job;
  const _SimpleProgress({required this.job});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      children: [
        LinearProgressIndicator(
          borderRadius: BorderRadius.circular(8),
          minHeight: 6,
        ),
        const SizedBox(height: 12),
        Text(job.statusLabel,
            style: TextStyle(
                fontWeight: FontWeight.w600, color: cs.onSurface, fontSize: 15)),
      ],
    );
  }
}

// ─── Failed View ──────────────────────────────────────────────────────────────

class _FailedView extends StatelessWidget {
  final Job job;
  const _FailedView({required this.job});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 64,
                color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 16),
            const Text('Hata Oluştu',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(
              job.errorMessage ?? 'Bilinmeyen hata',
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            const SizedBox(height: 24),
            FilledButton.tonal(
              onPressed: () => Navigator.pop(context),
              child: const Text('Geri Dön'),
            ),
          ],
        ),
      ),
    );
  }
}
