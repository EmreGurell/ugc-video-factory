import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/reference_folder.dart';
import '../services/api_service.dart';
import 'job_status_screen.dart';

class ContentTypeOption {
  final String value;
  final String label;
  final String description;
  final IconData icon;
  final bool isVideo;

  const ContentTypeOption({
    required this.value,
    required this.label,
    required this.description,
    required this.icon,
    required this.isVideo,
  });
}

const _contentTypes = [
  ContentTypeOption(
    value: 'ugc_selfie',
    label: 'UGC Selfie',
    description: 'Kameraya bakarak konuşma, talking head',
    icon: Icons.face,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'ugc_walking',
    label: 'UGC Yürüyüş',
    description: 'Yürürken vlog tarzı çekim',
    icon: Icons.directions_walk,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'ugc_car',
    label: 'UGC Araba',
    description: 'Arabada çekim, cam önünde',
    icon: Icons.directions_car,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'unboxing',
    label: 'Kutu Açılımı',
    description: 'Ürün kutusunu açarken canlı ilk izlenim',
    icon: Icons.inventory_2_outlined,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'testimonial',
    label: 'Müşteri Yorumu',
    description: 'Koltukta samimi deneyim anlatımı',
    icon: Icons.record_voice_over,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'grwm',
    label: 'GRWM',
    description: 'Ayna karşısında hazırlanma rutini',
    icon: Icons.brush,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'story',
    label: 'Hikâye / Vlog',
    description: 'Her sahne ayrı an ve mekân — storytime kurgusu',
    icon: Icons.auto_stories,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'lifestyle',
    label: 'Lifestyle',
    description: 'Sinematik yaşam tarzı çekimi',
    icon: Icons.wb_sunny,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'product_demo',
    label: 'Ürün Demo',
    description: 'Ürünü kullanan ellerin gösterimi',
    icon: Icons.shopping_bag,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'text_animation',
    label: 'Metin Animasyonu',
    description: 'Sade arka plan üzerinde animasyonlu metin',
    icon: Icons.text_fields,
    isVideo: true,
  ),
  ContentTypeOption(
    value: 'meme',
    label: 'Meme',
    description: 'Viral meme formatı, metin overlay',
    icon: Icons.sentiment_very_satisfied,
    isVideo: false,
  ),
  ContentTypeOption(
    value: 'product_shot',
    label: 'Ürün Fotoğrafı',
    description: 'Temiz stüdyo ürün çekimi',
    icon: Icons.camera_alt,
    isVideo: false,
  ),
  ContentTypeOption(
    value: 'before_after',
    label: 'Önce / Sonra',
    description: 'İkili karşılaştırma görseli',
    icon: Icons.compare,
    isVideo: false,
  ),
];

const _stepTitles = ['İçerik Tipi', 'Ürün & Referans', 'Ayarlar', 'Özet'];
const _stepCount = 4;

class CreateUGCScreen extends StatefulWidget {
  const CreateUGCScreen({super.key});

  @override
  State<CreateUGCScreen> createState() => _CreateUGCScreenState();
}

class _CreateUGCScreenState extends State<CreateUGCScreen> {
  final _productNameCtrl = TextEditingController();
  final _videoBriefCtrl = TextEditingController();
  final _musicStyleCtrl = TextEditingController();
  final _pageController = PageController();

  int _step = 0;
  bool _showProductNameError = false;

  String _aspectRatio = '9:16';
  String _contentType = 'ugc_selfie';
  String _voiceLanguage = 'tr';
  String _voiceGender = 'female';
  int _sceneCount = 3;
  String _videoStyle = 'dynamic';
  String _imageModel = 'nano_banana';
  String _videoModel = 'kling_standard';
  String _musicMode = 'none';
  File? _referenceImage;
  List<ReferenceFolder> _referenceLibrary = [];
  final Set<String> _selectedTags = {};
  bool _loading = false;

  final _api = const ApiService();
  final _picker = ImagePicker();

  ContentTypeOption get _selected =>
      _contentTypes.firstWhere((c) => c.value == _contentType);

  @override
  void initState() {
    super.initState();
    _loadReferenceLibrary();
  }

  Future<void> _loadReferenceLibrary() async {
    try {
      final refs = await _api.listReferences();
      if (mounted) {
        setState(() => _referenceLibrary = ReferenceFolder.groupByTag(refs));
      }
    } catch (_) {
      // kütüphane yüklenemezse sessizce geç — otomatik mod her zaman mevcut
    }
  }

  @override
  void dispose() {
    _productNameCtrl.dispose();
    _videoBriefCtrl.dispose();
    _musicStyleCtrl.dispose();
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(source: source, imageQuality: 90);
    if (picked != null) setState(() => _referenceImage = File(picked.path));
  }

  void _showImageSourceSheet() {
    final cs = Theme.of(context).colorScheme;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: cs.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // Card
              Container(
                decoration: BoxDecoration(
                  color: cs.surface,
                  borderRadius: BorderRadius.circular(16),
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    _SheetOption(
                      icon: Icons.photo_library_outlined,
                      label: 'Galeriden Seç',
                      onTap: () { Navigator.pop(context); _pickImage(ImageSource.gallery); },
                    ),
                    Divider(height: 1, indent: 56, color: cs.outlineVariant),
                    _SheetOption(
                      icon: Icons.camera_alt_outlined,
                      label: 'Kamera',
                      onTap: () { Navigator.pop(context); _pickImage(ImageSource.camera); },
                    ),
                    if (_referenceImage != null) ...[
                      Divider(height: 1, indent: 56, color: cs.outlineVariant),
                      _SheetOption(
                        icon: Icons.delete_outline,
                        label: 'Fotoğrafı Kaldır',
                        destructive: true,
                        onTap: () { Navigator.pop(context); setState(() => _referenceImage = null); },
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: 8),

              // Cancel
              Container(
                decoration: BoxDecoration(
                  color: cs.surface,
                  borderRadius: BorderRadius.circular(16),
                ),
                clipBehavior: Clip.antiAlias,
                child: _SheetOption(
                  icon: Icons.close,
                  label: 'Vazgeç',
                  onTap: () => Navigator.pop(context),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _goNext() {
    if (_step == 1 && _productNameCtrl.text.trim().isEmpty) {
      setState(() => _showProductNameError = true);
      return;
    }
    if (_step >= _stepCount - 1) return;
    setState(() => _step++);
    _pageController.animateToPage(_step,
        duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic);
  }

  void _goBack() {
    if (_step > 0) {
      setState(() => _step--);
      _pageController.animateToPage(_step,
          duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic);
    } else {
      Navigator.pop(context);
    }
  }

  Future<void> _submit() async {
    if (_productNameCtrl.text.trim().isEmpty) {
      setState(() { _step = 1; _showProductNameError = true; });
      _pageController.jumpToPage(1);
      return;
    }

    setState(() => _loading = true);

    try {
      String? referenceImageUrl;
      if (_referenceImage != null) {
        referenceImageUrl = await _api.uploadReferenceImage(_referenceImage!);
      }

      final jobId = await _api.createJob(
        productName: _productNameCtrl.text.trim(),
        videoBrief: _videoBriefCtrl.text.trim().isEmpty ? null : _videoBriefCtrl.text.trim(),
        aspectRatio: _aspectRatio,
        contentType: _contentType,
        sceneCount: _sceneCount,
        videoStyle: _videoStyle,
        voiceLanguage: _voiceLanguage,
        voiceGender: _voiceGender,
        referenceImageUrl: referenceImageUrl,
        referenceTags: _selectedTags.toList(),
        musicMode: _musicMode,
        musicStyle: _musicStyleCtrl.text.trim().isEmpty ? null : _musicStyleCtrl.text.trim(),
        imageModel: _imageModel,
        videoModel: _videoModel,
      );

      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => JobStatusScreen(jobId: jobId)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Hata: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: _goBack),
        title: const Text('Reklam İçeriği Oluştur'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          _StepHeader(step: _step, total: _stepCount, title: _stepTitles[_step]),
          Expanded(
            child: PageView(
              controller: _pageController,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _buildContentTypeStep(),
                _buildProductStep(),
                _buildSettingsStep(),
                _buildSummaryStep(),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: SizedBox(
            width: double.infinity,
            height: 50,
            child: FilledButton.icon(
              onPressed: _loading ? null : (_step == _stepCount - 1 ? _submit : _goNext),
              icon: _loading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(_step == _stepCount - 1
                      ? (_selected.isVideo ? Icons.videocam : Icons.image)
                      : Icons.arrow_forward),
              label: Text(
                _loading
                    ? 'Oluşturuluyor...'
                    : _step == _stepCount - 1
                        ? (_selected.isVideo ? 'Video Oluştur' : 'Görsel Oluştur')
                        : 'İleri',
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ─── STEP 1: İçerik Tipi ────────────────────────────────────────────────

  Widget _buildContentTypeStep() {
    final cs = Theme.of(context).colorScheme;
    final videoTypes = _contentTypes.where((c) => c.isVideo).toList();
    final staticTypes = _contentTypes.where((c) => !c.isVideo).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Ne oluşturmak istiyorsun?', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('İçerik tipini seç, geri kalanını ona göre ayarlayalım',
              style: TextStyle(color: cs.onSurfaceVariant)),
          const SizedBox(height: 20),
          _sectionLabel('Video'),
          const SizedBox(height: 10),
          _contentTypeGrid(videoTypes),
          const SizedBox(height: 20),
          _sectionLabel('Statik'),
          const SizedBox(height: 10),
          _contentTypeGrid(staticTypes),
        ],
      ),
    );
  }

  Widget _contentTypeGrid(List<ContentTypeOption> options) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 1.5,
      ),
      itemCount: options.length,
      itemBuilder: (ctx, i) {
        final ct = options[i];
        return _ContentTypeCard(
          option: ct,
          selected: ct.value == _contentType,
          onTap: () => setState(() => _contentType = ct.value),
        );
      },
    );
  }

  // ─── STEP 2: Ürün & Referans ────────────────────────────────────────────

  Widget _buildProductStep() {
    final cs = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Ürününü tanıt', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('${_selected.label} için gerekli bilgiler', style: TextStyle(color: cs.onSurfaceVariant)),
          const SizedBox(height: 20),

          // Reference image picker — square, dashed border
          GestureDetector(
            onTap: _showImageSourceSheet,
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CustomPaint(
                  painter: _DashedBorderPainter(
                    color: _referenceImage != null ? cs.primary : cs.outlineVariant,
                    filled: _referenceImage != null,
                  ),
                  child: _referenceImage != null
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.file(_referenceImage!, fit: BoxFit.cover),
                            Positioned(
                              top: 10, right: 10,
                              child: CircleAvatar(
                                radius: 16,
                                backgroundColor: cs.primary,
                                child: Icon(Icons.edit, size: 15, color: cs.onPrimary),
                              ),
                            ),
                          ],
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_photo_alternate_outlined, color: cs.onSurfaceVariant, size: 28),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('Referans Fotoğraf',
                                    style: TextStyle(
                                        fontSize: 13, fontWeight: FontWeight.w500, color: cs.onSurfaceVariant)),
                                Text('isteğe bağlı',
                                    style: TextStyle(
                                        fontSize: 11, color: cs.onSurfaceVariant.withValues(alpha: 0.6))),
                              ],
                            ),
                          ],
                        ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),

          TextField(
            controller: _productNameCtrl,
            onChanged: (_) {
              if (_showProductNameError) setState(() => _showProductNameError = false);
            },
            decoration: InputDecoration(
              labelText: 'Ürün Adı',
              hintText: 'Örn: AirPods Pro, Oura Ring, Nu Skin Krem...',
              errorText: _showProductNameError ? 'Bu alan gerekli' : null,
            ),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _videoBriefCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Video Konusu (isteğe bağlı)',
              hintText: 'Örn: Spor yaparken ses kalitesi, Pembe renk tanıtımı...',
            ),
          ),

          if (_referenceLibrary.isNotEmpty) ...[
            const SizedBox(height: 20),
            _sectionLabel('Referanslar  ·  seçilmezse otomatik eşleştirilir'),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _referenceLibrary.map((ref) {
                  final selected = _selectedTags.contains(ref.tag);
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      selected: selected,
                      label: Text(ref.tag),
                      avatar: selected
                          ? null
                          : CircleAvatar(backgroundImage: NetworkImage(ref.coverUrl)),
                      onSelected: (_) => setState(() {
                        selected ? _selectedTags.remove(ref.tag) : _selectedTags.add(ref.tag);
                      }),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ─── STEP 3: Ayarlar ────────────────────────────────────────────────────

  Widget _buildSettingsStep() {
    final cs = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Ayarlar', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('Üretim tercihlerini seç', style: TextStyle(color: cs.onSurfaceVariant)),
          const SizedBox(height: 20),

          if (_selected.isVideo) ...[
            _sectionLabel('Arka Plan Müziği'),
            const SizedBox(height: 8),
            Row(
              children: [
                _StyleChip(
                  label: 'Yok',
                  icon: Icons.music_off,
                  selected: _musicMode == 'none',
                  onTap: () => setState(() => _musicMode = 'none'),
                ),
                const SizedBox(width: 8),
                _StyleChip(
                  label: 'Hazır',
                  icon: Icons.library_music,
                  selected: _musicMode == 'library',
                  onTap: () => setState(() => _musicMode = 'library'),
                ),
                const SizedBox(width: 8),
                _StyleChip(
                  label: 'AI Üretim',
                  icon: Icons.auto_awesome,
                  selected: _musicMode == 'ai',
                  onTap: () => setState(() => _musicMode = 'ai'),
                ),
              ],
            ),
            if (_musicMode != 'none') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _musicStyleCtrl,
                decoration: const InputDecoration(
                  labelText: 'Müzik tarzı (isteğe bağlı)',
                  hintText: 'Örn: lo-fi sakin, enerjik pop...',
                ),
              ),
            ],
            const SizedBox(height: 20),

            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _voiceLanguage,
                    decoration: const InputDecoration(labelText: 'Ses Dili'),
                    items: const [
                      DropdownMenuItem(value: 'tr', child: Text('Türkçe')),
                      DropdownMenuItem(value: 'kk', child: Text('Қазақша')),
                      DropdownMenuItem(value: 'en', child: Text('English')),
                      DropdownMenuItem(value: 'ru', child: Text('Русский')),
                    ],
                    onChanged: (v) => setState(() => _voiceLanguage = v!),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _voiceGender,
                    decoration: const InputDecoration(labelText: 'Ses'),
                    items: const [
                      DropdownMenuItem(value: 'female', child: Text('Kadın')),
                      DropdownMenuItem(value: 'male', child: Text('Erkek')),
                    ],
                    onChanged: (v) => setState(() => _voiceGender = v!),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            _sectionLabel('Video Tarzı'),
            const SizedBox(height: 8),
            Row(
              children: [
                _StyleChip(
                  label: 'Sakin',
                  icon: Icons.water,
                  selected: _videoStyle == 'calm',
                  onTap: () => setState(() => _videoStyle = 'calm'),
                ),
                const SizedBox(width: 8),
                _StyleChip(
                  label: 'Dinamik',
                  icon: Icons.bolt,
                  selected: _videoStyle == 'dynamic',
                  onTap: () => setState(() => _videoStyle = 'dynamic'),
                ),
              ],
            ),
            const SizedBox(height: 20),

            _sectionLabel('Sahne Sayısı  ·  ${_sceneCount * 10}s video'),
            const SizedBox(height: 8),
            Row(
              children: [2, 3, 4, 5].map((n) {
                final sel = n == _sceneCount;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _StyleChip(
                    label: '$n sahne',
                    selected: sel,
                    onTap: () => setState(() => _sceneCount = n),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),

            _sectionLabel('Video Modeli'),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ('kling_standard', 'Kling Standart', Icons.videocam),
                  ('kling_pro',      'Kling Pro',      Icons.hd),
                  ('sora2',          'Sora 2',         Icons.auto_awesome),
                  ('veo3',           'Veo 3  🔊',      Icons.record_voice_over),
                ].map(((String, String, IconData) m) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _StyleChip(
                    label: m.$2,
                    icon: m.$3,
                    selected: _videoModel == m.$1,
                    onTap: () => setState(() => _videoModel = m.$1),
                  ),
                )).toList(),
              ),
            ),
            const SizedBox(height: 20),
          ],

          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _aspectRatio,
            decoration: const InputDecoration(labelText: 'En/Boy Oranı'),
            items: const [
              DropdownMenuItem(value: '9:16', child: Text('9:16 — Dikey (Reels / TikTok)')),
              DropdownMenuItem(value: '16:9', child: Text('16:9 — Yatay')),
              DropdownMenuItem(value: '1:1', child: Text('1:1 — Kare')),
            ],
            onChanged: (v) => setState(() => _aspectRatio = v!),
          ),
          const SizedBox(height: 20),

          _sectionLabel('Görsel Modeli'),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ('nano_banana',     'Nano Banana',     Icons.image),
                ('nano_banana_pro', 'Nano Banana Pro', Icons.hd),
              ].map(((String, String, IconData) m) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _StyleChip(
                  label: m.$2,
                  icon: m.$3,
                  selected: _imageModel == m.$1,
                  onTap: () => setState(() => _imageModel = m.$1),
                ),
              )).toList(),
            ),
          ),
        ],
      ),
    );
  }

  // ─── STEP 4: Özet ───────────────────────────────────────────────────────

  Widget _buildSummaryStep() {
    final cs = Theme.of(context).colorScheme;

    final rows = <(String, String)>[
      ('İçerik Tipi', _selected.label),
      ('Ürün Adı', _productNameCtrl.text.trim().isEmpty ? '—' : _productNameCtrl.text.trim()),
      if (_videoBriefCtrl.text.trim().isNotEmpty) ('Video Konusu', _videoBriefCtrl.text.trim()),
      if (_selectedTags.isNotEmpty) ('Referanslar', _selectedTags.join(', ')),
      ('En/Boy Oranı', _aspectRatio),
      ('Görsel Modeli', _imageModel == 'nano_banana_pro' ? 'Nano Banana Pro' : 'Nano Banana'),
      if (_selected.isVideo) ...[
        ('Video Tarzı', _videoStyle == 'calm' ? 'Sakin' : 'Dinamik'),
        ('Sahne Sayısı', '$_sceneCount sahne  ·  ~${_sceneCount * 10}s'),
        ('Video Modeli', _videoModelLabel(_videoModel)),
        ('Ses', '${_voiceLanguageLabel(_voiceLanguage)}  ·  ${_voiceGender == 'female' ? 'Kadın' : 'Erkek'}'),
        ('Müzik', _musicMode == 'none' ? 'Yok' : _musicMode == 'library' ? 'Hazır' : 'AI Üretim'),
      ],
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Gözden geçir', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('Her şey doğruysa oluşturmaya başlayabiliriz', style: TextStyle(color: cs.onSurfaceVariant)),
          const SizedBox(height: 20),

          if (_referenceImage != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Image.file(_referenceImage!, fit: BoxFit.cover),
              ),
            ),
            const SizedBox(height: 16),
          ],

          Container(
            decoration: BoxDecoration(
              color: cs.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(16),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                for (int i = 0; i < rows.length; i++) ...[
                  _SummaryRow(label: rows[i].$1, value: rows[i].$2),
                  if (i != rows.length - 1)
                    Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.5)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _videoModelLabel(String v) => switch (v) {
        'kling_standard' => 'Kling Standart',
        'kling_pro' => 'Kling Pro',
        'sora2' => 'Sora 2',
        'veo3' => 'Veo 3',
        _ => v,
      };

  String _voiceLanguageLabel(String v) => switch (v) {
        'tr' => 'Türkçe',
        'kk' => 'Қазақша',
        'en' => 'English',
        'ru' => 'Русский',
        _ => v,
      };
}

// ─── Step progress header ───────────────────────────────────────────────────

class _StepHeader extends StatelessWidget {
  final int step;
  final int total;
  final String title;
  const _StepHeader({required this.step, required this.total, required this.title});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (int i = 0; i < total; i++) ...[
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    height: 4,
                    decoration: BoxDecoration(
                      color: i <= step ? cs.primary : cs.outlineVariant,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                if (i != total - 1) const SizedBox(width: 6),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              Text('${step + 1}/$total',
                  style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── İçerik tipi kartı ───────────────────────────────────────────────────────

class _ContentTypeCard extends StatelessWidget {
  final ContentTypeOption option;
  final bool selected;
  final VoidCallback onTap;
  const _ContentTypeCard({required this.option, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? cs.primary : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Icon(option.icon, color: selected ? cs.onPrimary : cs.onSurfaceVariant, size: 22),
                if (selected) Icon(Icons.check_circle, color: cs.onPrimary, size: 18),
              ],
            ),
            const SizedBox(height: 10),
            Text(option.label,
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: selected ? cs.onPrimary : cs.onSurface)),
            const SizedBox(height: 2),
            Text(
              option.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11,
                  color: selected ? cs.onPrimary.withValues(alpha: 0.85) : cs.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Özet satırı ─────────────────────────────────────────────────────────────

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  const _SheetOption({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final color = destructive ? Colors.red : cs.onSurface;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Row(
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 16),
            Text(
              label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final bool filled;

  const _DashedBorderPainter({required this.color, this.filled = false});

  @override
  void paint(Canvas canvas, Size size) {
    const radius = Radius.circular(12);
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);

    if (filled) {
      canvas.drawRRect(RRect.fromRectAndRadius(rect, radius),
          Paint()..color = Colors.transparent);
      return;
    }

    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(rect, radius));

    const dashWidth = 7.0;
    const dashSpace = 5.0;
    final dashPath = Path();

    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        dashPath.addPath(
          metric.extractPath(distance, distance + dashWidth),
          Offset.zero,
        );
        distance += dashWidth + dashSpace;
      }
    }

    canvas.drawPath(dashPath, paint);
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.color != color || old.filled != filled;
}

// ─── Section label helper ──────────────────────────────────────────────────

Widget _sectionLabel(String text) => Builder(
      builder: (ctx) => Text(
        text,
        style: Theme.of(ctx).textTheme.titleSmall?.copyWith(
              color: Theme.of(ctx).colorScheme.onSurfaceVariant,
            ),
      ),
    );

// ─── Style / count chip ────────────────────────────────────────────────────

class _StyleChip extends StatelessWidget {
  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback onTap;

  const _StyleChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? cs.primary : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15, color: selected ? cs.onPrimary : cs.onSurfaceVariant),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? cs.onPrimary : cs.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
