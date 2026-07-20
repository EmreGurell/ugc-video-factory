import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/reference_folder.dart';
import '../models/reference_photo.dart';
import '../services/api_service.dart';

/// Etiketli referans kütüphanesi: her etiket bir "klasör", içine birden
/// fazla fotoğraf veya videodan seçilmiş kare eklenebilir. AI bu klasörü
/// görsel üretiminde gerçek referans olarak kullanır (elle seçim veya
/// otomatik eşleştirme).
class ReferenceLibraryScreen extends StatefulWidget {
  const ReferenceLibraryScreen({super.key});

  @override
  State<ReferenceLibraryScreen> createState() => _ReferenceLibraryScreenState();
}

class _ReferenceLibraryScreenState extends State<ReferenceLibraryScreen> {
  final _api = const ApiService();
  List<ReferenceFolder> _folders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final photos = await _api.listReferences();
      if (!mounted) return;
      setState(() {
        _folders = ReferenceFolder.groupByTag(photos);
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addNew() async {
    final added = await showAddReferenceFlow(context, _api);
    if (added) _load();
  }

  Future<void> _openFolder(ReferenceFolder folder) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ReferenceFolderScreen(tag: folder.tag)),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Referanslar'),
        centerTitle: false,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addNew,
        icon: const Icon(Icons.create_new_folder_outlined),
        label: const Text('Referans Ekle'),
        elevation: 0,
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _folders.isEmpty
              ? _EmptyLibrary(cs: cs)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: GridView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 0.85,
                    ),
                    itemCount: _folders.length,
                    itemBuilder: (ctx, i) => _FolderCard(
                      folder: _folders[i],
                      onTap: () => _openFolder(_folders[i]),
                    ),
                  ),
                ),
    );
  }
}

// ─── Klasör kartı (ana grid) ────────────────────────────────────────────────

class _FolderCard extends StatelessWidget {
  final ReferenceFolder folder;
  final VoidCallback onTap;
  const _FolderCard({required this.folder, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Yığın (stack) efekti: arkada 1-2 kart kenarı görünür
                  if (folder.count > 1)
                    Positioned(
                      top: 6, left: 6, right: -6, bottom: -6,
                      child: Container(
                        decoration: BoxDecoration(
                          color: cs.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  Positioned.fill(
                    child: Image.network(
                      folder.coverUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        color: cs.surfaceContainerHighest,
                        child: Icon(Icons.broken_image_outlined, color: cs.onSurfaceVariant),
                      ),
                    ),
                  ),
                  if (folder.count > 1)
                    Positioned(
                      top: 8, right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text('${folder.count}',
                            style: const TextStyle(
                                color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(Icons.folder_outlined, size: 15, color: cs.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      folder.tag,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Klasör detayı ──────────────────────────────────────────────────────────

class ReferenceFolderScreen extends StatefulWidget {
  final String tag;
  const ReferenceFolderScreen({super.key, required this.tag});

  @override
  State<ReferenceFolderScreen> createState() => _ReferenceFolderScreenState();
}

class _ReferenceFolderScreenState extends State<ReferenceFolderScreen> {
  final _api = const ApiService();
  List<ReferencePhoto> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final all = await _api.listReferences();
      if (!mounted) return;
      setState(() {
        _items = all.where((p) => p.tag == widget.tag).toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addMore() async {
    final added = await showAddReferenceFlow(context, _api, fixedTag: widget.tag);
    if (added) _load();
  }

  Future<void> _deleteItem(ReferencePhoto item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bu öğe silinsin mi?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sil')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await _api.deleteReferenceItem(item.id);
      await _load();
      if (mounted && _items.isEmpty) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Hata: $e')));
      }
    }
  }

  Future<void> _deleteFolder() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('"${widget.tag}" klasörü tamamen silinsin mi?'),
        content: Text('${_items.length} öğe kalıcı olarak silinecek.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sil')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await _api.deleteReference(widget.tag);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Hata: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tag),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: _deleteFolder,
            tooltip: 'Klasörü sil',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addMore,
        icon: const Icon(Icons.add_photo_alternate_outlined),
        label: const Text('Ekle'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1,
              ),
              itemCount: _items.length,
              itemBuilder: (ctx, i) => _ItemCard(
                item: _items[i],
                onDelete: () => _deleteItem(_items[i]),
                cs: cs,
              ),
            ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  final ReferencePhoto item;
  final VoidCallback onDelete;
  final ColorScheme cs;
  const _ItemCard({required this.item, required this.onDelete, required this.cs});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.network(
            item.url,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Container(
              color: cs.surfaceContainerHighest,
              child: Icon(Icons.broken_image_outlined, color: cs.onSurfaceVariant),
            ),
          ),
          Positioned(
            top: 6, right: 6,
            child: Material(
              color: Colors.black.withValues(alpha: 0.45),
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onDelete,
                child: const Padding(
                  padding: EdgeInsets.all(6),
                  child: Icon(Icons.delete_outline, size: 18, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Ekleme akışı (tag[+kaynak] veya sabit tag'e yeni öğe) ────────────────

enum _AddSource { gallery, camera, video }

/// Kaynak seçim diyaloğu + upload/video-kare akışını yürütür.
/// [fixedTag] verilirse tag alanı gösterilmez (mevcut klasöre ekleme).
/// Bir şey eklenirse `true` döner.
Future<bool> showAddReferenceFlow(
  BuildContext context,
  ApiService api, {
  String? fixedTag,
}) async {
  final tagCtrl = TextEditingController(text: fixedTag);
  _AddSource? source;

  final confirmed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
      ),
      child: StatefulBuilder(
        builder: (ctx, setSheetState) {
          final cs = Theme.of(ctx).colorScheme;
          final canContinue = tagCtrl.text.trim().isNotEmpty && source != null;
          return SafeArea(
            top: false,
            child: Container(
              decoration: BoxDecoration(
                color: cs.surface,
                borderRadius: BorderRadius.circular(20),
              ),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: cs.outlineVariant,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Text(
                    fixedTag == null ? 'Referans Ekle' : '"$fixedTag" Klasörüne Ekle',
                    style: Theme.of(ctx).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'AI, videolarında bu gerçek görüntüyü kullanabilsin',
                    style: TextStyle(color: cs.onSurfaceVariant),
                  ),
                  const SizedBox(height: 20),
                  if (fixedTag == null) ...[
                    TextField(
                      controller: tagCtrl,
                      autofocus: true,
                      onChanged: (_) => setSheetState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Etiket',
                        hintText: 'Örn: kedi, dukkan, ben...',
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                  _SourceOption(
                    icon: Icons.photo_library_outlined,
                    label: 'Galeriden Fotoğraf',
                    description: 'Mevcut bir fotoğraf seç',
                    selected: source == _AddSource.gallery,
                    onTap: () => setSheetState(() => source = _AddSource.gallery),
                  ),
                  const SizedBox(height: 10),
                  _SourceOption(
                    icon: Icons.camera_alt_outlined,
                    label: 'Kamera',
                    description: 'Şimdi bir fotoğraf çek',
                    selected: source == _AddSource.camera,
                    onTap: () => setSheetState(() => source = _AddSource.camera),
                  ),
                  const SizedBox(height: 10),
                  _SourceOption(
                    icon: Icons.movie_creation_outlined,
                    label: 'Videodan Kare Seç',
                    description: 'Bir videodan en iyi kareyi seç',
                    selected: source == _AddSource.video,
                    onTap: () => setSheetState(() => source = _AddSource.video),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Vazgeç'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 2,
                        child: FilledButton(
                          onPressed: canContinue ? () => Navigator.pop(ctx, true) : null,
                          child: const Text('Devam'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ),
  );

  if (confirmed != true || source == null) return false;
  final tag = tagCtrl.text.trim().toLowerCase();
  if (!context.mounted) return false;

  if (source == _AddSource.video) {
    return _addFromVideo(context, api, tag);
  }
  return _addFromPhoto(context, api, tag, source == _AddSource.camera);
}

Future<bool> _addFromPhoto(
  BuildContext context,
  ApiService api,
  String tag,
  bool camera,
) async {
  final picker = ImagePicker();
  final picked = await picker.pickImage(
    source: camera ? ImageSource.camera : ImageSource.gallery,
    imageQuality: 92,
  );
  if (picked == null) return false;
  if (!context.mounted) return false;

  return _runWithProgress(context, () async {
    await api.uploadReference(tag, File(picked.path));
  });
}

Future<bool> _addFromVideo(BuildContext context, ApiService api, String tag) async {
  final picker = ImagePicker();
  final pickedVideo = await picker.pickVideo(source: ImageSource.gallery);
  if (pickedVideo == null) return false;
  if (!context.mounted) return false;

  List<String>? frames;
  final ok = await _runWithProgress(context, () async {
    frames = await api.extractFrames(File(pickedVideo.path));
  }, message: 'Video işleniyor...');
  if (!ok || frames == null || frames!.isEmpty) return false;
  if (!context.mounted) return false;

  final chosen = await _pickFrame(context, frames!);
  if (chosen == null) return false;
  if (!context.mounted) return false;

  return _runWithProgress(context, () async {
    await api.confirmFrame(tag, chosen);
  });
}

/// Kare ızgarası: kullanıcı videodan çıkarılan adaylardan birini seçer.
Future<String?> _pickFrame(BuildContext context, List<String> frameUrls) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollController) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('En iyi kareyi seçin',
                style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Videodan çıkarılan ${frameUrls.length} kareden birine dokunun',
              style: TextStyle(color: Theme.of(ctx).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: GridView.builder(
                controller: scrollController,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 0.75,
                ),
                itemCount: frameUrls.length,
                itemBuilder: (ctx, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: () => Navigator.pop(ctx, frameUrls[i]),
                    child: Ink.image(
                      image: NetworkImage(frameUrls[i]),
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// İşlem sırasında bir yükleniyor diyaloğu gösterir; başarı/başarısızlık döner.
Future<bool> _runWithProgress(
  BuildContext context,
  Future<void> Function() action, {
  String message = 'Yükleniyor...',
}) async {
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      content: Row(
        children: [
          const SizedBox(
            width: 20, height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 16),
          Text(message),
        ],
      ),
    ),
  );

  try {
    await action();
    if (context.mounted) Navigator.pop(context);
    return true;
  } catch (e) {
    if (context.mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Hata: $e')));
    }
    return false;
  }
}

class _SourceOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  const _SourceOption({
    required this.icon,
    required this.label,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? cs.primary.withValues(alpha: 0.08) : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? cs.primary : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: selected ? cs.primary : cs.surface,
              child: Icon(icon, size: 19, color: selected ? cs.onPrimary : cs.onSurfaceVariant),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(description, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                ],
              ),
            ),
            Icon(
              selected ? Icons.check_circle : Icons.circle_outlined,
              color: selected ? cs.primary : cs.outlineVariant,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyLibrary extends StatelessWidget {
  final ColorScheme cs;
  const _EmptyLibrary({required this.cs});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: cs.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.photo_album_outlined,
                  size: 48, color: cs.onPrimaryContainer),
            ),
            const SizedBox(height: 20),
            Text('Referans kütüphanesi boş',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              'Kedin, dükkanın ya da kendin için etiketli klasörler oluştur — '
              'fotoğraf veya video ekle, AI videolarda gerçek görüntüyü kullansın.',
              textAlign: TextAlign.center,
              style: TextStyle(color: cs.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
